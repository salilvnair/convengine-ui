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
import { useState } from 'react'
import JsonView from '../JsonView'
import ErrorDetailView from './ErrorDetailView'

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
 * Collapsible disclosure section — SwiftUI GroupBox style.
 * Starts open or closed based on `defaultOpen`.
 */
function Disclosure({ label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`bs-disclosure ${open ? 'is-open' : ''}`}>
      <button className="bs-disclosure-head" onClick={() => setOpen((v) => !v)}>
        <span className="bs-disclosure-caret">{open ? '▾' : '▸'}</span>
        <span className="bs-disclosure-label">{label}</span>
      </button>
      {open && <div className="bs-disclosure-body">{children}</div>}
    </div>
  )
}

/**
 * Expanded per-step detail view. Uses SwiftUI-inspired disclosure sections
 * with light translucent cards. Key facts shown inline as pills/chips,
 * heavier content (JSON, prompts) behind collapsible sections.
 */
function DebugDetails({ event, deltaMs }) {
  const { type, nodeId, blockType, title, output, error, errorDetail, meta, ms, values } = event
  return (
    <div className="bs-debug-detail">
      {/* ── Inline metadata chips ── */}
      <div className="bs-debug-chips">
        <Chip label="Event" value={type} variant={type} />
        <Chip label="Card" value={title || nodeId} />
        <Chip label="Node" value={nodeId} mono />
        {blockType && <Chip label="Type" value={blockType} mono />}
        <Chip label="At" value={`+${deltaMs}ms`} />
        {ms != null && <Chip label="Duration" value={`${ms}ms`} />}
        {meta?.model && <Chip label="Model" value={meta.model} mono />}
        {meta?.temperature != null && <Chip label="Temp" value={String(meta.temperature)} />}
        {Array.isArray(meta?.skillIds) && meta.skillIds.length > 0 && (
          <Chip label="Skills" value={meta.skillIds.join(', ')} />
        )}
      </div>

      {/* ── Card fields ── */}
      {values && Object.keys(values).length > 0 && (
        <Disclosure label="Card fields" defaultOpen>
          <div className="bs-debug-fields">
            {Object.entries(values).map(([k, v]) => {
              if (v === '' || v == null || k.startsWith('__')) return null
              const display = typeof v === 'object' ? JSON.stringify(v) : String(v)
              const isUrl = typeof display === 'string' && /^https?:\/\//.test(display)
              return (
                <span key={k} className="bs-debug-chip chip-field">
                  <span className="bs-debug-chip-k">{k.toUpperCase()}</span>
                  {isUrl
                    ? <a className="bs-debug-chip-v is-link is-mono" href={display} target="_blank" rel="noopener noreferrer">{display}</a>
                    : <span className="bs-debug-chip-v">{display}</span>
                  }
                </span>
              )
            })}
          </div>
        </Disclosure>
      )}

      {/* ── Error ── */}
      {error && (
        <Disclosure label="Error" defaultOpen>
          <ErrorDetailView error={error} errorDetail={errorDetail} />
        </Disclosure>
      )}

      {/* ── Prompts ── */}
      {meta?.systemPrompt != null && (
        <Disclosure label="System prompt">
          <pre className="bs-debug-pre">{meta.systemPrompt || 'empty'}</pre>
        </Disclosure>
      )}
      {meta?.userPrompt != null && (
        <Disclosure label="User prompt" defaultOpen>
          <pre className="bs-debug-pre">{meta.userPrompt || 'empty'}</pre>
        </Disclosure>
      )}

      {/* ── Template bag ── */}
      {meta?.templateBag && (
        <Disclosure label="Template bag">
          <div className="bs-debug-json"><JsonView value={meta.templateBag} /></div>
        </Disclosure>
      )}

      {/* ── Skill runs ── */}
      {Array.isArray(meta?.skillRuns) && meta.skillRuns.length > 0 && (
        <Disclosure label="Skill runs">
          <div className="bs-debug-json"><JsonView value={meta.skillRuns} /></div>
        </Disclosure>
      )}

      {/* ── Raw agent response ── */}
      {meta?.rawAgentResponse && (
        <Disclosure label="Raw agent response">
          <div className="bs-debug-json"><JsonView value={meta.rawAgentResponse} /></div>
        </Disclosure>
      )}

      {/* ── Output ── */}
      {output != null && type === 'done' && (
        <Disclosure label="Output" defaultOpen>
          {typeof output === 'string' && /^https?:\/\//.test(output.trim())
            ? <div className="bs-debug-json"><a className="bs-output-url" href={output.trim()} target="_blank" rel="noopener noreferrer">{output}</a></div>
            : <div className="bs-debug-json"><JsonView value={output} /></div>
          }
        </Disclosure>
      )}
    </div>
  )
}

/** Chip color palette keyed by label (case-insensitive). */
const CHIP_COLORS = {
  event:    'chip-event',
  card:     'chip-card',
  node:     'chip-node',
  type:     'chip-type',
  at:       'chip-time',
  duration: 'chip-time',
  model:    'chip-model',
  temp:     'chip-model',
  skills:   'chip-skill',
  status:   'chip-status',
  cause:    'chip-error',
  message:  'chip-error',
  url:      'chip-url',
}

function Chip({ label, value, mono, variant }) {
  const colorClass = variant ? `is-${variant}` : (CHIP_COLORS[label.toLowerCase()] || '')
  // Detect URL values and make them clickable
  const isUrl = typeof value === 'string' && /^https?:\/\//.test(value)
  return (
    <span className={`bs-debug-chip ${colorClass}`}>
      <span className="bs-debug-chip-k">{label}</span>
      {isUrl
        ? <a className={`bs-debug-chip-v is-link ${mono ? 'is-mono' : ''}`} href={value} target="_blank" rel="noopener noreferrer">{value}</a>
        : <span className={`bs-debug-chip-v ${mono ? 'is-mono' : ''}`}>{value}</span>
      }
    </span>
  )
}

export default DebugPanel
