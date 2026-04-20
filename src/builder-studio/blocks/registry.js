/**
 * Block registry — mirrors sim/apps/sim/blocks/registry.ts.
 *
 * Core blocks are imported statically. Third-party extensions are discovered
 * via Vite's import.meta.glob, so dropping a new file into
 * `builder-studio/extensions/*.js` auto-registers the exported BlockConfig
 * (ComfyUI-style plugin pattern).
 */
import * as Core from './blocks'

/** Start with the core (sim-ported) block set. */
const registry = {
  starter: Core.StarterBlock,
  user_input: Core.UserInputBlock,
  agent: Core.AgentBlock,
  function: Core.FunctionBlock,
  condition: Core.ConditionBlock,
  router_v2: Core.RouterBlock,
  api: Core.ApiBlock,
  response: Core.ResponseBlock,
  loop: Core.LoopBlock,
  parallel: Core.ParallelBlock,
  postgresql: Core.PostgreSQLBlock,
  mcp: Core.McpBlock,
  smtp: Core.SmtpBlock,
  variables: Core.VariablesBlock,
  webhook_request: Core.WebhookRequestBlock,
  schedule: Core.ScheduleBlock,
  wait: Core.WaitBlock,
  table: Core.TableBlock,
  if_else: Core.IfElseBlock,
  if_elseif_else: Core.IfElseIfElseBlock,
  switch: Core.SwitchBlock,
  for_loop: Core.ForLoopBlock,
  for_each: Core.ForEachBlock,
  save_to_files: Core.SaveToFilesBlock,
  show_preview: Core.ShowPreviewBlock,
  json_map: Core.JsonMapBlock,
  text_template: Core.TextTemplateBlock,
  json_path: Core.JsonPathBlock,
  http_response: Core.HttpResponseBlock,
  error_handler: Core.ErrorHandlerBlock,
  merge: Core.MergeBlock,
  delay: Core.DelayBlock,
  filter: Core.FilterBlock,
  sub_workflow: Core.SubWorkflowBlock,
  crypto: Core.CryptoBlock,
  sort: Core.SortBlock,
  aggregate: Core.AggregateBlock,
  redis: Core.RedisBlock,
  mongodb: Core.MongoDbBlock,
  slack: Core.SlackBlock,
  ai_classifier: Core.AiClassifierBlock,
  mapper: Core.MapperBlock,
}

/**
 * Vite glob-import of every extension module. Each module must export either
 * a default BlockConfig or a named `block` / `<Name>Block` export.
 */
const extensionModules = import.meta.glob('../extensions/*.js', { eager: true })
const extensionListeners = new Set()

function resolveExtensionExport(mod) {
  if (!mod) return null
  if (mod.default && mod.default.type) return mod.default
  if (mod.block && mod.block.type) return mod.block
  for (const k of Object.keys(mod)) {
    const v = mod[k]
    if (v && typeof v === 'object' && v.type && v.subBlocks) return v
  }
  return null
}

for (const [path, mod] of Object.entries(extensionModules)) {
  const block = resolveExtensionExport(mod)
  if (!block) continue
  if (registry[block.type]) {
    console.warn(`[builder-studio] Extension at ${path} tried to overwrite core block "${block.type}"; skipped.`)
    continue
  }
  registry[block.type] = block
}

export function getBlock(type) {
  if (registry[type]) return registry[type]
  const normalized = type.replace(/-/g, '_')
  return registry[normalized]
}

export function getBlockByToolName(toolName) {
  return Object.values(registry).find((b) => b.tools?.access?.includes(toolName))
}

export function getBlocksByCategory(category) {
  return Object.values(registry).filter((b) => b.category === category)
}

export function getAllBlockTypes() {
  return Object.keys(registry)
}

export function getAllBlocks() {
  return Object.values(registry)
}

export function isValidBlockType(type) {
  return type in registry || type.replace(/-/g, '_') in registry
}

/**
 * Manual runtime registration for extensions loaded outside the glob
 * (e.g. from a user-supplied URL). Mirrors ComfyUI's registerNode API.
 */
export function registerBlock(block) {
  if (!block || !block.type) throw new Error('registerBlock: block.type is required')
  if (registry[block.type]) {
    console.warn(`[builder-studio] registerBlock: overwriting existing "${block.type}"`)
  }
  registry[block.type] = block
  for (const l of extensionListeners) l()
  return block
}

