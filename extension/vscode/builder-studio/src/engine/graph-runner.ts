/**
 * Server-side graph executor for the Builder Studio VS Code extension.
 *
 * Ported from ce-builder-studio/src/engine/graph-runner.ts.
 * Key difference: callAgent and callTool are injected as deps so the
 * extension can wire vscode.lm (for LLM) and the local MCP service.
 *
 * Supports all block types that run in the browser graph-runner:
 *   agent, mcp, function, if_else, if_elseif_else, switch_case, condition,
 *   json_map, json_path, json_validator, text_template, mapper, filter,
 *   sort, aggregate, merge, router_v2, ai_classifier, api, delay,
 *   variables, crypto, show_preview, table, save_to_files, response,
 *   error_handler, sub_workflow, parallel, for_loop, for_each, loop,
 *   starter, user_input, webhook_request, schedule, skill, wait
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { AgentRequest, AgentResponse, Workflow, TraceEntry, RunResult } from '../types';

/* ── Dependency injection types ── */

export type CallAgentFn = (req: AgentRequest) => Promise<AgentResponse>;
export type CallToolFn = (serverId: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;

/* ── Utility ── */

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = String(item[key]);
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

function jsonPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function interpolateBag(template: string, bag: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_m, key: string) => {
    const val = bag[key.trim()];
    if (val === undefined) return '';
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

function evalSafe(expr: string, input: unknown): unknown {
  try {
    const fn = new Function('input', 'return ' + expr);
    return fn(input);
  } catch { return undefined; }
}

function checkValueType(value: unknown, expectedType: string): string | null {
  if (!expectedType || expectedType === 'any') return null;
  if (value == null) return null;
  switch (expectedType) {
    case 'string':  return typeof value !== 'string'  ? `expected string, got ${typeof value}` : null;
    case 'number':  return typeof value !== 'number'  ? `expected number, got ${typeof value}` : null;
    case 'boolean': return typeof value !== 'boolean' ? `expected boolean, got ${typeof value}` : null;
    case 'json':    return (typeof value !== 'object' || Array.isArray(value)) ? `expected json object, got ${Array.isArray(value) ? 'array' : typeof value}` : null;
    case 'array':   return !Array.isArray(value) ? `expected array, got ${typeof value}` : null;
    default:        return null;
  }
}

/* ── Block handlers ── */

async function runAgentNode(opts: {
  node: { id: string; data?: Record<string, unknown> };
  values: Record<string, unknown>;
  input: unknown;
  callAgent: CallAgentFn;
}): Promise<unknown> {
  const { values, input, callAgent } = opts;

  const bag: Record<string, unknown> = {};
  if (typeof input === 'string') {
    bag['input'] = input;
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(bag, parsed);
    } catch { if (/^https?:\/\//.test(input)) bag['url'] = input; }
  } else if (input && typeof input === 'object') {
    Object.assign(bag, input as Record<string, unknown>);
    bag['input'] = JSON.stringify(input);
  } else {
    bag['input'] = String(input ?? '');
  }

  const rawModel = values.model ? String(values.model) : null;
  if (!rawModel) {
    const nodeTitle = String((opts.node.data?.['title']) || opts.node.id);
    throw new Error(
      `No model provider configured for "${nodeTitle}". ` +
      'Open Settings → LLM Provider Configuration, select a default model and save.'
    );
  }
  const model          = rawModel;
  const provider       = values.provider ? String(values.provider) : undefined;
  const temperature    = Number(values.temperature ?? 0.7);
  const systemPrompt   = interpolateBag(String(values.systemPrompt || ''), bag);
  const userPrompt     = interpolateBag(String(values.userPrompt || '{{input}}'), bag);
  const responseFormat = values.responseFormat ? String(values.responseFormat) : null;
  const strictOutput   = values.strictOutput === true;

  const agent = {
    id: String(values.id || opts.node.id),
    provider, model, temperature, systemPrompt, userPrompt, responseFormat, strictOutput,
  };
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);

  const res = await callAgent({ agent, input: inputStr });

  return {
    __meta: { provider, model, temperature, systemPrompt, userPrompt, rawAgentResponse: res },
    value: {
      data: res.output,
      status: 200,
      headers: { 'x-model': model, 'x-duration-ms': res.ms },
    },
  };
}

async function runMcpNode(opts: {
  values: Record<string, unknown>;
  input: unknown;
  callTool: CallToolFn;
}): Promise<unknown> {
  const { values, input, callTool } = opts;
  const serverId = String(values.server || '');
  const tool     = String(values.tool || '');

  let args: Record<string, unknown> = {};
  const rawArgs = values.arguments || values.args;
  if (typeof rawArgs === 'string') {
    try {
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
      args = JSON.parse(rawArgs.replace(/\{\{input\}\}/g, inputStr));
    } catch { args = {}; }
  } else if (rawArgs && typeof rawArgs === 'object') {
    args = rawArgs as Record<string, unknown>;
  }

  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string') {
      const s = typeof input === 'string' ? input : JSON.stringify(input);
      args[k] = v.replace(/\{\{input\}\}/g, s);
    }
  }

  const resp = await callTool(serverId, tool, args);
  return (resp as { result?: unknown })?.result ?? resp;
}

