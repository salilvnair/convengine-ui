/**
 * Built-in "Debug" panel — IntelliJ-style per-step event log. Each row is
 * clickable; expanded, it dumps everything we know about the step (block
 * type, node id, elapsed time, payload size, and the full `meta` attached
 * by the runner — prompts after templating, skill runs, model, etc.).
 *
 * Collapsed rows stay compact so a long run doesn't drown the panel; the
 * expanded pane is the "wiki-of-details" the user asked for. Extensions
 * that push additional `onProgress` events with a `meta` field plug in
 * automatically — no new UI work required.
 */
import JsonView from '../JsonView'

function exportJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const DebugPanel = {
  id: 'debug',
  label: 'Debug',
  order: 20,
  badge: (ctx) => ctx.progress.length || null,
  render(ctx) {
    const { progress, expanded, setExpanded } = ctx
    if (progress.length === 0) {
      return (
        <div className="bs-run-empty">
          No run yet. Every <kbd>start</kbd> / <kbd>done</kbd> / <kbd>error</kbd> event
          the graph-runner emits streams here in order. Click a row to expand full step details.
        </div>
      )
    }
    const t0 = progress[0].at
    // Prefix the expansion keys with "dbg:" so the Trace panel's separate
    // `expanded` map doesn't collide with Debug rows.
    return (
      <div className="bs-run-tab">
        <div className="bs-run-tab-toolbar">
          <button
            className="bs-btn-ghost bs-btn-sm"
            onClick={() => exportJson(progress, `debug-${Date.now()}.json`)}
            title="Export debug log as JSON"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export JSON
          </button>
        </div>
        <div className="bs-run-log">
          <div className="bs-run-log-row bs-run-log-head">
            <span className="bs-run-log-caret" />
            <span className="bs-run-log-dot" />
            <span className="bs-run-log-time">Time</span>
            <span className="bs-run-log-block">Block</span>
            <span className="bs-run-log-node">Card</span>
            <span className="bs-run-log-state">Status</span>
          </div>
          {progress.map((p, i) => {
            const key = `dbg:${i}`
            const isOpen = !!expanded[key]
            const delta = p.at - t0
            return (
              <div key={i} className="bs-run-log-item">
                <div
                  className={`bs-run-log-row is-${p.type} is-clickable`}
                  onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                  role="button"
                  aria-expanded={isOpen}
                >
                  <span className="bs-run-log-caret">{isOpen ? '▼' : '▶'}</span>
                  <span className={`bs-run-log-dot is-${p.type}`} />
                  <span className="bs-run-log-time">+{String(delta).padStart(4, ' ')}ms</span>
                  <span className="bs-run-log-block">{p.blockType || '—'}</span>
                  <span className="bs-run-log-node" title={p.nodeId}>{p.title || p.nodeId}</span>
                  <span className={`bs-run-log-state is-${p.type}`}>{p.type}</span>
                </div>
                {isOpen && <DebugDetails event={p} deltaMs={delta} />}
              </div>
            )
          })}
        </div>
      </div>
    )
  },
}

/**
 * Expanded per-step "wiki" view. Lays out the key facts as a label → value
 * grid, then renders the rich panels (prompts, skills, output) as separate
 * colorized JSON sections. Anything the runner attaches on `meta` shows up
 * here — so extensions can add their own diagnostic fields without touching
 * this file.
 */
function DebugDetails({ event, deltaMs }) {
  const { type, nodeId, blockType, title, output, error, errorDetail, meta, ms, values } = event
  return (
    <div className="bs-run-log-expand">
      <div className="bs-run-log-kv">
        <KV k="Event" v={type} />
        <KV k="Card" v={<strong>{title || nodeId}</strong>} />
        <KV k="Node ID" v={<code>{nodeId}</code>} />
        <KV k="Block type" v={<code>{blockType || '—'}</code>} />
        <KV k="At" v={`+${deltaMs}ms from run start`} />
        {ms != null && <KV k="Duration" v={`${ms}ms`} />}
        {meta?.model && <KV k="Model" v={<code>{meta.model}</code>} />}
        {meta?.temperature != null && <KV k="Temperature" v={String(meta.temperature)} />}
        {Array.isArray(meta?.skillIds) && meta.skillIds.length > 0 && (
          <KV k="Skills" v={meta.skillIds.join(', ')} />
        )}
      </div>

      {/* Sub-block metadata (label, kind, placeholder, etc.) */}
      {values && Object.keys(values).length > 0 && (
        <>
          <div className="bs-panel-subtitle">Card fields</div>
          <div className="bs-run-log-kv bs-run-log-kv-fields">
            {Object.entries(values).map(([k, v]) => {
              if (v === '' || v == null || k.startsWith('__')) return null
              const display = typeof v === 'object' ? JSON.stringify(v) : String(v)
              return <KV key={k} k={k} v={<code>{display}</code>} />
            })}
          </div>
        </>
      )}

      {error && (
        <>
          <div className="bs-panel-subtitle">Error</div>
          <div className="bs-alert bs-alert-error" style={{ marginTop: 0 }}>{error}</div>
          {errorDetail && (errorDetail.url || errorDetail.status) && (
            <div className="bs-run-log-kv" style={{ marginTop: 8 }}>
              {errorDetail.url && <KV k="URL" v={<code>{errorDetail.method || 'GET'} {errorDetail.url}</code>} />}
              {errorDetail.status && <KV k="HTTP Status" v={<code>{errorDetail.status} {errorDetail.statusText || ''}</code>} />}
              {errorDetail.responseBody && (
                <KV k="Response" v={<pre className="bs-run-log-pre" style={{ margin: 0, maxHeight: 120, overflow: 'auto' }}>{errorDetail.responseBody}</pre>} />
              )}
            </div>
          )}
        </>
      )}

      {meta?.systemPrompt != null && (
        <>
          <div className="bs-panel-subtitle">System prompt (after templating)</div>
          <pre className="bs-run-log-pre">{meta.systemPrompt || <em>empty</em>}</pre>
        </>
      )}
      {meta?.userPrompt != null && (
        <>
          <div className="bs-panel-subtitle">User prompt (after templating)</div>
          <pre className="bs-run-log-pre">{meta.userPrompt || <em>empty</em>}</pre>
        </>
      )}
      {meta?.templateBag && (
        <>
          <div className="bs-panel-subtitle">Template bag</div>
          <div className="bs-json-wrap"><JsonView value={meta.templateBag} /></div>
        </>
      )}
      {Array.isArray(meta?.skillRuns) && meta.skillRuns.length > 0 && (
        <>
          <div className="bs-panel-subtitle">Skill runs</div>
          <div className="bs-json-wrap"><JsonView value={meta.skillRuns} /></div>
        </>
      )}
      {meta?.rawAgentResponse && (
        <>
          <div className="bs-panel-subtitle">Raw agent response</div>
          <div className="bs-json-wrap"><JsonView value={meta.rawAgentResponse} /></div>
        </>
      )}
      {output != null && type === 'done' && (
        <>
          <div className="bs-panel-subtitle">Output</div>
          <div className="bs-json-wrap"><JsonView value={output} /></div>
        </>
      )}
    </div>
  )
}

function KV({ k, v }) {
  return (
    <div className="bs-run-log-kv-row">
      <span className="bs-run-log-kv-k">{k}</span>
      <span className="bs-run-log-kv-v">{v}</span>
    </div>
  )
}

export default DebugPanel
