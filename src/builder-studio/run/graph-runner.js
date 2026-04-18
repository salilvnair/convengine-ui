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

export async function executeGraph({ workflow, inputs, onProgress }) {
  const { nodes = [], edges = [], subBlockValues = {} } = workflow
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const outgoing = groupBy(edges, 'source')
  const incoming = groupBy(edges, 'target')
  const outputs = {}     // nodeId -> output value
  const trace = []       // ordered
  const started = new Set()

  // Seed user_input nodes directly from the RunModal-collected values.
  for (const n of nodes) {
    if (n.data?.blockType === 'user_input') {
      outputs[n.id] = inputs[n.id] ?? ''
      trace.push({ nodeId: n.id, blockType: 'user_input', input: null, output: outputs[n.id] })
      started.add(n.id)
    }
  }

  // Starter is a no-op pass-through.
  for (const n of nodes) {
    if (n.data?.blockType === 'starter') {
      outputs[n.id] = null
      started.add(n.id)
    }
  }

  // BFS with readiness gating: schedule a node when all incoming upstream
  // nodes have produced an output. Batches are dispatched in parallel.
  while (true) {
    const ready = nodes.filter((n) => {
      if (started.has(n.id)) return false
      const ins = incoming[n.id] || []
      return ins.every((e) => started.has(e.source))
    })
    if (ready.length === 0) break

    await Promise.all(ready.map(async (n) => {
      started.add(n.id)
      const t0 = performance.now()
      const upstream = (incoming[n.id] || []).map((e) => outputs[e.source])
      const input = upstream.length <= 1 ? upstream[0] : upstream
      const values = subBlockValues[n.id] || {}
      onProgress?.({ type: 'start', nodeId: n.id, blockType: n.data?.blockType })
      try {
        const output = await runNode({ node: n, values, input, outputs })
        outputs[n.id] = output
        trace.push({
          nodeId: n.id,
          blockType: n.data?.blockType,
          title: n.data?.title,
          input,
          output: preview(output),
          ms: Math.round(performance.now() - t0),
        })
        onProgress?.({ type: 'done', nodeId: n.id, output })
      } catch (err) {
        trace.push({
          nodeId: n.id,
          blockType: n.data?.blockType,
          title: n.data?.title,
          input,
          error: err.message || String(err),
          ms: Math.round(performance.now() - t0),
        })
        onProgress?.({ type: 'error', nodeId: n.id, error: err })
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
    case 'switch':
      return runSwitchNode({ values, input })
    case 'for_loop':
    case 'for_each':
      // Placeholder — loop expansion is a bigger feature; for now pass through.
      return input
    case 'json_validator':
      return runJsonValidator({ values, input })
    default:
      // Unknown block type: pass input through so the graph keeps moving.
      return input
  }
}

async function runAgentNode({ node, values, input }) {
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input ?? '')
  const agent = {
    id: node.id,
    model: values.model || 'gpt-4o-mini',
    temperature: values.temperature,
    systemPrompt: values.systemPrompt || '',
    userPrompt: interpolate(values.userPrompt || '{{input}}', {}, inputStr),
    responseFormat: values.responseFormat || null,
    // Routes the backend to LlmClient.generateJsonStrict() (OpenAI
    // `response_format: { type: "json_schema", strict: true }`) when true.
    strictOutput: values.strictOutput === true,
    tools: safeJson(values.tools) || [],
  }
  const res = await runAgent({ agent, input: inputStr })
  return res.output
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
  const expr = values.condition || 'true'
  // eslint-disable-next-line no-new-func
  const fn = new Function('input', `return (${expr})`)
  const truthy = !!fn(input)
  return { branch: truthy ? 'true' : 'false', value: input }
}

function runSwitchNode({ values, input }) {
  const key = values.key ? String(eval_safe(values.key, input)) : String(input)
  const cases = Array.isArray(values.cases) ? values.cases : []
  const match = cases.find((c) => String(c.value ?? c[0]) === key)
  return { branch: match ? (match.label ?? match[1]) : 'default', value: input }
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
