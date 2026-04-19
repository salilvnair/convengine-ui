/**
 * Client-side graph executor for the builder studio.
 *
 * Walks the canvas (nodes + edges) starting from `starter`, producing an
 * output per node. Control-flow and simple utility blocks run in JS here in
 * the browser; anything that needs server access (LLM, DB, HTTP-from-server)
 * hops to the convengine backend. The only block currently forwarded is
 * `agent` (→ `/api/v1/builder-studio/agent`); add more cases below as needed.
 *
 * This deliberately does NOT go through the conversation/message endpoint —
 * we don't want intent detection, MCP routing, or semantic pipelines
 * interfering with a direct graph execution.
 *
 * Parallelism: sibling downstream branches (multiple outgoing edges from the
 * same node, or multiple nodes with all dependencies satisfied) are
 * dispatched concurrently via Promise.all. Execution order within a single
 * chain is still sequential because downstream nodes read from upstream
 * outputs.
 */
import { runAgent } from '../api/run-client'
import { callTool as callMcpTool } from '../mcp/mcp-client'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useWorkflowStore } from '../stores/workflow-store'

export async function executeGraph({ workflow, inputs, onProgress }) {
  const { nodes = [], edges = [], subBlockValues = {} } = workflow
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const outgoing = groupBy(edges, 'source')
  const incoming = groupBy(edges, 'target')
  const outputs = {}     // nodeId -> output value
  const trace = []       // ordered
  const started = new Set()
  /**
   * Branching nodes record the chosen output-handle id here so that
   * downstream readiness can skip edges leaving non-matching handles.
   * Regular nodes (any single-output block) don't set this.
   */
  const chosenHandle = {} // nodeId -> string | null

  // Seed user_input + starter nodes and emit lifecycle events so the canvas
  // marks them green alongside the agent/response nodes. Previously these
  // two block types were seeded silently, which is why the URL and Start
  // cards never flipped to the "done" state after a run.
  for (const n of nodes) {
    if (n.data?.blockType === 'user_input') {
      outputs[n.id] = inputs[n.id] ?? ''
      trace.push({
        nodeId: n.id,
        blockType: 'user_input',
        title: n.data?.title,
        input: null,
        output: outputs[n.id],
        ms: 0,
        meta: { source: 'RunPanel input', value: outputs[n.id] },
      })
      started.add(n.id)
      onProgress?.({ type: 'start', nodeId: n.id, blockType: 'user_input' })
      try { useWorkflowStore.getState().recordNodeOutput(n.id, outputs[n.id]) } catch { /* ignore */ }
      onProgress?.({ type: 'done', nodeId: n.id, blockType: 'user_input', output: outputs[n.id] })
    } else if (n.data?.blockType === 'starter') {
      outputs[n.id] = null
      trace.push({
        nodeId: n.id, blockType: 'starter', title: n.data?.title,
        input: null, output: null, ms: 0, meta: { source: 'graph root' },
      })
      started.add(n.id)
      onProgress?.({ type: 'start', nodeId: n.id, blockType: 'starter' })
      onProgress?.({ type: 'done', nodeId: n.id, blockType: 'starter', output: null })
    }
  }

  // BFS with readiness gating. An incoming edge is "satisfied" when:
  //  (a) its source node has finished, AND
  //  (b) either the source was a single-output block (no chosenHandle),
  //      OR the edge's sourceHandle matches the chosen branch.
  // This is how if_else / if_elseif_else / switch_case suppress the losing
  // branches without a separate pruning pass.
  const edgeIsLive = (e) => {
    if (!started.has(e.source)) return false
    const chosen = chosenHandle[e.source]
    if (chosen == null) return true
    const sh = e.sourceHandle || 'out'
    return sh === chosen
  }
  while (true) {
    const ready = nodes.filter((n) => {
      if (started.has(n.id)) return false
      const ins = incoming[n.id] || []
      if (ins.length === 0) return false
      return ins.every(edgeIsLive)
    })
    if (ready.length === 0) break

    await Promise.all(ready.map(async (n) => {
      started.add(n.id)
      const t0 = performance.now()
      const upstream = (incoming[n.id] || []).map((e) => outputs[e.source])
      const input = upstream.length <= 1 ? upstream[0] : upstream
      const values = subBlockValues[n.id] || {}
      onProgress?.({ type: 'start', nodeId: n.id, blockType: n.data?.blockType, title: n.data?.title, values })
      try {
        const ran = await runNode({ node: n, values, input, outputs })
        // runNode may return either a raw value or `{ __meta, value }` so that
        // agent/mcp blocks can attach rich debugging info (systemPrompt,
        // userPrompt after interpolation, skill output, model, etc.). The meta
        // is carried through to both the trace and the onProgress `done`
        // event so the Debug panel can expand a row and show everything.
        let output = ran
        let meta
        if (ran && typeof ran === 'object' && ran.__meta) {
          meta = ran.__meta
          output = ran.value
        }
        if (output && typeof output === 'object' && typeof output.branch === 'string') {
          chosenHandle[n.id] = output.branch
          outputs[n.id] = output.value
        } else {
          outputs[n.id] = output
        }
        try { useWorkflowStore.getState().recordNodeOutput(n.id, outputs[n.id]) } catch { /* ignore */ }
        trace.push({
          nodeId: n.id,
          blockType: n.data?.blockType,
          title: n.data?.title,
          input,
          output,            // raw value, no truncation (UI truncates for the collapsed preview)
          values,            // the user-authored sub-block values for this node
          meta,              // per-block rich metadata (prompts after templating, etc.)
          ms: Math.round(performance.now() - t0),
        })
        onProgress?.({
          type: 'done', nodeId: n.id, blockType: n.data?.blockType, title: n.data?.title,
          output, meta, values, ms: Math.round(performance.now() - t0),
        })
      } catch (err) {
        const errorDetail = {
          message: err.message || String(err),
          ...(err.url && { url: err.url }),
          ...(err.method && { method: err.method }),
          ...(err.status && { status: err.status }),
          ...(err.statusText && { statusText: err.statusText }),
          ...(err.responseBody && { responseBody: err.responseBody }),
        }
        trace.push({
          nodeId: n.id,
          blockType: n.data?.blockType,
          title: n.data?.title,
          input,
          values,
          error: err.message || String(err),
          errorDetail,
          ms: Math.round(performance.now() - t0),
        })
        onProgress?.({
          type: 'error', nodeId: n.id, blockType: n.data?.blockType, title: n.data?.title,
          error: err.message || String(err), errorDetail,
        })
        throw err
      }
    }))
  }

  // Final output = the response node's output, or the last produced value.
  const responseNode = nodes.find((n) => n.data?.blockType === 'response')
  const finalOutput = responseNode ? outputs[responseNode.id] : trace[trace.length - 1]?.output
  return { output: finalOutput, trace }
}

