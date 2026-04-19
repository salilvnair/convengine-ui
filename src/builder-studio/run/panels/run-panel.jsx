/**
 * Built-in "Run" panel — every user_input is listed here with its
 * configured `kind` driving the input widget via the input registry.
 *
 * Supported kinds out of the box: short-text, long-text, number, url, dropdown.
 * Extensions can register custom kinds via `registerRunInputKind(kind, renderer)`.
 */
import { PlayIcon } from '../../components/icons'
import JsonView from '../JsonView'
import { getRunInputRenderer } from '../input-registry'

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
            <div className="bs-run-dock-inputs-foot">
              <button className="bs-btn-primary" onClick={onRun} disabled={busy}>
                <PlayIcon className="bs-ico-sm" /> {busy ? 'Running…' : 'Run'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bs-run-error-detail">
            <div className="bs-alert bs-alert-error">{error}</div>
            {result?.trace?.filter((t) => t.error).map((t, i) => {
              const d = t.errorDetail || {}
              return (
                <div key={i} className="bs-run-error-breakdown">
                  {d.url && (
                    <div className="bs-run-log-kv-row">
                      <span className="bs-run-log-kv-k">URL</span>
                      <span className="bs-run-log-kv-v"><code>{d.method || 'GET'} {d.url}</code></span>
                    </div>
                  )}
                  {d.status && (
                    <div className="bs-run-log-kv-row">
                      <span className="bs-run-log-kv-k">HTTP Status</span>
                      <span className="bs-run-log-kv-v"><code>{d.status} {d.statusText || ''}</code></span>
                    </div>
                  )}
                  {d.blockType && (
                    <div className="bs-run-log-kv-row">
                      <span className="bs-run-log-kv-k">Block</span>
                      <span className="bs-run-log-kv-v"><code>{d.blockType}</code> — {d.nodeTitle || d.nodeId}</span>
                    </div>
                  )}
                  {d.responseBody && (
                    <pre className="bs-run-log-pre" style={{ marginTop: 6, maxHeight: 160, overflow: 'auto' }}>{d.responseBody}</pre>
                  )}
                </div>
              )
            })}
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
 * First checks the registry for a custom renderer, then falls back to
 * built-in kinds.
 */
function RunInput({ node, value, disabled, onChange }) {
  // Check for a custom registered renderer
  const custom = getRunInputRenderer(node.kind)
  if (custom) {
    return custom.render({
      value,
      onChange,
      placeholder: node.placeholder,
      disabled,
      options: node.options,
      label: node.label,
    })
  }

  // Built-in kinds
  switch (node.kind) {
    case 'long-text':
      return (
        <textarea
          className="bs-textarea" rows={3}
          value={value}
          placeholder={node.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'dropdown':
      return (
        <select
          className="bs-input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{node.placeholder || 'Select…'}</option>
          {(node.options || []).map((opt) => {
            const label = typeof opt === 'object' ? opt.label : opt
            const val = typeof opt === 'object' ? (opt.value ?? opt.label) : opt
            return <option key={val} value={val}>{label}</option>
          })}
        </select>
      )

    case 'number':
      return (
        <input
          className="bs-input" type="number"
          value={value}
          placeholder={node.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'url':
      return (
        <input
          className="bs-input" type="url"
          value={value}
          placeholder={node.placeholder || 'https://...'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'short-text':
    default:
      return (
        <input
          className="bs-input" type="text"
          value={value}
          placeholder={node.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

export default RunPanel
