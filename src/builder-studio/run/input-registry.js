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
      const kind = hasValue(v.kind) ? v.kind : 'short-text'
      const parsedOptions = parseOptions(v.optionPairs, v.options)
      return {
        id: n.id,
        label: hasValue(v.label) ? v.label : (n.data?.title || 'Input'),
        kind,
        placeholder: hasValue(v.placeholder) ? v.placeholder : '',
        defaultValue: parseDefaultValue(kind, v.defaultValue),
        required: v.required !== false,
        options: parsedOptions,
        min: parseNumberish(v.min),
        max: parseNumberish(v.max),
        step: parseNumberish(v.step),
        accept: hasValue(v.accept) ? v.accept : '',
        checkedValue: hasValue(v.checkedValue) ? v.checkedValue : null,
        uncheckedValue: hasValue(v.uncheckedValue) ? v.uncheckedValue : null,
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
  // If a defaultValue is configured and the current value is empty, the default
  // will be used at run time — treat it as satisfied, no validation error.
  const effectiveValue = (spec.isEmpty(value) && node.defaultValue != null && !spec.isEmpty(node.defaultValue))
    ? node.defaultValue
    : value
  if (node.required && spec.isEmpty(effectiveValue)) return `"${node.label}" is required.`
  if (String(value).trim() === '') return null // empty + not required = ok
  return spec.validate(value, node)
}

/** Coerce a raw value through the kind's normaliser.
 *  Falls back to node.defaultValue when value is empty. */
export function coerceInput(node, value) {
  const spec = kindRegistry.get(node.kind) || kindRegistry.get('short-text')
  // Use defaultValue as fallback if the user left the field empty
  const effective = (spec && spec.isEmpty(value) && node.defaultValue != null && !spec.isEmpty(node.defaultValue))
    ? node.defaultValue
    : value
  return spec ? spec.coerce(effective) : effective
}

// ─── helpers ────────────────────────────────────────────────────────

function parseOptions(tableRows, raw) {
  if (Array.isArray(tableRows) && tableRows.length > 0) {
    const mapped = tableRows
      .map((row) => {
        if (!Array.isArray(row)) return null
        const label = String(row[0] ?? '').trim()
        const value = String(row[1] ?? '').trim()
        if (!label || !value) return null
        return { label, value }
      })
      .filter(Boolean)
    if (mapped.length > 0) return mapped
  }

  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed).map(([label, value]) => ({ label, value: String(value) }))
      }
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

function parseDefaultValue(kind, value) {
  if (!hasValue(value)) {
    if (kind === 'checkbox' || kind === 'toggle') return false
    if (kind === 'checkbox-group') return []
    return ''
  }

  if (kind === 'checkbox' || kind === 'toggle') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase()
      if (lower === 'true') return true
      if (lower === 'false') return false
    }
    return value
  }

  if (kind === 'checkbox-group') {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed
      } catch {
        return value.split(',').map((s) => s.trim()).filter(Boolean)
      }
    }
    return []
  }

  if (kind === 'number' || kind === 'range') {
    const n = parseNumberish(value)
    return n == null ? '' : n
  }

  return value
}

function parseNumberish(value) {
  if (!hasValue(value)) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function hasValue(value) {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')
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