/* ------------------------------------------------------------------------- */
/* Per-block execution                                                        */
/* ------------------------------------------------------------------------- */

async function runNode({ node, values, input, outputs }) {
  const type = node.data?.blockType
  switch (type) {
    case 'starter':
    case 'user_input':
      return outputs[node.id] // already seeded
    case 'response':
      return interpolate(values.data ?? '', outputs, input)
    case 'agent':
      return await runAgentNode({ node, values, input })
    case 'mcp':
      return await runMcpNode({ values, input })
    case 'function':
      return runFunctionNode({ values, input })
    case 'if_else':
      return runIfElseNode({ values, input })
    case 'if_elseif_else':
      return runIfElseIfElseNode({ values, input })
    case 'switch':
      return runSwitchNode({ values, input })
    case 'for_loop':
    case 'for_each':
      // Placeholder — loop expansion is a bigger feature; for now pass through.
      return input
    case 'json_validator':
      return runJsonValidator({ values, input })
    case 'save_to_files':
      return runSaveToFiles({ values, input })
    case 'show_preview':
      // Preview-only sink — pass the upstream payload through untouched so
      // the card's json-preview body can render it (see WorkflowNode).
      return input
    default:
      // Unknown block type: pass input through so the graph keeps moving.
      return input
  }
}

