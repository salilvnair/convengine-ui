/**
 * Built-in "Trace" panel — per-node grid; each row expands to show the full
 * input / configured values / runtime meta / output as colorized JSON.
 *
 * Fixes the earlier "only short preview" limitation: the expanded row now
 * shows the raw object the runner produced, not the truncated string that
 * used to live on `t.output`.
 */
import JsonView from '../JsonView'
import ErrorDetailView from './ErrorDetailView'

function exportJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const TracePanel = {
  id: 'trace',
  label: 'Trace',
  order: 30,
  badge: (ctx) => ctx.result?.trace?.length || null,
  render(ctx) {
    const trace = ctx.result?.trace || []
    if (trace.length === 0) {
      return <div className="bs-run-empty">Trace shows every node's input/output after a run completes.</div>
    }
    return (
      <div className="bs-run-tab">
        <div className="bs-run-tab-toolbar">
          <button
            className="bs-btn-ghost bs-btn-sm"
            onClick={() => exportJson({ trace, result: ctx.result }, `trace-${Date.now()}.json`)}
            title="Export trace as JSON"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export JSON
          </button>
        </div>
        <div className="bs-run-trace-grid">
          <div className="bs-run-trace-head">
            <span /> <span>Node</span><span>Output</span><span>ms</span>
          </div>
          {trace.map((t, i) => {
            const key = `tr:${i}`
            const isOpen = !!ctx.expanded[key]
            const shortOut = t.error ? `⚠ ${t.error}` : shortPreview(t.output)
            return (
              <div key={i}>
                <div
                  className={`bs-run-trace-row is-clickable ${t.error ? 'is-error' : ''}`}
                  onClick={() => ctx.setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                  role="button"
                >
                  <span className="bs-run-trace-caret">{isOpen ? '▼' : '▶'}</span>
                  <span className="bs-run-trace-node">{t.title || t.blockType}</span>
                  <span className="bs-run-trace-io" title={shortOut}>{shortOut}</span>
                  <span className="bs-run-trace-ms">{t.ms != null ? `${t.ms}ms` : ''}</span>
                </div>
                {isOpen && (
                  <div className="bs-run-trace-expand">
                    <div className="bs-run-log-kv">
                      <KV k="Node" v={t.title || t.nodeId} />
                      <KV k="Node ID" v={<code>{t.nodeId}</code>} />
                      <KV k="Block type" v={<code>{t.blockType}</code>} />
                      {t.ms != null && <KV k="Duration" v={`${t.ms}ms`} />}
                    </div>

                    {t.error && (
                      <>
                        <div className="bs-panel-subtitle">Error</div>
                        <ErrorDetailView error={t.error} errorDetail={t.errorDetail} />
                      </>
                    )}

                    <div className="bs-panel-subtitle">Input</div>
                    <div className="bs-json-wrap"><JsonView value={t.input ?? ''} /></div>

                    {t.values && Object.keys(t.values).length > 0 && (
                      <>
                        <div className="bs-panel-subtitle">Configured values</div>
                        <div className="bs-json-wrap"><JsonView value={t.values} /></div>
                      </>
                    )}

                    {t.meta && (
                      <>
                        <div className="bs-panel-subtitle">Runtime meta</div>
                        <div className="bs-json-wrap"><JsonView value={t.meta} /></div>
                      </>
                    )}

                    <div className="bs-panel-subtitle">Output</div>
                    <div className="bs-json-wrap">
                      <JsonView value={t.error ? { error: t.error } : t.output} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  },
}

function KV({ k, v }) {
  return (
    <div className="bs-run-log-kv-row">
      <span className="bs-run-log-kv-k">{k}</span>
      <span className="bs-run-log-kv-v">{v}</span>
    </div>
  )
}

function shortPreview(v) {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : safeJson(v)
  return s.length > 160 ? s.slice(0, 160) + '…' : s
}
function safeJson(v) { try { return JSON.stringify(v) } catch { return String(v) } }

export default TracePanel
