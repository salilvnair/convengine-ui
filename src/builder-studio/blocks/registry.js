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
