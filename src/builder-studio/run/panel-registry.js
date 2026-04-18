/**
 * Run-dock panel registry — lets core and extensions plug tabs into the
 * bottom Run drawer without the dock itself knowing about them.
 *
 * A panel is `{ id, label, order?, render(ctx) }`. `ctx` is supplied by
 * `<RunModal>` every render and contains:
 *   - workflow         — the active workflow object
 *   - values, setValues — current user-input values keyed by node id
 *   - inputNodes       — collected user_input descriptors
 *   - missing          — inputs still required
 *   - busy             — run in flight
 *   - error, result    — last run outcome
 *   - progress         — streaming event list
 *   - expanded, setExpanded — trace row open-state (shared per panel)
 *   - onRun            — trigger a (re)run
 *
 * Extensions can drop a file into `builder-studio/run-extensions/*.js`
 * exporting a default panel object; it'll be picked up by Vite's glob
 * at build time. They can also call `registerRunPanel(...)` at runtime
 * (ComfyUI-style). This keeps the framework generic — no hard-coded
 * Run/Debug/Trace.
 */

const registry = new Map()
const listeners = new Set()

export function registerRunPanel(panel) {
  if (!panel || !panel.id || typeof panel.render !== 'function') {
    throw new Error('registerRunPanel: panel must have { id, render } — got ' + JSON.stringify(panel))
  }
  registry.set(panel.id, { order: 100, ...panel })
  listeners.forEach((l) => l())
  return () => { registry.delete(panel.id); listeners.forEach((l) => l()) }
}

export function unregisterRunPanel(id) {
  registry.delete(id)
  listeners.forEach((l) => l())
}

export function getRunPanels() {
  return [...registry.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
}

export function onRunPanelsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Auto-discover extension panels at build time. Files should default-export
 * a panel object. Mirrors the block registry's extensions glob.
 */
const extensionModules = import.meta.glob('../run-extensions/*.{js,jsx}', { eager: true })
for (const [path, mod] of Object.entries(extensionModules)) {
  const panel = mod?.default
  if (!panel || !panel.id || typeof panel.render !== 'function') {
    console.warn(`[builder-studio] Skipped run-panel extension at ${path} — no valid default export.`)
    continue
  }
  registry.set(panel.id, { order: 200, ...panel })
}