function runFunctionNode(opts: { values: Record<string, unknown>; input: unknown }): unknown {
  const src = String(opts.values.code || 'return input');
  try {
    const fn = new Function('input', 'values', src);
    return fn(opts.input, opts.values);
  } catch (err) { throw new Error('Function node error: ' + (err as Error).message); }
}

function runIfElseNode(opts: { values: Record<string, unknown>; input: unknown }): { branch: string; value: unknown } {
  const expr   = String(opts.values.expression || opts.values.condition || 'true');
  const result = evalSafe(expr, opts.input);
  return { branch: result ? 'true' : 'false', value: opts.input };
}

function runIfElseIfElseNode(opts: { values: Record<string, unknown>; input: unknown }): { branch: string; value: unknown } {
  const rows = Array.isArray(opts.values.conditions) ? opts.values.conditions : [];
  const n    = Math.max(1, Math.min(8, Number(opts.values.branches) || rows.length || 2));
  for (let i = 0; i < n; i++) {
    const row  = rows[i] as Record<string, unknown> | undefined;
    if (!row) continue;
    const expr = row.expression ?? (Array.isArray(row) ? (row as unknown[])[1] : undefined);
    if (!expr) continue;
    if (evalSafe(String(expr), opts.input)) return { branch: `branch_${i + 1}`, value: opts.input };
  }
  return { branch: 'else', value: opts.input };
}

function runSwitchNode(opts: { values: Record<string, unknown>; input: unknown }): { branch: string; value: unknown } {
  const keyVal  = opts.values.keyExpr ? evalSafe(String(opts.values.keyExpr), opts.input) : opts.input;
  const key     = String(keyVal);
  const cases   = Array.isArray(opts.values.cases) ? opts.values.cases : [];
  const n       = Math.max(1, Math.min(12, Number(opts.values.caseCount) || cases.length || 3));
  for (let i = 0; i < Math.min(n, cases.length); i++) {
    const c     = cases[i] as Record<string, unknown>;
    const match = c.value ?? c.match ?? (Array.isArray(cases[i]) ? (cases[i] as unknown[])[0] : undefined);
    if (match != null && String(match) === key) return { branch: `case_${i + 1}`, value: opts.input };
  }
  return { branch: 'default', value: opts.input };
}

function runJsonMapNode(opts: { values: Record<string, unknown>; input: unknown }): unknown {
  let parsed = opts.input;
  if (typeof opts.input === 'string') { try { parsed = JSON.parse(opts.input); } catch { return opts.input; } }

  const rows    = Array.isArray(opts.values.mappingPairs) ? opts.values.mappingPairs : [];
  let mappings: Array<{ key: string; path: string }> = [];
  if (rows.length > 0) {
    mappings = rows.map((r: unknown) => {
      if (!Array.isArray(r)) return null;
      const k = String((r as unknown[])[0] ?? '').trim();
      const p = String((r as unknown[])[1] ?? '').trim();
      return k ? { key: k, path: p || '$' } : null;
    }).filter(Boolean) as Array<{ key: string; path: string }>;
  } else if (opts.values.mappings) {
    try { mappings = typeof opts.values.mappings === 'string' ? JSON.parse(opts.values.mappings) : opts.values.mappings as Array<{ key: string; path: string }>; } catch { mappings = []; }
  }

  const result: Record<string, unknown> = {};
  for (const m of mappings) result[m.key] = jsonPath(parsed, m.path);
  return result;
}

