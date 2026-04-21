/**
 * Shared error detail renderer used by Debug, Trace, Problems, and Run panels.
 * Shows the full HTTP request/response breakdown: URL, status, headers,
 * payload, response body, and stack trace.
 */
import { useState } from 'react'
import JsonView from '../JsonView'

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

export default function ErrorDetailView({ error, errorDetail: d }) {
  if (!d && !error) return null
  return (
    <div className="bs-error-detail-view">
      {error && (
        <div className="bs-alert bs-alert-error" style={{ marginTop: 0 }}>{error}</div>
      )}
      {d && (
        <div className="bs-debug-chips" style={{ marginTop: 2 }}>
          {d.status && <Chip label="Status" value={`${d.status} ${d.statusText || ''}`} variant={d.status >= 500 ? 'error' : d.status >= 400 ? 'warning' : ''} />}
          {d.blockType && <Chip label="Type" value={d.blockType} mono />}
          {d.nodeId && <Chip label="Node" value={d.nodeId} mono />}
          {d.nodeTitle && <Chip label="Card" value={d.nodeTitle} />}
          {d.timestamp && <Chip label="Time" value={d.timestamp} />}
          {d.cause && <Chip label="Cause" value={d.cause} />}
          {d.message && <Chip label="Message" value={d.message} />}
          {d.totalNodes != null && <Chip label="Nodes" value={d.totalNodes} />}
          {d.totalEdges != null && <Chip label="Edges" value={d.totalEdges} />}
          {d.reachableCount != null && <Chip label="Reachable" value={d.reachableCount} />}
        </div>
      )}
      {d?.unreachableNodes && d.unreachableNodes.length > 0 && (
        <Disclosure label={`Unreachable nodes (${d.unreachableNodes.length})`} defaultOpen>
          <div className="bs-debug-chips" style={{ flexWrap: 'wrap' }}>
            {d.unreachableNodes.map((nd, i) => (
              <Chip key={i} label={nd.blockType || '?'} value={nd.title} variant="error" />
            ))}
          </div>
        </Disclosure>
      )}
      {d?.resolvedUrl && (
        <div className="bs-debug-chips" style={{ marginTop: 2 }}>
          <span className="bs-debug-chip chip-url">
            <span className="bs-debug-chip-k">URL</span>
            <span className="bs-debug-chip-v is-mono" style={{ marginRight: 4 }}>{d.method || 'GET'}</span>
            <a className="bs-debug-chip-v is-link is-mono" href={d.resolvedUrl} target="_blank" rel="noopener noreferrer">{d.resolvedUrl}</a>
          </span>
        </div>
      )}
      {d?.requestHeaders && Object.keys(d.requestHeaders).length > 0 && (
        <Disclosure label="Request headers">
          <div className="bs-debug-json"><JsonView value={d.requestHeaders} /></div>
        </Disclosure>
      )}
      {d?.requestPayload && (
        <Disclosure label="Request payload" defaultOpen>
          <div className="bs-debug-json"><JsonView value={d.requestPayload} /></div>
        </Disclosure>
      )}
      {d?.responseHeaders && Object.keys(d.responseHeaders).length > 0 && (
        <Disclosure label="Response headers">
          <div className="bs-debug-json"><JsonView value={d.responseHeaders} /></div>
        </Disclosure>
      )}
      {d?.responseBody && (
        <Disclosure label="Response body" defaultOpen>
          <pre className="bs-debug-pre">{d.responseBody}</pre>
        </Disclosure>
      )}
      {d?.stack && (
        <Disclosure label="Stack trace" defaultOpen>
          <StackTrace text={d.stack} />
        </Disclosure>
      )}
    </div>
  )
}

/**
 * IntelliJ-style colorized stack trace. Parses each line and highlights:
 * - Error message line (red)
 * - "at" keyword (dim)
 * - Function/method names (amber)
 * - File paths + extensions (cyan)
 * - Line:col numbers (green)
 * - URLs (blue, clickable concept but not linked for safety)
 */
function StackTrace({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <pre className="bs-stack-trace">
      {lines.map((line, i) => <StackLine key={i} line={line} isFirst={i === 0} />)}
    </pre>
  )
}

function StackLine({ line, isFirst }) {
  // Error message line (first line or lines starting with Error/TypeError etc.)
  if (isFirst || /^\w*Error:/.test(line.trim())) {
    return <span className="bs-st-error">{line}\n</span>
  }
  // "at" lines — parse: at functionName (filePath:line:col)
  const atMatch = line.match(/^(\s*at\s+)(.*?)\s*\((.+?):(\d+):(\d+)\)\s*$/)
  if (atMatch) {
    return (
      <span className="bs-st-line">
        <span className="bs-st-at">{atMatch[1]}</span>
        <span className="bs-st-fn">{atMatch[2]}</span>
        <span className="bs-st-at"> (</span>
        <span className="bs-st-file">{atMatch[3]}</span>
        <span className="bs-st-at">:</span>
        <span className="bs-st-num">{atMatch[4]}</span>
        <span className="bs-st-at">:</span>
        <span className="bs-st-num">{atMatch[5]}</span>
        <span className="bs-st-at">)</span>
        {'\n'}
      </span>
    )
  }
  // "at" lines without parens: at http://...:line:col
  const atUrlMatch = line.match(/^(\s*at\s+)(\S+?):(\d+):(\d+)\s*$/)
  if (atUrlMatch) {
    return (
      <span className="bs-st-line">
        <span className="bs-st-at">{atUrlMatch[1]}</span>
        <span className="bs-st-url">{atUrlMatch[2]}</span>
        <span className="bs-st-at">:</span>
        <span className="bs-st-num">{atUrlMatch[3]}</span>
        <span className="bs-st-at">:</span>
        <span className="bs-st-num">{atUrlMatch[4]}</span>
        {'\n'}
      </span>
    )
  }
  // "at async" or other at lines with just a name
  const atSimple = line.match(/^(\s*at\s+(?:async\s+)?)(\S+.*)$/)
  if (atSimple) {
    return (
      <span className="bs-st-line">
        <span className="bs-st-at">{atSimple[1]}</span>
        <span className="bs-st-fn">{atSimple[2]}</span>
        {'\n'}
      </span>
    )
  }
  return <span>{line}\n</span>
}

const CHIP_COLORS = {
  status: 'chip-status', type: 'chip-type', node: 'chip-node', card: 'chip-card',
  time: 'chip-time', cause: 'chip-error', message: 'chip-error', url: 'chip-url',
}

function Chip({ label, value, mono, variant }) {
  const colorClass = variant ? `is-${variant}` : (CHIP_COLORS[label.toLowerCase()] || '')
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