async function runAgentNode({ node, values, input }) {
  let inputStr = typeof input === 'string' ? input : JSON.stringify(input ?? '')
  const skillRuns = [] // each: { skillId, name, params, output, error }

  // ─── Client-side skill execution ────────────────────────────────────────
  // Skills in convengine are small JS functions stored in the workspace. The
  // backend currently doesn't wire them into LLM tool-calling, so we run any
  // attached skill here in the browser and feed the skill's output as the
  // agent's input. That's how the demo ("URL → extract → summarize") works
  // end-to-end without asking the LLM to hallucinate page content.
  //
  // `values.skills` (new field) or legacy `values.tools` — both are JSON
  // arrays of skill ids. The first skill whose id resolves gets run on the
  // current input.
  const skillIds = [
    ...(safeJsonArray(values.skills)),
    ...(safeJsonArray(values.tools)),
  ]
  /**
   * `bag` holds every field the userPrompt's `{{foo}}` templates can reference.
   * Seeded with the raw input, then each skill output (if object-shaped) is
   * merged in. The summarizer's prompt uses `{{title}}` and `{{text}}`; the
   * extractor's prompt uses `{{url}}` — none of which were previously
   * substituted, which is why the LLM saw literal `{{url}}` and replied
   * "No URL provided."
   */
  const bag = looksLikeUrl(inputStr) ? { url: inputStr, input: inputStr } : { input: inputStr }
  // When the upstream output is a JSON object string, merge its keys into
  // the bag so that templates like {{title}}, {{text}}, etc. resolve.
  // This is what lets the Summarizer's `{{title}}` and `{{text}}` pick up
  // fields from the Extractor's JSON output.
  try {
    const parsed = JSON.parse(inputStr)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) bag[k] = v
    }
  } catch { /* not JSON — that's fine, bag already has `input` */ }
  if (skillIds.length > 0) {
    const skills = useWorkspaceStore.getState().skills || []
    for (const sid of skillIds) {
      const skill = skills.find((s) => s.id === sid)
      if (!skill) continue
      const params = looksLikeUrl(inputStr) ? { url: inputStr, input: inputStr } : { input: inputStr }
      try {
        const out = await runSkillSource(skill, inputStr)
        inputStr = typeof out === 'string' ? out : JSON.stringify(out)
        if (out && typeof out === 'object' && !Array.isArray(out)) {
          for (const [k, v] of Object.entries(out)) bag[k] = v
        }
        bag.input = inputStr
        skillRuns.push({ skillId: sid, name: skill.name, params, output: out })
      } catch (e) {
        inputStr = JSON.stringify({ skillError: e.message || String(e), input: inputStr })
        bag.skillError = e.message || String(e)
        bag.input = inputStr
        skillRuns.push({ skillId: sid, name: skill.name, params, error: e.message || String(e) })
      }
    }
  }

  const agent = {
    id: node.id,
    model: values.model || 'gpt-4o-mini',
    temperature: values.temperature,
    systemPrompt: interpolateBag(values.systemPrompt || '', bag),
    userPrompt: interpolateBag(values.userPrompt || '{{input}}', bag),
    responseFormat: values.responseFormat || null,
    strictOutput: values.strictOutput === true,
    skills: skillIds,
  }
  const res = await runAgent({ agent, input: inputStr })
  return {
    __meta: {
      model: agent.model,
      temperature: agent.temperature,
      systemPrompt: agent.systemPrompt,
      userPrompt: agent.userPrompt,
      skillIds,
      skillRuns,
      templateBag: bag,
      rawAgentResponse: res,
    },
    value: res.output,
  }
}

/**
 * Execute a workspace skill's JS source string with a single `params` arg.
 * The demo `sk_url_extract` expects `{ url }`, so we shape input into that
 * form when the upstream is a URL-like string. For anything else we pass
 * `{ input }` and let the skill destructure whatever it needs.
 */
async function runSkillSource(skill, inputStr) {
  const params = looksLikeUrl(inputStr)
    ? { url: inputStr, input: inputStr }
    : { input: inputStr }
  // eslint-disable-next-line no-new-func
  const fn = new Function('params', skill.source)
  const result = await fn(params)
  return result
}

/**
 * Substitute every `{{key}}` in `template` with `bag[key]`. Stringifies
 * object values so the LLM gets readable JSON. Leaves unresolved tokens
 * untouched so authors can spot template typos in the log.
 */
function interpolateBag(template, bag) {
  if (!template) return ''
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => {
    if (!(k in bag)) return m
    const v = bag[k]
    if (v == null) return ''
    return typeof v === 'string' ? v : JSON.stringify(v)
  })
}

function looksLikeUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim())
}

function safeJsonArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v !== 'string') return []
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
}

/**
 * Invoke an MCP tool via the convengine backend.
 *
 * The `mcp` block has three subBlock values:
 *   - `server`     — server id selected in the dropdown (from /api/v1/mcp/servers)
 *   - `tool`       — tool name on that server
 *   - `arguments`  — JSON-string (from the JsonEditor) matching the tool's
 *                    inputSchema; we also substitute `{{input}}` with the
 *                    upstream output so a preceding block's text can flow into
 *                    a tool call.
 *
 * Returns whatever the server returns under `result` (typically an MCP
 * content array like `[{ type: 'text', text: '...' }, ...]`).
 */