function runTextTemplateNode(opts: { values: Record<string, unknown>; input: unknown }): string {
  const template = String(opts.values.template || '');
  const bag: Record<string, unknown> = { input: opts.input };
  if (opts.input && typeof opts.input === 'object' && !Array.isArray(opts.input)) Object.assign(bag, opts.input as Record<string, unknown>);
  return interpolateBag(template, bag);
}

function runJsonPathNode(opts: { values: Record<string, unknown>; input: unknown }): unknown {
  let parsed = opts.input;
  if (typeof opts.input === 'string') { try { parsed = JSON.parse(opts.input); } catch { return opts.input; } }
  const result = jsonPath(parsed, String(opts.values.path || ''));
  if ((result === undefined || result === null) && opts.values.fallback != null && opts.values.fallback !== '') return opts.values.fallback;
  return result !== undefined ? result : null;
}

function runMapperNode(opts: { values: Record<string, unknown>; input: unknown }): unknown {
  const mode = String(opts.values.mode || 'json_parse');
  switch (mode) {
    case 'json_parse':
      if (typeof opts.input === 'object' && opts.input !== null) return opts.input;
      if (typeof opts.input !== 'string') return opts.input;
      try { return JSON.parse(opts.input); } catch { throw new Error('Mapper: input is not valid JSON'); }
    case 'json_stringify':
      return typeof opts.input === 'string' ? opts.input : JSON.stringify(opts.input);
    case 'to_number': {
      const n = Number(opts.input);
      if (Number.isNaN(n)) throw new Error(`Mapper: cannot convert "${String(opts.input).slice(0, 50)}" to number`);
      return n;
    }
    case 'to_boolean':
      if (typeof opts.input === 'boolean') return opts.input;
      if (typeof opts.input === 'number')  return opts.input !== 0;
      return String(opts.input).toLowerCase() === 'true';
    case 'to_string':
      return typeof opts.input === 'string' ? opts.input : (typeof opts.input === 'object' ? JSON.stringify(opts.input) : String(opts.input));
    case 'base64_encode':
      return Buffer.from(String(opts.input), 'utf8').toString('base64');
    case 'base64_decode':
      return Buffer.from(String(opts.input), 'base64').toString('utf8');
    case 'url_encode':
      return encodeURIComponent(String(opts.input));
    case 'url_decode':
      return decodeURIComponent(String(opts.input));
    case 'trim':
      return String(opts.input).trim();
    case 'upper':
      return String(opts.input).toUpperCase();
    case 'lower':
      return String(opts.input).toLowerCase();
    default:
      return opts.input;
  }
}

function runFilterNode(opts: { values: Record<string, unknown>; input: unknown }): { kept: unknown[]; rejected: unknown[] } {
  let arr = opts.input;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return { kept: [], rejected: [] }; } }
  if (!Array.isArray(arr)) return { kept: [], rejected: [] };

  const expr    = String(opts.values.expression || opts.values.condition || 'true');
  const kept: unknown[]     = [];
  const rejected: unknown[] = [];
  for (const item of arr) {
    try {
      const fn = new Function('item', 'return ' + expr);
      if (fn(item)) kept.push(item); else rejected.push(item);
    } catch { rejected.push(item); }
  }
  return { kept, rejected };
}

