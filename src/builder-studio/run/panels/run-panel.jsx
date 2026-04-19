/**
 * Built-in "Run" panel — every user_input is listed here with its
 * configured `kind` driving the input widget via the input registry.
 *
 * Supported kinds out of the box: short-text, long-text, number, url, dropdown.
 * Extensions can register custom kinds via `registerRunInputKind(kind, renderer)`.
 */
import JsonView from '../JsonView'
import { getRunInputRenderer } from '../input-registry'
import '../input-kinds'  // register core input kinds (side-effect)
import ErrorDetailView from './ErrorDetailView'

const RunPanel = {
  id: 'run',
  label: 'Run',
  order: 10,
  render(ctx) {
    const { inputNodes, values, setValues, busy, onRun, error, result } = ctx

    return (
      <div className="bs-run-tab bs-run-tab-run">
        {inputNodes.length > 0 && (
          <div className="bs-run-dock-inputs">
            <div className="bs-panel-subtitle">Inputs</div>
            {inputNodes.map((n) => {
              const v = values[n.id] || ''
              const filled = String(v).trim().length > 0
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
          <div className="bs-run-result">
            <div className="bs-panel-subtitle">Final output</div>
            <div className="bs-json-wrap bs-json-wrap-wordwrap">
              <JsonView value={result.output} />
            </div>
          </div>
        ) : (
          !error && !busy && inputNodes.length === 0 && (
            <div className="bs-run-empty">Ready. Click <kbd>Run</kbd> to execute the workflow.</div>
          )
        )}
      </div>
    )
  },
}

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

export default RunPanel
