/**
 * IO Panel Registry — extensible configuration for the Inspector's I/O panel
 * and card-level port display.
 *
 * Extensions can register:
 *   - Custom type colors (for typed badges in inputs/outputs)
 *   - Card port overrides (what shows on the node card vs inspector)
 *   - Custom IO sections (connections, template vars, custom panels)
 *   - Block-level feature flags (e.g. which blocks show template variables)
 *
 * Usage from an extension:
 *   import { registerTypeColor, registerCardPorts, enableFeature } from './io-registry'
 *   registerTypeColor('vector', { bg: '...', border: '...', text: '...' })
 *   registerCardPorts('my_block', { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'result', type: 'json' }] })
 *   enableFeature('templateVars', 'my_custom_block')
 */

// ─── Type Colors ────────────────────────────────────────────────────────────
// `solid` is used for port circles on nodes; `bg`/`border`/`text` for badges.
const typeColors = {
  string:  { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  text: '#86efac',  solid: '#22c55e' },
  number:  { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', text: '#fde68a',  solid: '#fbbf24' },
  boolean: { bg: 'rgba(244,114,182,0.12)',border: 'rgba(244,114,182,0.3)',text: '#f9a8d4',  solid: '#f472b6' },
  json:    { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', text: '#a5b4fc',  solid: '#6366f1' },
  array:   { bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)', text: '#7dd3fc',  solid: '#0ea5e9' },
  blob:    { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#fcd34d',  solid: '#f59e0b' },
  any:     { bg: 'rgba(148,163,184,0.12)',border: 'rgba(148,163,184,0.3)',text: '#cbd5e1',  solid: '#94a3b8' },
}

export function registerTypeColor(typeName, colors) {
  if (!typeName || !colors) return
  typeColors[typeName] = colors
}

export function getTypeColor(typeName) {
  return typeColors[typeName] || typeColors.any
}

export function getAllTypeColors() {
  return { ...typeColors }
}

/** Ordered list of available port type names (for the type-picker UI). */
export function getAllPortTypes() {
  return Object.keys(typeColors)
}

// ─── Type Compatibility (ComfyUI-style strict connections) ──────────────────
// Strict: primitives only match their own kind + `any`.
// `json` accepts json, array, and any.  `array` accepts array and any.
// `any` is the universal wildcard — connects to everything.
const compat = {
  string:  new Set(['string', 'any']),
  number:  new Set(['number', 'any']),
  boolean: new Set(['boolean', 'any']),
  json:    new Set(['json', 'array', 'any']),
  array:   new Set(['array', 'any']),
  blob:    new Set(['blob', 'any']),
  any:     new Set(['string', 'number', 'boolean', 'json', 'array', 'blob', 'any']),
}

/** Check if a source output type can connect to a target input type. */
export function isTypeCompatible(sourceType, targetType) {
  const src = sourceType || 'any'
  const tgt = targetType || 'any'
  if (src === 'any' || tgt === 'any') return true
  return (compat[src] || compat.any).has(tgt)
}

/**
 * Resolve the effective port type for a given node + handle, accounting for
 * per-node _portTypes overrides and falling back to registry defaults.
 *
 * @param {string} nodeId
 * @param {string} handleId  — raw handle id from ReactFlow edge (e.g. "in_data", "data", "out", "in")
 * @param {'source'|'target'} side — which end of the edge
 * @param {object} subBlockValues — full subBlockValues from the store
 * @param {object[]} nodes — nodes array from the store
 */
export function resolvePortType(nodeId, handleId, side, subBlockValues, nodes) {
  const nodeData = nodes.find((n) => n.id === nodeId)?.data
  if (!nodeData) return 'any'
  const blockType = nodeData.blockType
  const vals = subBlockValues[nodeId] || {}
  const portTypes = vals._portTypes || {}
  const hid = handleId || ''  // guard against undefined handles

  if (side === 'target') {
    // Input handle: id is "in_<key>" or fallback "in"
    if (portTypes[hid]) return portTypes[hid]
    // Look up default from card ports
    const key = hid.startsWith('in_') ? hid.slice(3) : null
    if (key) {
      const block = _getBlockSafe(blockType)
      if (block) {
        const card = getCardPorts(blockType, block.inputs, block.outputs)
        const port = card.inputs.find((p) => p.key === key)
        if (port) return port.type
      }
    }

    return 'any'
  } else {
    // Output handle: id is the raw key ("data", "status") or "out"
    // _portTypes stores as "out_<key>"
    const ptKey = hid === 'out' ? 'out_out' : (hid.startsWith('out_') ? hid : `out_${hid}`)
    if (portTypes[ptKey]) return portTypes[ptKey]
    // Look up default from card ports
    const key = hid === 'out' ? null : (hid.startsWith('out_') ? hid.slice(4) : hid)
    if (key) {
      const block = _getBlockSafe(blockType)
      if (block) {
        const card = getCardPorts(blockType, block.inputs, block.outputs)
        const port = card.outputs.find((p) => p.key === key)
        if (port) return port.type
      }
    }
    return 'any'
  }
}

/** Safe block lookup — avoids circular import issues. Set by registry init. */
let _getBlockSafe = () => null
export function setBlockResolver(fn) { _getBlockSafe = fn }



// ─── Card Ports — what shows on the node card (simplified) ──────────────────
// Key: blockType → { inputs: [{ key, type }], outputs: [{ key, type }] }
//
// Ports can be:
//   - Explicit overrides (registered per block type)
//   - 'auto' — derive card summary from the block's full inputs/outputs schema
//
// "auto" derivation rules (n8n/ComfyUI hybrid):
//   Inputs:  If 0 → none. If all same type → single port of that type.
//            If mixed → single "input" port typed "json".
//   Outputs: Show each individually (max 3). If 4+ → show first + "…more".
//
// Blocks that need special treatment override explicitly.
const cardPortOverrides = {
  // Triggers — no input
  starter:       { inputs: [],  outputs: [] },
  user_input:    { inputs: [],  outputs: 'auto' },
  schedule:      { inputs: [],  outputs: 'auto' },
  variables:     { inputs: [],  outputs: [] },
  // Agent — one input (upstream text/json), multi-output (data, status, headers)
  agent:         {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'data', type: 'string' }, { key: 'status', type: 'number' }, { key: 'headers', type: 'json' }],
  },
  // Function — one input, one output
  function:      { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'result', type: 'json' }] },
  // Response — multi-input: data, status, headers each individually connectable
  response:      {
    inputs: [{ key: 'data', type: 'json' }, { key: 'status', type: 'number' }, { key: 'headers', type: 'json' }],
    outputs: [{ key: 'data', type: 'json' }, { key: 'status', type: 'number' }, { key: 'headers', type: 'json' }],
  },
  // MCP — wire any upstream node to `input`; that value becomes the tool arguments
  mcp:           {
    inputs: [{ key: 'input', type: 'any' }],
    outputs: [{ key: 'content', type: 'array' }],
  },
  // API — input: upstream data (available as {{input}} in URL/body templates)
  //        body: direct wire → becomes the request body (POST/PUT/PATCH)
  api:           {
    inputs: [{ key: 'input', type: 'json' }, { key: 'body', type: 'json' }],
    outputs: [{ key: 'data', type: 'json' }, { key: 'status', type: 'number' }, { key: 'headers', type: 'json' }],
  },
  // Merge — two separate inputs
  merge:         {
    inputs: [{ key: 'input1', type: 'any' }, { key: 'input2', type: 'any' }],
    outputs: [{ key: 'merged', type: 'json' }],
  },
  // Filter — multi-output
  filter:        {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'kept', type: 'json' }, { key: 'rejected', type: 'json' }, { key: 'count', type: 'number' }],
  },
  // Aggregate — multi-output
  aggregate:     {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'result', type: 'any' }, { key: 'count', type: 'number' }],
  },
  // Sort — multi-output
  sort:          {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'sorted', type: 'json' }, { key: 'count', type: 'number' }],
  },
  // Error Handler — multi-output
  error_handler: {
    inputs: [{ key: 'input', type: 'any' }],
    outputs: [{ key: 'result', type: 'any' }, { key: 'error', type: 'json' }],
  },
  // Webhook — no inputs, multi-output
  webhook_request: {
    inputs: [],
    outputs: [{ key: 'body', type: 'json' }, { key: 'headers', type: 'json' }, { key: 'query', type: 'json' }],
  },
  // AI Classifier
  ai_classifier: {
    inputs: [{ key: 'input', type: 'string' }],
    outputs: [{ key: 'category', type: 'string' }, { key: 'confidence', type: 'number' }],
  },
  // Database blocks — single input, multi-output
  postgresql:    {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'result', type: 'json' }, { key: 'count', type: 'number' }],
  },
  mongodb:       {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'result', type: 'json' }, { key: 'count', type: 'number' }],
  },
  redis:         {
    inputs: [{ key: 'input', type: 'any' }],
    outputs: [{ key: 'result', type: 'any' }, { key: 'success', type: 'boolean' }],
  },
  // Slack
  slack:         {
    inputs: [{ key: 'input', type: 'string' }],
    outputs: [{ key: 'ok', type: 'boolean' }, { key: 'ts', type: 'string' }],
  },
  // If/Else family — multi-output branching, handled by outputHandles
  if_else:       { inputs: [{ key: 'input', type: 'json' }], outputs: [] },
  if_elseif_else:{ inputs: [{ key: 'input', type: 'json' }], outputs: [] },
  switch:        { inputs: [{ key: 'input', type: 'json' }], outputs: [] },
  // Show Preview: always any→any pass-through
  show_preview:  { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'payload', type: 'any' }] },
  // Mapper — type conversion utility
  mapper:        { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'result', type: 'any' }] },
  skill:         { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'result', type: 'any' }] },
  // Audio Input — accepts upstream data via `any` input, outputs audio data as json
  audio_input:   { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'audio', type: 'json' }] },

  // ─── Data transformation ───────────────────────────────────────────────────
  text_template: { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'result', type: 'string' }] },
  json_map:      { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'result', type: 'json' }] },
  json_path:     { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'result', type: 'json' }] },

  // ─── Control flow ──────────────────────────────────────────────────────────
  // condition: evaluates expression against upstream input
  condition:     { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'conditionResult', type: 'boolean' }, { key: 'selectedPath', type: 'json' }] },
  // loop/for_each/for_loop: server-side, but port visible for wiring
  loop:          { inputs: [{ key: 'collection', type: 'json' }], outputs: [{ key: 'results', type: 'array' }, { key: 'iterations', type: 'number' }] },
  for_loop:      { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'iterations', type: 'array' }, { key: 'last', type: 'json' }] },
  for_each:      { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'iterations', type: 'array' }, { key: 'last', type: 'json' }] },
  // parallel: server-side; wire input for branch fan-out
  parallel:      { inputs: [{ key: 'input', type: 'json' }], outputs: [{ key: 'results', type: 'array' }, { key: 'winner', type: 'json' }] },

  // ─── Utility ───────────────────────────────────────────────────────────────
  // delay/wait: pass input through after the pause
  delay:         { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'output', type: 'any' }, { key: 'elapsed', type: 'number' }] },
  wait:          { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'output', type: 'any' }, { key: 'elapsed', type: 'number' }] },
  // crypto: data can come from upstream node
  crypto:        { inputs: [{ key: 'data', type: 'string' }], outputs: [{ key: 'result', type: 'string' }] },
  // save_to_files: input is the payload to persist
  save_to_files: { inputs: [{ key: 'input', type: 'any' }], outputs: [{ key: 'savedAt', type: 'string' }, { key: 'bytes', type: 'number' }] },

  // ─── HTTP / Messaging ──────────────────────────────────────────────────────
  // http_response: body, statusCode, headers each individually connectable
  http_response: {
    inputs: [{ key: 'body', type: 'any' }, { key: 'statusCode', type: 'number' }, { key: 'headers', type: 'json' }],
    outputs: [{ key: 'sent', type: 'boolean' }],
  },
  // smtp: body, to, subject can be wired from upstream
  smtp:          {
    inputs: [{ key: 'body', type: 'string' }, { key: 'to', type: 'string' }, { key: 'subject', type: 'string' }],
    outputs: [{ key: 'success', type: 'boolean' }, { key: 'messageId', type: 'string' }],
  },

  // ─── AI Router ─────────────────────────────────────────────────────────────
  router_v2:     {
    inputs: [{ key: 'context', type: 'string' }],
    outputs: [{ key: 'selectedRoute', type: 'string' }, { key: 'reasoning', type: 'string' }],
  },

  // ─── Workflows / Database ──────────────────────────────────────────────────
  // sub_workflow: input becomes the sub-workflow's inputMapping
  sub_workflow:  {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'result', type: 'any' }, { key: 'status', type: 'string' }],
  },
  // table: data drives insert/update rows
  table:         {
    inputs: [{ key: 'data', type: 'json' }],
    outputs: [{ key: 'rows', type: 'array' }, { key: 'count', type: 'number' }],
  },
  // postgresql/mongodb/redis outputs (upgrade from generic to actual schema)
  postgresql:    {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'rows', type: 'array' }, { key: 'rowCount', type: 'number' }, { key: 'message', type: 'string' }],
  },
  mongodb:       {
    inputs: [{ key: 'input', type: 'json' }],
    outputs: [{ key: 'result', type: 'json' }, { key: 'count', type: 'number' }, { key: 'insertedId', type: 'string' }],
  },
}

