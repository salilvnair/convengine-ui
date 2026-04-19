/**
 * Run-input registry — extensible framework for runtime input kinds.
 *
 * Each registered kind defines:
 *   - render(props)   — JSX factory  (value, onChange, placeholder, disabled, options, config)
 *   - isEmpty(value)  — return true when the value should be considered empty
 *   - validate(value, config) — return null (ok) or an error-message string
 *   - coerce(value)   — normalise raw value before sending to the runner
 *   - defaultValue    — initial value when none is set
 *
 * Core kinds are registered below. Extensions can add more by either:
 *   a) calling `registerRunInputKind(kind, spec)` at runtime, or
 *   b) dropping a file in `run-extensions/inputs/` that default-exports
 *      `{ kind, ...spec }`.
 *
 * The RunPanel never hard-codes widget logic — it calls `getRunInputRenderer()`
 * and falls back to `short-text` if the kind is unknown.
 */

// ─── registry internals ─────────────────────────────────────────────
const kindRegistry = new Map()
const listeners = new Set()

function notify() { listeners.forEach((l) => l()) }

// ─── public API ─────────────────────────────────────────────────────

/**
 * Register (or replace) a run-input kind.
 * @param {string} kind
 * @param {object} spec — { render, isEmpty?, validate?, coerce?, defaultValue? }
 * @returns {() => void} unregister function
 */
export function registerRunInputKind(kind, spec) {
  kindRegistry.set(kind, normaliseSpec(spec))
  notify()
  return () => { kindRegistry.delete(kind); notify() }
}

/** Look up a kind spec. Returns the full normalised object or null. */
export function getRunInputRenderer(kind) {
  return kindRegistry.get(kind) || null
}

/** Get every registered kind id. */
export function getRegisteredKinds() {
  return [...kindRegistry.keys()]
}

export function onRunInputsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ─── input node collection ──────────────────────────────────────────

/**
 * Collect inputs from a workflow's user_input nodes.
 * Returns an array of InputNode objects.
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
        min: v.min,
        max: v.max,
        step: v.step,
        accept: v.accept,
      }
    })
}

/**
 * Validate a single input value against its kind's rules.
 * @returns {string|null} error message or null
 */
export function validateInput(node, value) {
  const spec = kindRegistry.get(node.kind) || kindRegistry.get('short-text')
  if (!spec) return null
  if (node.required && spec.isEmpty(value)) return `"${node.label}" is required.`
  if (String(value).trim() === '') return null // empty + not required = ok
  return spec.validate(value, node)
}

/** Coerce a raw value through the kind's normaliser. */
export function coerceInput(node, value) {
  const spec = kindRegistry.get(node.kind) || kindRegistry.get('short-text')
  return spec ? spec.coerce(value) : value
}

// ─── helpers ────────────────────────────────────────────────────────

function parseOptions(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return null
}

function normaliseSpec(spec) {
  return {
    render: spec.render,
    isEmpty: spec.isEmpty || ((v) => !String(v ?? '').trim()),
    validate: spec.validate || (() => null),
    coerce: spec.coerce || ((v) => v),
    defaultValue: spec.defaultValue ?? '',
  }
}

// ─── core kinds ─────────────────────────────────────────────────────
// Core kind render functions live in input-kinds.jsx (JSX needs .jsx ext).
// That file imports registerRunInputKind and self-registers on import.
// It is imported from run-panel.jsx to avoid circular-init issues.

// ─── extension auto-discover ────────────────────────────────────────

const extensionModules = import.meta.glob('../run-extensions/inputs/*.{js,jsx}', { eager: true })
for (const [path, mod] of Object.entries(extensionModules)) {
  const ext = mod?.default
  if (!ext || !ext.kind) {
    console.warn(`[builder-studio] Skipped run-input extension at ${path} — no valid default export.`)
    continue
  }
  registerRunInputKind(ext.kind, ext)
}
