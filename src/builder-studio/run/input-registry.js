/**
 * Run-input registry — lets blocks declare what inputs they need in the
 * Run panel. Each `user_input` node's sub-block values (label, kind,
 * placeholder, defaultValue, required) drive the registry automatically.
 *
 * Extensions can register custom input renderers for new `kind` values
 * (e.g. 'dropdown', 'file-upload', 'color-picker') without touching
 * the Run panel code.
 *
 * Built-in kinds: short-text, long-text, number, url, dropdown
 */

const kindRenderers = new Map()
const listeners = new Set()

/**
 * Register a custom input renderer for a `kind` value.
 * @param {string} kind — the kind string (matches user_input sub-block `kind`)
 * @param {{ render: (props) => JSX }} renderer
 *   `props` has: { value, onChange, placeholder, disabled, options }
 */
export function registerRunInputKind(kind, renderer) {
  kindRenderers.set(kind, renderer)
  listeners.forEach((l) => l())
  return () => { kindRenderers.delete(kind); listeners.forEach((l) => l()) }
}

export function getRunInputRenderer(kind) {
  return kindRenderers.get(kind) || null
}

export function onRunInputsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Collect inputs from a workflow's nodes. Each `user_input` block contributes
 * one input entry with its configured kind, label, options, etc.
 */
export function collectInputNodes(workflow) {
  if (!workflow) return []
  const nodes = workflow.nodes || []
  return nodes
    .filter((n) => n.data?.blockType === 'user_input')
    .map((n) => {
      const v = workflow.subBlockValues?.[n.id] || {}
      return {
        id: n.id,
        label: v.label || n.data?.title || 'Input',
        kind: v.kind || 'short-text',
        placeholder: v.placeholder || '',
        defaultValue: v.defaultValue || '',
        required: v.required !== false,
        options: v.options ? parseOptions(v.options) : null,
      }
    })
}

function parseOptions(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return null
}

/**
 * Auto-discover extension input renderers at build time.
 * Files should default-export `{ kind, render }`.
 */
const extensionModules = import.meta.glob('../run-extensions/inputs/*.{js,jsx}', { eager: true })
for (const [path, mod] of Object.entries(extensionModules)) {
  const ext = mod?.default
  if (!ext || !ext.kind || typeof ext.render !== 'function') {
    console.warn(`[builder-studio] Skipped run-input extension at ${path} — no valid default export.`)
    continue
  }
  kindRenderers.set(ext.kind, ext)
}