export function registerCardPorts(blockType, ports) {
  if (!blockType || !ports) return
  cardPortOverrides[blockType] = ports
}

/**
 * Derive the dominant type from a set of IO definitions.
 * Returns the common type if all entries share it, otherwise 'json'.
 */
function deriveType(ioDefs) {
  if (!ioDefs) return 'any'
  const entries = Object.values(ioDefs)
  if (entries.length === 0) return 'any'
  const types = new Set(entries.map((e) => e.type || 'any'))
  if (types.size === 1) return [...types][0]
  return 'json'
}

/**
 * Build auto-derived ports from full block schema definitions.
 */
function autoPorts(fullDefs, direction) {
  if (!fullDefs || Object.keys(fullDefs).length === 0) return []
  const entries = Object.entries(fullDefs)

  if (direction === 'input') {
    // Single summary port for inputs
    return [{ key: 'input', type: deriveType(fullDefs) }]
  }
  // Outputs: show each individually
  return entries.map(([k, v]) => ({ key: k, type: v.type || 'any' }))
}

/**
 * Get the card-level ports for a block type.
 * Returns { inputs: [{ key, type }], outputs: [{ key, type }] }
 */
export function getCardPorts(blockType, fullInputs, fullOutputs) {
  const override = cardPortOverrides[blockType]

  let inputs, outputs

  if (override) {
    inputs = override.inputs === 'auto' ? autoPorts(fullInputs, 'input') : override.inputs
    outputs = override.outputs === 'auto' ? autoPorts(fullOutputs, 'output') : override.outputs
  } else {
    // No explicit override — fully auto-derive
    inputs = autoPorts(fullInputs, 'input')
    outputs = autoPorts(fullOutputs, 'output')
  }

  return { inputs: inputs || [], outputs: outputs || [] }
}

// ─── Feature Flags (block-type → Set of features) ──────────────────────────
// Features: 'templateVars' — show upstream template variable discovery
const featureFlags = {
  templateVars: new Set(['agent']),
}

export function enableFeature(feature, blockType) {
  if (!featureFlags[feature]) featureFlags[feature] = new Set()
  featureFlags[feature].add(blockType)
}

export function disableFeature(feature, blockType) {
  featureFlags[feature]?.delete(blockType)
}

export function hasFeature(feature, blockType) {
  return featureFlags[feature]?.has(blockType) ?? false
}

// ─── Custom IO Sections ─────────────────────────────────────────────────────
// Each section: { key, priority, match(cfg, node), Component }
// Component receives: { node, cfg, nodes, edges, lastOutputs, subBlockValues }
const customSections = []

export function registerIOSection(section) {
  if (!section?.key || !section?.Component) {
    throw new Error('registerIOSection: key and Component are required')
  }
  const existing = customSections.findIndex((s) => s.key === section.key)
  if (existing >= 0) customSections[existing] = section
  else customSections.push(section)
  customSections.sort((a, b) => (a.priority || 100) - (b.priority || 100))
}

export function getCustomIOSections() {
  return [...customSections]
}