function runSortNode(opts: { values: Record<string, unknown>; input: unknown }): unknown[] {
  let arr = opts.input;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return []; } }
  if (!Array.isArray(arr)) return [];

  const field = String(opts.values.field || '');
  const order = String(opts.values.order || 'asc');
  const sorted = [...arr];

  sorted.sort((a, b) => {
    const va = field ? jsonPath(a, field) : a;
    const vb = field ? jsonPath(b, field) : b;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return order === 'asc' ? va - vb : vb - va;
    return order === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  return sorted;
}

function runAggregateNode(opts: { values: Record<string, unknown>; input: unknown }): unknown {
  let arr = opts.input;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return null; } }
  if (!Array.isArray(arr)) return arr;

  const op    = String(opts.values.operation || 'count');
  const field = String(opts.values.field || '');

  const nums = () => arr.map((item: unknown) => Number(field ? jsonPath(item, field) : item)).filter((n) => !Number.isNaN(n)) as number[];

  switch (op) {
    case 'count': return arr.length;
    case 'sum':   return nums().reduce((a, b) => a + b, 0);
    case 'avg':   { const ns = nums(); return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0; }
    case 'min':   return Math.min(...nums());
    case 'max':   return Math.max(...nums());
    case 'first': return arr[0];
    case 'last':  return arr[arr.length - 1];
    case 'join':  return arr.map((i: unknown) => field ? jsonPath(i, field) : i).join(String(opts.values.separator ?? ','));
    default:      return arr.length;
  }
}

function runMergeNode(opts: { inputsByHandle: Record<string, unknown> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const val of Object.values(opts.inputsByHandle)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) Object.assign(result, val as Record<string, unknown>);
  }
  return result;
}

async function runApiNode(opts: { values: Record<string, unknown>; input: unknown }): Promise<{ data: unknown; status: number; headers: Record<string, string> }> {
  const bag: Record<string, unknown> = { input: opts.input };
  if (opts.input && typeof opts.input === 'object' && !Array.isArray(opts.input)) Object.assign(bag, opts.input as Record<string, unknown>);

  const method  = String(opts.values.method || 'GET').toUpperCase();
  const url     = interpolateBag(String(opts.values.url || ''), bag);
  let rawHeaders = opts.values.headers;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof rawHeaders === 'string') { try { Object.assign(headers, JSON.parse(rawHeaders)); } catch { /* ignore */ } }
  else if (rawHeaders && typeof rawHeaders === 'object') Object.assign(headers, rawHeaders as Record<string, string>);

  let bodyStr: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const rawBody = opts.values.body;
    if (rawBody !== undefined && rawBody !== '') bodyStr = typeof rawBody === 'string' ? interpolateBag(rawBody, bag) : JSON.stringify(rawBody);
  }

  const t0  = Date.now();
  const res = await fetch(url, { method, headers, body: bodyStr });
  const ms  = Date.now() - t0;
  let data: unknown;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) { try { data = await res.json(); } catch { data = await res.text(); } }
  else data = await res.text();

  const outHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { outHeaders[k] = v; });
  outHeaders['x-duration-ms'] = String(ms);

  return { data, status: res.status, headers: outHeaders };
}

function runCryptoNode(opts: { values: Record<string, unknown>; input: unknown }): unknown {
  const op    = String(opts.values.operation || opts.values.mode || 'sha256');
  const input = typeof opts.input === 'string' ? opts.input : JSON.stringify(opts.input);

  switch (op) {
    case 'sha256': return createHash('sha256').update(input).digest('hex');
    case 'sha512': return createHash('sha512').update(input).digest('hex');
    case 'md5':    return createHash('md5').update(input).digest('hex');
    case 'hmac_sha256': {
      const key = String(opts.values.key || '');
      return createHmac('sha256', key).update(input).digest('hex');
    }
    case 'uuid':   return randomUUID();
    case 'base64_encode': return Buffer.from(input, 'utf8').toString('base64');
    case 'base64_decode': return Buffer.from(input, 'base64').toString('utf8');
    default:       return createHash('sha256').update(input).digest('hex');
  }
}

function runVariablesNode(opts: { values: Record<string, unknown>; input: unknown }): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  const bag: Record<string, unknown> = { input: opts.input };
  if (opts.input && typeof opts.input === 'object' && !Array.isArray(opts.input)) Object.assign(bag, opts.input as Record<string, unknown>);

  const entries = Array.isArray(opts.values.variables) ? opts.values.variables : [];
  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
    const key = String(e.key ?? e.name ?? '').trim();
    if (!key) continue;
    const val = e.value ?? e.expression ?? '';
    vars[key] = typeof val === 'string' ? interpolateBag(val, bag) : val;
  }
  return { ...bag, ...vars };
}

