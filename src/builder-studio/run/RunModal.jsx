/**
 * Modal that collects runtime input for every `user_input` node on the canvas
 * and executes the graph via `executeGraph`. Control-flow blocks run in JS
 * locally; agent nodes hop to the convengine backend through `run-client.js`.
 */
import { useEffect, useMemo, useState } from 'react'
import { executeGraph } from './graph-runner'
import { PlayIcon, XIcon } from '../components/icons'

export default function RunModal({ workflow, onClose }) {
  const inputNodes = useMemo(() => collectInputNodes(workflow), [workflow])
  const [values, setValues] = useState(() =>
    Object.fromEntries(inputNodes.map((n) => [n.id, n.defaultValue || '']))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState([])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function doRun() {
    setBusy(true); setError(null); setResult(null); setProgress([])
    try {
      // Validate required inputs
      for (const n of inputNodes) {
        if (n.required && !String(values[n.id] || '').trim()) {
          throw new Error(`"${n.label}" is required.`)
        }
      }
      const res = await executeGraph({
        workflow,
        inputs: values,
        onProgress: (p) => setProgress((prev) => [...prev, p]),
      })
      setResult(res)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bs-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="bs-modal" role="dialog" aria-modal="true">
        <header className="bs-modal-head">
          <div className="bs-modal-title"><PlayIcon className="bs-ico-sm" /> Run workflow</div>
          <button className="bs-modal-close" onClick={onClose} disabled={busy} title="Close">
            <XIcon className="bs-ico-sm" />
          </button>
        </header>

        <div className="bs-modal-body">
          {inputNodes.length === 0 ? (
            <div className="bs-hint">
              This workflow has no <code>User Input</code> blocks. Drop one on the canvas to prompt
              for a value at run time.
            </div>
          ) : (
            inputNodes.map((n) => (
              <div key={n.id} className="bs-field">
                <label className="bs-label">
                  {n.label}
                  {n.required && <span className="bs-required">*</span>}
                </label>
                {n.kind === 'long-text' ? (
                  <textarea
                    className="bs-textarea"
                    rows={4}
                    value={values[n.id] || ''}
                    placeholder={n.placeholder}
                    disabled={busy}
                    onChange={(e) => setValues((v) => ({ ...v, [n.id]: e.target.value }))}
                  />
                ) : (
                  <input
                    className="bs-input"
                    type={n.kind === 'number' ? 'number' : n.kind === 'url' ? 'url' : 'text'}
                    value={values[n.id] || ''}
                    placeholder={n.placeholder}
                    disabled={busy}
                    onChange={(e) => setValues((v) => ({ ...v, [n.id]: e.target.value }))}
                  />
                )}
              </div>
            ))
          )}

          {error && <div className="bs-alert bs-alert-error">{error}</div>}

          {progress.length > 0 && (
            <div className="bs-run-progress">
              {progress.map((p, i) => (
                <div key={i} className={`bs-run-step is-${p.type}`}>
                  <span className="bs-run-step-dot" />
                  <span className="bs-run-step-label">{p.blockType || ''}</span>
                  <span className="bs-run-step-node">{p.nodeId}</span>
                  <span className="bs-run-step-state">{p.type}</span>
                </div>
              ))}
            </div>
          )}

          {result && (
            <div className="bs-run-result">
              <div className="bs-panel-subtitle">Final output</div>
              <pre className="bs-run-output">{typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}</pre>
              {Array.isArray(result.trace) && result.trace.length > 0 && (
                <>
                  <div className="bs-panel-subtitle">Trace</div>
                  <ol className="bs-run-trace">
                    {result.trace.map((t, i) => (
                      <li key={i}>
                        <span className="bs-run-trace-node">{t.title || t.blockType}</span>
                        <span className="bs-run-trace-io">{t.error ? '⚠ ' + t.error : t.output}</span>
                        {t.ms != null && <span className="bs-run-trace-ms">{t.ms}ms</span>}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
        </div>

        <footer className="bs-modal-foot">
          <button className="bs-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="bs-btn-primary" onClick={doRun} disabled={busy}>
            <PlayIcon className="bs-ico-sm" />
            {busy ? 'Running…' : 'Run'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function collectInputNodes(workflow) {
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
      }
    })
}
