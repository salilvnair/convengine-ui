/**
 * Built-in "Run" panel — every user_input is listed here (not hidden the
 * moment it has a value), plus the final output after a successful run.
 *
 * The earlier bug: once you pasted a value, `missing` went empty and the
 * whole body disappeared. Now inputs always render; filled fields simply
 * show green check state and the Run button stays available.
 */
import { PlayIcon } from '../../components/icons'
import JsonView from '../JsonView'

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
                  {n.kind === 'long-text' ? (
                    <textarea
                      className="bs-textarea" rows={3}
                      value={v}
                      placeholder={n.placeholder}
                      disabled={busy}
                      onChange={(e) => setValues((s) => ({ ...s, [n.id]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className="bs-input"
                      type={n.kind === 'number' ? 'number' : n.kind === 'url' ? 'url' : 'text'}
                      value={v}
                      placeholder={n.placeholder}
                      disabled={busy}
                      onChange={(e) => setValues((s) => ({ ...s, [n.id]: e.target.value }))}
                    />
                  )}
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

        {error && <div className="bs-alert bs-alert-error">{error}</div>}

        {result ? (
          <div className="bs-run-result">
            <div className="bs-panel-subtitle">Final output</div>
            <div className="bs-json-wrap">
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

export default RunPanel