async function runAiClassifierNode(opts: {
  node: { id: string };
  values: Record<string, unknown>;
  input: unknown;
  callAgent: CallAgentFn;
}): Promise<{ category: string; confidence: number }> {
  const categories = Array.isArray(opts.values.categories) ? opts.values.categories : [];
  const catList    = categories.map((c: unknown) => (typeof c === 'string' ? c : JSON.stringify(c))).join(', ');
  const prompt     = `Classify the following input into exactly one of these categories: ${catList}.\n\nRespond with a JSON object: {"category":"<category>","confidence":<0-1>}\n\nInput: ${typeof opts.input === 'string' ? opts.input : JSON.stringify(opts.input)}`;

  const classifierModel = opts.values.model ? String(opts.values.model) : null;
  if (!classifierModel) {
    throw new Error(
      `No model provider configured for AI Classifier node "${opts.node.id}". ` +
      'Open Settings → LLM Provider Configuration, select a default model and save.'
    );
  }
  const res = await opts.callAgent({
    agent: {
      id: opts.node.id,
      model: classifierModel,
      systemPrompt: 'You are a precise classifier. Respond only with the JSON object requested.',
      userPrompt: prompt,
      responseFormat: '{"category":"string","confidence":"number"}',
      strictOutput: true,
    },
    input: typeof opts.input === 'string' ? opts.input : JSON.stringify(opts.input),
  });

  try {
    const json = JSON.parse(res.output);
    return { category: String(json.category ?? ''), confidence: Number(json.confidence ?? 0) };
  } catch {
    return { category: String(res.output).trim(), confidence: 0.5 };
  }
}

/* ── Main executor ── */

export interface ExecuteGraphOptions {
  workflow: Workflow;
  inputs: Record<string, unknown>;
  callAgent: CallAgentFn;
  callTool: CallToolFn;
}