async function runMcpNode({ values, input }) {
  const serverId = values.server
  const tool = values.tool
  if (!serverId) throw new Error('MCP block: no server selected')
  if (!tool) throw new Error('MCP block: no tool selected')

  let args = values.arguments
  if (typeof args === 'string') {
    // Pre-substitute {{input}} so tool args can reference upstream output.
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input ?? '')
    args = args.replace(/\{\{\s*input\s*\}\}/g, inputStr.replace(/"/g, '\\"'))
    try { args = args.trim() ? JSON.parse(args) : {} }
    catch (e) { throw new Error(`MCP block: arguments is not valid JSON — ${e.message}`) }
  }
  args = args || {}

  const resp = await callMcpTool(serverId, tool, args)
  return resp?.result
}

function runFunctionNode({ values, input }) {
  const src = values.code || 'return input'
  // eslint-disable-next-line no-new-func
  const fn = new Function('input', 'values', src)
  return fn(input, values)
}

function runIfElseNode({ values, input }) {
  // `expression` is authored in the Inspector; legacy canvases used `condition`.
  const expr = values.expression || values.condition || 'true'
  const truthy = !!eval_safe(expr, input)
  return { branch: truthy ? 'true' : 'false', value: input }
}

/**
 * Walk the `conditions` table top-to-bottom; first truthy row picks the
 * corresponding `branch_<i>` handle. Falls through to `else` if nothing matches.
 * Row shape is either `{ label, expression }` (from the Inspector table) or
 * `[label, expression]` (raw tuple).
 */
function runIfElseIfElseNode({ values, input }) {
  const rows = Array.isArray(values.conditions) ? values.conditions : []
  const n = Math.max(1, Math.min(8, Number(values.branches) || rows.length || 2))
  for (let i = 0; i < n; i++) {
    const row = rows[i]
    if (!row) continue
    const expr = row.expression ?? row[1]
    if (!expr) continue
    if (eval_safe(expr, input)) {
      return { branch: `branch_${i + 1}`, value: input }
    }
  }
  return { branch: 'else', value: input }
}

function runSwitchNode({ values, input }) {
  const keyVal = values.keyExpr ? eval_safe(values.keyExpr, input) : input
  const key = String(keyVal)
  const cases = Array.isArray(values.cases) ? values.cases : []
  const n = Math.max(1, Math.min(12, Number(values.caseCount) || cases.length || 3))
  for (let i = 0; i < Math.min(n, cases.length); i++) {
    const c = cases[i]
    const match = c.value ?? c.match ?? c[0]
    if (match != null && String(match) === key) {
      return { branch: `case_${i + 1}`, value: input }
    }
  }
  return { branch: 'default', value: input }
}

/**
 * Save-to-Files: optionally triggers a browser download with the upstream
 * payload, and always passes the payload through so downstream (or the
 * inline json-preview area on the card) can see it.
 */
function runSaveToFiles({ values, input }) {
  const fmt = values.format || 'json'
  const body = fmt === 'raw' || typeof input === 'string'
    ? (typeof input === 'string' ? input : JSON.stringify(input))
    : JSON.stringify(input, null, 2)
  const result = { savedAt: null, bytes: body.length, payload: input }
  const path = (values.path || '').trim()
  if (path) {
    try {
      const blob = new Blob([body], { type: fmt === 'raw' ? 'text/plain' : 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.replace(/^.*[\\/]/, '') || 'output.json'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      result.savedAt = path
    } catch (e) {
      result.error = e.message || String(e)
    }
  }
  return input // pass-through so the preview area shows the actual payload
}

function runJsonValidator({ values, input }) {
  let parsed
  try { parsed = typeof input === 'string' ? JSON.parse(input) : input }
  catch { return { valid: false, errors: ['input is not valid JSON'] } }
  const rules = Array.isArray(values.rules) ? values.rules : []
  const errors = []
  for (const r of rules) {
    const path = r.path ?? r[0]
    const rule = r.rule ?? r[1]
    const expected = r.value ?? r[2]
    const got = jsonPath(parsed, path)
    if (rule === 'exists' && got === undefined) errors.push(`${path} missing`)
    if (rule === 'equals' && String(got) !== String(expected)) errors.push(`${path} !== ${expected}`)
    if (rule === 'type' && typeof got !== String(expected)) errors.push(`${path} not a ${expected}`)
  }
  return { valid: errors.length === 0, errors, value: parsed }
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function groupBy(arr, key) {
  const out = {}
  for (const item of arr) (out[item[key]] ||= []).push(item)
  return out
}

function interpolate(template, outputs, input) {
  if (!template) return ''
  return String(template)
    .replace(/\{\{\s*input\s*\}\}/g, typeof input === 'string' ? input : JSON.stringify(input ?? ''))
    .replace(/<([a-zA-Z0-9_]+)\.output>/g, (_, id) => {
      const v = outputs[id]
      return typeof v === 'string' ? v : JSON.stringify(v ?? '')
    })
}

function safeJson(s) { if (typeof s !== 'string') return s; try { return JSON.parse(s) } catch { return null } }
function preview(v) {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 280 ? s.slice(0, 280) + '…' : s
}
function jsonPath(obj, path) {
  if (!path) return undefined
  const parts = String(path).replace(/^\$\.?/, '').split('.').filter(Boolean)
  return parts.reduce((a, k) => (a == null ? a : a[k]), obj)
}
function eval_safe(expr, input) { try { return new Function('input', `return (${expr})`)(input) } catch { return undefined } }
