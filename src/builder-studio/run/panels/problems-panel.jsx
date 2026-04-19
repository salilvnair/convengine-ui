/**
 * Built-in "Problems" panel — shows workflow validation issues.
 * Scans nodes for missing required fields, disconnected edges, etc.
 */
import { useState } from 'react'

const ProblemsPanel = {
  id: 'problems',
  label: 'Problems',
  order: 40,
  badge: (ctx) => {
    const count = collectProblems(ctx).length
    return count || null
  },
  render(ctx) {
    const problems = collectProblems(ctx)

    if (problems.length === 0) {
      return (
        <div className="bs-run-empty bs-problems-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8, opacity: 0.7 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '12.5px' }}>
            No problems detected in this workflow.
          </span>
        </div>
      )
    }

    return (
      <div className="bs-run-tab bs-problems-list">
        {problems.map((p, i) => (
          <ProblemRow key={i} problem={p} />
        ))}
      </div>
    )
  },
}

function ProblemRow({ problem: p }) {
  const [open, setOpen] = useState(false)
  const hasDetail = p.detail && (p.detail.url || p.detail.status || p.detail.responseBody || p.detail.stack)
  return (
    <div className={`bs-problem-row is-${p.severity}`}>
      <div
        className="bs-problem-summary"
        onClick={() => hasDetail && setOpen((v) => !v)}
        role={hasDetail ? 'button' : undefined}
        style={hasDetail ? { cursor: 'pointer' } : undefined}
      >
        <span className="bs-problem-caret">{hasDetail ? (open ? '▼' : '▶') : ' '}</span>
        <span className={`bs-problem-icon is-${p.severity}`}>
          {p.severity === 'error' ? '✕' : p.severity === 'warning' ? '⚠' : 'ℹ'}
        </span>
        <span className="bs-problem-node">{p.node || '—'}</span>
        <span className="bs-problem-msg">{p.message}</span>
      </div>
      {open && hasDetail && (
        <div className="bs-problem-detail">
          <div className="bs-run-log-kv">
            {p.detail.url && <KV k="URL" v={<code>{p.detail.method || 'GET'} {p.detail.url}</code>} />}
            {p.detail.status && <KV k="HTTP Status" v={<code>{p.detail.status} {p.detail.statusText || ''}</code>} />}
            {p.detail.nodeId && <KV k="Node ID" v={<code>{p.detail.nodeId}</code>} />}
            {p.detail.blockType && <KV k="Block type" v={<code>{p.detail.blockType}</code>} />}
            {p.detail.timestamp && <KV k="Timestamp" v={p.detail.timestamp} />}
            {p.detail.cause && <KV k="Cause" v={p.detail.cause} />}
          </div>
          {p.detail.responseBody && (
            <>
              <div className="bs-panel-subtitle" style={{ marginTop: 8 }}>Response body</div>
              <pre className="bs-run-log-pre" style={{ margin: 0, maxHeight: 200, overflow: 'auto' }}>{p.detail.responseBody}</pre>
            </>
          )}
          {p.detail.stack && (
            <>
              <div className="bs-panel-subtitle" style={{ marginTop: 8 }}>Stack trace</div>
              <pre className="bs-run-log-pre" style={{ margin: 0, maxHeight: 200, overflow: 'auto', fontSize: '11px' }}>{p.detail.stack}</pre>
            </>
          )}
        </div>
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

function collectProblems(ctx) {
  const { workflow, result, error } = ctx
  if (!workflow) return []
  const problems = []
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []

  // ── Runtime errors from the last run ──────────────────────────────────
  if (error) {
    problems.push({
      severity: 'error',
      node: 'Run',
      message: error,
    })
  }
  if (result?.trace) {
    for (const t of result.trace) {
      if (t.error) {
        const detail = t.errorDetail || {}
        let msg = t.error
        if (detail.url) msg += ` — ${detail.method || 'GET'} ${detail.url}`
        if (detail.status) msg += ` (HTTP ${detail.status})`
        problems.push({
          severity: 'error',
          node: t.title || t.nodeId,
          message: msg,
          detail,
        })
      }
    }
  }

  // ── Static validation ─────────────────────────────────────────────────
  // Check for nodes with no connections
  const connectedIds = new Set()
  edges.forEach((e) => { connectedIds.add(e.source); connectedIds.add(e.target) })
  nodes.forEach((n) => {
    if (!connectedIds.has(n.id) && nodes.length > 1) {
      problems.push({
        severity: 'warning',
        node: n.data?.title || n.id,
        message: `Node is disconnected from the workflow.`,
      })
    }
  })

  // Check for empty required sub-block values
  const sbv = workflow.subBlockValues || {}
  nodes.forEach((n) => {
    const vals = sbv[n.id] || {}
    Object.entries(vals).forEach(([key, val]) => {
      if (val === '' && key === 'systemPrompt') {
        problems.push({
          severity: 'info',
          node: n.data?.title || n.id,
          message: `"${key}" is empty.`,
        })
      }
    })
  })

  return problems
}

export default ProblemsPanel