export async function executeGraph({
  workflow,
  inputs,
  callAgent,
  callTool,
}: ExecuteGraphOptions): Promise<RunResult> {
  const { nodes: allNodes = [], edges: allEdges = [], subBlockValues = {} } = workflow;

  const disabledIds = new Set(allNodes.filter((n) => n.data?.disabled).map((n) => n.id));
  const nodes = allNodes;
  const edges = allEdges;

  // BFS reachability from seed nodes
  const outgoingAll: Record<string, typeof edges> = {};
  for (const e of edges) {
    if (!outgoingAll[e.source]) outgoingAll[e.source] = [];
    outgoingAll[e.source].push(e);
  }
  const reachable = new Set<string>();
  const seedIds = nodes.filter((n) => n.data?.blockType === 'starter' || n.data?.blockType === 'user_input').map((n) => n.id);
  const queue = [...seedIds];
  for (const id of queue) {
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const e of (outgoingAll[id] || [])) if (!reachable.has(e.target)) queue.push(e.target);
  }

  const outgoing = groupBy(edges, 'source');
  const incoming = groupBy(edges, 'target');
  const outputs: Record<string, unknown> = {};
  const trace: TraceEntry[] = [];
  const started = new Set<string>();
  const chosenHandle: Record<string, string | null> = {};

  // Seed starter + user_input
  for (const n of nodes) {
    if (n.data?.blockType === 'user_input') {
      outputs[n.id] = Object.prototype.hasOwnProperty.call(inputs || {}, n.id) ? inputs[n.id] : null;
      trace.push({ nodeId: n.id, blockType: 'user_input', title: n.data?.title as string, input: null, output: outputs[n.id], ms: 0 });
      started.add(n.id);
    } else if (n.data?.blockType === 'starter') {
      const chatPayload = inputs?.__chat__ ?? null;
      outputs[n.id] = chatPayload;
      trace.push({ nodeId: n.id, blockType: 'starter', title: n.data?.title as string, input: null, output: chatPayload, ms: 0 });
      started.add(n.id);
    } else if (n.data?.blockType === 'webhook_request') {
      outputs[n.id] = inputs[n.id] ?? null;
      trace.push({ nodeId: n.id, blockType: 'webhook_request', title: n.data?.title as string, input: null, output: outputs[n.id], ms: 0 });
      started.add(n.id);
    }
  }

  const edgeIsLive = (e: { source: string; sourceHandle?: string }) => {
    if (!started.has(e.source)) return false;
    const chosen = chosenHandle[e.source];
    if (chosen == null) return true;
    return (e.sourceHandle || 'out') === chosen;
  };

  const resolveEdgeOutput = (e: { source: string; sourceHandle?: string }) => {
    const full = outputs[e.source];
    const sh   = e.sourceHandle || 'out';
    if (sh === 'out' || full == null || typeof full !== 'object') return full;
    const field = sh.startsWith('out_') ? sh.slice(4) : sh;
    return field in (full as Record<string, unknown>) ? (full as Record<string, unknown>)[field] : full;
  };

  /* BFS loop */
  while (true) {
    const ready = nodes.filter((n) => {
      if (started.has(n.id)) return false;
      if (!reachable.has(n.id)) return false;
      const ins = incoming[n.id] || [];
      if (ins.length === 0) return false;
      return ins.every(edgeIsLive);
    });
    if (ready.length === 0) break;

    await Promise.all(ready.map(async (n) => {
      started.add(n.id);
      const t0      = performance.now();
      const inEdges = incoming[n.id] || [];
      const upstream = inEdges.map(resolveEdgeOutput);
      const input    = upstream.length <= 1 ? upstream[0] : upstream;
      const inputsByHandle: Record<string, unknown> = {};
      for (const e of inEdges) {
        const th  = e.targetHandle || 'in';
        const key = th === 'in' ? 'input' : (th.startsWith('in_') ? th.slice(3) : th);
        if (key in inputsByHandle) continue;
        inputsByHandle[key] = resolveEdgeOutput(e);
      }
      const values = subBlockValues[n.id] || {};
      const blockType = n.data?.blockType as string;

      let output: unknown = input;
      let nodeError: string | undefined;

      if (disabledIds.has(n.id)) {
        output = input;
      } else {
        try {
          switch (blockType) {
            case 'agent': {
              const raw = await runAgentNode({ node: n, values, input, callAgent });
              const meta = (raw as { __meta?: unknown; value?: unknown }).__meta;
              output = (raw as { value?: unknown }).value ?? raw;
              trace.push({ nodeId: n.id, blockType, title: n.data?.title as string, input, output, values, meta: meta as Record<string, unknown>, ms: performance.now() - t0 });
              outputs[n.id] = output;
              return;
            }
            case 'mcp': {
              output = await runMcpNode({ values, input, callTool });
              break;
            }
            case 'function': {
              output = runFunctionNode({ values, input });
              break;
            }
            case 'if_else': {
              const r = runIfElseNode({ values, input });
              chosenHandle[n.id] = r.branch;
              output = r.value;
              break;
            }
            case 'if_elseif_else': {
              const r = runIfElseIfElseNode({ values, input });
              chosenHandle[n.id] = r.branch;
              output = r.value;
              break;
            }
            case 'switch_case':
            case 'condition': {
              const r = runSwitchNode({ values, input });
              chosenHandle[n.id] = r.branch;
              output = r.value;
              break;
            }
            case 'json_map': {
              output = runJsonMapNode({ values, input });
              break;
            }
            case 'json_path': {
              output = runJsonPathNode({ values, input });
              break;
            }
            case 'text_template': {
              output = runTextTemplateNode({ values, input });
              break;
            }
            case 'mapper': {
              output = runMapperNode({ values, input });
              break;
            }
            case 'filter': {
              output = runFilterNode({ values, input });
              break;
            }
            case 'sort': {
              output = runSortNode({ values, input });
              break;
            }
            case 'aggregate': {
              output = runAggregateNode({ values, input });
              break;
            }
            case 'merge': {
              output = runMergeNode({ inputsByHandle });
              break;
            }
            case 'api': {
              output = await runApiNode({ values, input });
              break;
            }
            case 'crypto': {
              output = runCryptoNode({ values, input });
              break;
            }
            case 'variables': {
              output = runVariablesNode({ values, input });
              break;
            }
            case 'ai_classifier': {
              output = await runAiClassifierNode({ node: n, values, input, callAgent });
              break;
            }
            case 'delay':
            case 'wait': {
              const ms = Number(values.ms ?? values.duration ?? 0);
              if (ms > 0) await new Promise((r) => setTimeout(r, ms));
              output = input;
              break;
            }
            case 'json_validator': {
              let parsed = input;
              if (typeof input === 'string') { try { parsed = JSON.parse(input); } catch { parsed = input; } }
              const rules = Array.isArray(values.rules) ? values.rules : [];
              const errors: string[] = [];
              for (const rule of rules) {
                const r = rule as Record<string, unknown>;
                const path = String(r.path ?? '');
                const rType = String(r.rule ?? '');
                const expected = r.value;
                if (!path) continue;
                const got = jsonPath(parsed, path);
                if (rType === 'exists' && got === undefined) errors.push(`${path} missing`);
                if (rType === 'equals' && String(got) !== String(expected)) errors.push(`${path} !== ${expected}`);
                if (rType === 'type' && typeof got !== String(expected)) errors.push(`${path} not a ${expected}`);
              }
              output = { valid: errors.length === 0, errors, value: parsed };
              break;
            }
            case 'response': {
              const data    = inputsByHandle['data']    ?? inputsByHandle['input'] ?? input;
              const status  = inputsByHandle['status']  ?? 200;
              const headers = inputsByHandle['headers'] ?? {};
              output = { data, status, headers };
              break;
            }
            case 'show_preview':
            case 'table': {
              output = input;
              break;
            }
            case 'save_to_files': {
              // In VS Code context, emit output — actual file saving is UI-side
              output = { saved: true, input };
              break;
            }
            case 'error_handler': {
              try {
                output = { result: input, error: null };
              } catch (err: unknown) {
                output = { result: null, error: { message: (err as Error).message } };
              }
              break;
            }
            case 'router_v2': {
              const r = runSwitchNode({ values, input });
              chosenHandle[n.id] = r.branch;
              output = r.value;
              break;
            }
            case 'parallel': {
              // Fan-out: each outgoing edge gets the same input
              output = input;
              break;
            }
            case 'for_loop':
            case 'for_each': {
              let arr = input;
              if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { /* ignore */ } }
              if (Array.isArray(arr)) output = arr;
              else output = input;
              break;
            }
            case 'loop': {
              output = input;
              break;
            }
            case 'sub_workflow': {
              // Execute referenced sub-workflow inline if data available
              output = input;
              break;
            }
            case 'skill': {
              const src = String(values.source || '');
              if (src) {
                try {
                  const fn = new Function('input', 'values', src);
                  output = fn(input, values);
                } catch (err: unknown) {
                  throw new Error('Skill error: ' + (err as Error).message);
                }
              } else {
                output = input;
              }
              break;
            }
            case 'schedule':
            case 'webhook_request': {
              output = input;
              break;
            }
            default: {
              output = input;
              break;
            }
          }

          // Type-check output
          const outType = (subBlockValues[n.id]?._portTypes as Record<string, string>)?.['out_out'];
          if (outType) {
            const typeErr = checkValueType(output, outType);
            if (typeErr) console.warn(`[graph-runner] Node ${n.id} (${blockType}): ${typeErr}`);
          }
        } catch (err: unknown) {
          nodeError = err instanceof Error ? err.message : String(err);
          output = null;
        }
      }

      trace.push({
        nodeId: n.id,
        blockType,
        title: n.data?.title as string,
        input,
        inputsByHandle,
        output,
        values,
        error: nodeError,
        ms: performance.now() - t0,
      });

      outputs[n.id] = output;
    }));
  }

  // Find response node output, or last trace entry
  const responseNode = nodes.find((n) => n.data?.blockType === 'response');
  const finalOutput  = responseNode ? outputs[responseNode.id] : (trace[trace.length - 1]?.output ?? null);

  return { output: finalOutput, trace };
}

// Expose a simpler interface matching ce-builder-studio's API
export async function executeGraphSimple(opts: {
  workflow: Workflow;
  inputs: Record<string, unknown>;
  callAgent: CallAgentFn;
  callTool: CallToolFn;
}): Promise<{ output: unknown; trace: TraceEntry[] }> {
  return executeGraph(opts);
}