export function onRegistryChange(fn) {
  extensionListeners.add(fn)
  return () => extensionListeners.delete(fn)
}

export { registry }

/* ── Shared category & sub-group constants ── */

export const CATEGORY_LABELS = {
  blocks: 'Core Blocks',
  tools: 'Tools & Integrations',
  triggers: 'Triggers',
  custom: 'Custom',
}

export const CATEGORY_ORDER = ['blocks', 'tools', 'triggers', 'custom']

/**
 * Centralised category configuration — single source of truth for every
 * category's pinned top-level blocks and sub-group definitions.
 *
 * Every UI surface (BlockPalette, Canvas context-menu, WikiGuide) consumes
 * this config via `groupBlocksByCategory()`.  To re-organise blocks just
 * move types between groups here — all three surfaces update automatically.
 *
 * Shape per category:
 *   topTypes   – block types pinned above sub-groups (e.g. Starter)
 *   subgroups  – ordered list of { id, label, types[] }
 *
 * Blocks whose type doesn't appear in topTypes or any subgroup are
 * collected into an auto-generated "Other" group at the end.
 */
export const CATEGORY_CONFIG = {
  blocks: {
    topTypes: ['starter'],
    subgroups: [
      { id: 'io',         label: 'Input & Output',    types: ['user_input', 'mapper', 'api', 'http_response', 'response', 'save_to_files', 'show_preview'] },
      { id: 'essentials', label: 'Essentials',        types: ['variables', 'sub_workflow'] },
      { id: 'logic',      label: 'Logic & Flow',      types: ['condition', 'if_else', 'if_elseif_else', 'switch', 'router_v2', 'error_handler'] },
      { id: 'loops',      label: 'Loops',             types: ['loop', 'for_loop', 'for_each', 'parallel'] },
      { id: 'data',       label: 'Data & Transform',  types: ['json_map', 'json_path', 'text_template', 'table', 'filter', 'sort', 'aggregate', 'merge'] },
      { id: 'timing',     label: 'Timing',            types: ['wait', 'delay'] },
      { id: 'ai',         label: 'AI',                types: ['agent', 'ai_classifier'] },
    ],
  },
  tools: {
    topTypes: [],
    subgroups: [
      { id: 'scripting', label: 'Scripting',     types: ['function'] },
      { id: 'databases', label: 'Databases',     types: ['postgresql', 'redis', 'mongodb'] },
      { id: 'messaging', label: 'Messaging',     types: ['smtp', 'slack'] },
      { id: 'protocols', label: 'Protocols',     types: ['mcp'] },
      { id: 'security',  label: 'Security',      types: ['crypto'] },
    ],
  },
  triggers: {
    topTypes: [],
    subgroups: [
      { id: 'http',      label: 'HTTP',       types: ['webhook_request'] },
      { id: 'scheduled', label: 'Scheduled',  types: ['schedule'] },
    ],
  },
  custom: {
    topTypes: [],
    subgroups: [],
  },
}

/* Back-compat aliases — existing code that imports these still works. */
export const CORE_TOP_TYPES = CATEGORY_CONFIG.blocks.topTypes
export const CORE_SUBGROUPS = CATEGORY_CONFIG.blocks.subgroups

/**
 * Generic grouper for any category.
 * Returns { topItems: Block[], groups: { id, label, items: Block[] }[] }.
 */
export function groupBlocksByCategory(blocks, category) {
  const config = CATEGORY_CONFIG[category]
  if (!config) return { topItems: [], groups: blocks.length ? [{ id: 'all', label: 'All', items: blocks }] : [] }

  const typeMap = Object.fromEntries(blocks.map((b) => [b.type, b]))
  const used = new Set()

  const topItems = (config.topTypes || []).map((t) => typeMap[t]).filter(Boolean)
  topItems.forEach((b) => used.add(b.type))

  const groups = []
  for (const sg of config.subgroups) {
    const items = sg.types.map((t) => typeMap[t]).filter(Boolean)
    items.forEach((b) => used.add(b.type))
    if (items.length > 0) groups.push({ id: sg.id, label: sg.label, items })
  }

  const remaining = blocks.filter((b) => !used.has(b.type))
  if (remaining.length > 0) groups.push({ id: 'other', label: 'Other', items: remaining })

  return { topItems, groups }
}

/** @deprecated Use groupBlocksByCategory(blocks, 'blocks') instead. */
export function groupCoreBlocks(blocks) {
  return groupBlocksByCategory(blocks, 'blocks')
}
