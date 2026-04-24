/**
 * Built-in "Run" panel — every user_input is listed here with its
 * configured `kind` driving the input widget via the input registry.
 *
 * Supported kinds out of the box: short-text, long-text, number, url, dropdown.
 * Extensions can register custom kinds via `registerRunInputKind(kind, renderer)`.
 */
import { useState } from 'react'
import JsonView from '../JsonView'
import { getRunInputRenderer } from '../input-registry'
import '../input-kinds'  // register core input kinds (side-effect)
import ErrorDetailView from './ErrorDetailView'

const RunPanel = {
  id: 'run',
  label: 'Run',
  order: 10,
  render(ctx) {
    const { inputNodes, values, setValues, busy, onRun, error, result, invalidInputs } = ctx

    return (
      <div className="bs-run-tab bs-run-tab-run">
        {inputNodes.length > 0 && (
          <div className="bs-run-dock-inputs">
            <div className="bs-panel-subtitle">Inputs</div>
            {inputNodes.map((n) => {
              const v = Object.prototype.hasOwnProperty.call(values, n.id) ? values[n.id] : n.defaultValue
              const filled = isFilled(n, v)
              const fieldError = invalidInputs?.[n.id]?.message ?? invalidInputs?.[n.id] ?? null
              return (
                <div key={n.id} className="bs-field bs-field-row">
                  <label className="bs-label">
                    <span className={`bs-field-dot ${filled ? 'is-ok' : n.required ? 'is-req' : ''}`} />
                    {n.label}
                    {n.required && <span className="bs-required">*</span>}
                  </label>
                  <RunInput
                    node={n}
                    value={v}
                    disabled={busy}
                    onChange={(val) => setValues((s) => ({ ...s, [n.id]: val }))}
                  />
                  {fieldError && <div className="bs-field-help bs-field-help-error">{fieldError}</div>}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="bs-run-error-detail">
            <div className="bs-alert bs-alert-error">{error}</div>
            {result?.trace?.filter((t) => t.error).map((t, i) => (
              <ErrorDetailView key={i} errorDetail={t.errorDetail} />
            ))}
          </div>
        )}

        {result ? (
          <RunResult result={result} />
        ) : (
          !error && !busy && inputNodes.length === 0 && (
            <div className="bs-run-empty">
              Ready.{' '}
              <button className="bs-btn-run-green bs-btn-sm bs-run-empty-run-btn" onClick={onRun}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Run
              </button>
            </div>
          )
        )}
      </div>
    )
  },
}

/* ── Beautified output with expand / collapse sections ── */

function RunResult({ result }) {
  const output = result.output
  const isObj = output != null && typeof output === 'object' && !Array.isArray(output)

  return (
    <div className="bs-run-result-v2">
      <div className="bs-run-result-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span className="bs-run-result-title">Output</span>
        {result.trace && <span className="bs-run-result-badge">{result.trace.length} node{result.trace.length !== 1 ? 's' : ''}</span>}
      </div>

      {isObj ? (
        <div className="bs-run-result-sections">
          {Object.entries(output).map(([key, val]) => (
            <ResultDisclosure key={key} label={key} value={val} defaultOpen />
          ))}
        </div>
      ) : (
        <div className="bs-run-result-single">
          <div className="bs-json-wrap bs-json-wrap-wordwrap">
            <JsonView value={output} />
          </div>
        </div>
      )}
    </div>
  )
}

function ResultDisclosure({ label, value, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const isUrl = typeof value === 'string' && /^https?:\/\//.test(value.trim())
  const preview = shortPreview(value)

  return (
    <div className={`bs-result-disclosure ${open ? 'is-open' : ''}`}>
      <button className="bs-result-disclosure-head" onClick={() => setOpen((v) => !v)}>
        <span className="bs-result-disclosure-caret">{open ? '▾' : '▸'}</span>
        <span className="bs-result-disclosure-key">{label}</span>
        {!open && <span className="bs-result-disclosure-preview">{preview}</span>}
        <TypeBadge value={value} />
      </button>
      {open && (
        <div className="bs-result-disclosure-body">
          {isUrl ? (
            <a className="bs-output-url" href={value.trim()} target="_blank" rel="noopener noreferrer">{value}</a>
          ) : (
            <div className="bs-json-wrap bs-json-wrap-wordwrap bs-json-wrap-compact">
              <JsonView value={value} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ value }) {
  let t = 'null'
  if (Array.isArray(value)) t = `array[${value.length}]`
  else if (value != null) t = typeof value
  const cls = t.startsWith('array') ? 'is-arr' : t === 'string' ? 'is-str' : t === 'number' ? 'is-num' : t === 'object' ? 'is-obj' : t === 'boolean' ? 'is-bool' : ''
  return <span className={`bs-result-type-badge ${cls}`}>{t}</span>
}

function shortPreview(v) {
  if (v == null) return 'null'
  const s = typeof v === 'string' ? v : safeJson(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}
function safeJson(v) { try { return JSON.stringify(v) } catch { return String(v) } }

/**
 * Renders the appropriate input widget based on the node's `kind`.
 * Looks up the registry — every kind (including core ones) is registered
 * there. Falls back to short-text for unknown kinds.
 */
function RunInput({ node, value, disabled, onChange }) {
  const spec = getRunInputRenderer(node.kind) || getRunInputRenderer('short-text')
  if (!spec) return null
  return spec.render({
    value,
    onChange,
    placeholder: node.placeholder,
    disabled,
    options: node.options,
    label: node.label,
    config: node,
  })
}

function isFilled(node, value) {
  const spec = getRunInputRenderer(node.kind) || getRunInputRenderer('short-text')
  if (!spec || typeof spec.isEmpty !== 'function') return String(value ?? '').trim().length > 0
  return !spec.isEmpty(value, node)
}

export default RunPanel
