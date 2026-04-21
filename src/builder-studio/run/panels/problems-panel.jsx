/**
 * Built-in "Problems" panel — shows workflow validation issues.
 * Scans nodes for missing required fields, disconnected edges, etc.
 */
import { useState } from 'react'
import ErrorDetailView from './ErrorDetailView'

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
  const hasDetail = p.detail && Object.keys(p.detail).length > 0
  // Runtime errors auto-expand to show verbose diagnostics
  const [open, setOpen] = useState(hasDetail && p.severity === 'error')
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
          {p.severity === 'error' ? '✕'
            : p.severity === 'warning' ? '⚠'
            : p.severity === 'disabled'
              ? (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></svg>)
              : 'ℹ'}
        </span>
        <span className="bs-problem-node">{p.node || '—'}</span>
        <span className="bs-problem-msg">{p.message}</span>
      </div>
      {open && hasDetail && (
        <div className="bs-problem-detail">
          {p.detail.hint && (
            <div className="bs-problem-hint">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>{p.detail.hint}</span>
            </div>
          )}
          <ErrorDetailView errorDetail={p.detail} />
        </div>
      )}
    </div>
  )
}

function collectProblems(ctx) {
  const { workflow, result, error, extraProblems, invalidInputs, inputNodes } = ctx
  if (!workflow) return []
  const problems = []
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []

  // ── Extra injected problems (deploy errors, import errors, etc.) ──────
  if (extraProblems && extraProblems.length > 0) {
    for (const p of extraProblems) {
      problems.push(p)
    }
  }

  // ── Run-panel field validation errors ─────────────────────────────────
  // Shown as errors (not warnings) with the real JS stack trace from validation.
  if (invalidInputs && inputNodes?.length > 0) {
    for (const n of inputNodes) {
      const entry = invalidInputs[n.id]
      if (!entry) continue
      const msg = entry.message ?? entry
      const stack = entry.stack ?? null
      problems.push({
        severity: 'error',
        node: n.label || n.id,
        message: msg,
        detail: stack
          ? {
              message: msg,
              stack,
              hint: `Field "${n.label}" failed validation. Fix the value in the Run tab.`,
            }
          : null,
      })
    }
  }

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
          detail: { ...detail, hint: detail.hint || null },
        })
      }
    }
  }

  // ── Static validation ─────────────────────────────────────────────────
  const SEED_TYPES = new Set(['starter', 'user_input', 'webhook_request', 'schedule'])

  // 1. Explicitly disabled nodes (⌘B toggled) — always shown regardless of edges
  nodes.forEach((n) => {
    if (n.data?.disabled) {
      problems.push({
        severity: 'disabled',
        node: n.data?.title || n.id,
        message: 'Disabled in workflow.',
      })
    }
  })

  // 2. Non-seed, non-disabled nodes that have NO incoming edge
  const targetIds = new Set()
  edges.forEach((e) => targetIds.add(e.target))
  nodes.forEach((n) => {
    if (SEED_TYPES.has(n.data?.blockType)) return
    if (n.data?.disabled) return
    if (!targetIds.has(n.id) && nodes.length > 1) {
      problems.push({
        severity: 'warning',
        node: n.data?.title || n.id,
        message: 'No incoming connection.',
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

  // ── user_input: defaultValue type-compatibility check ────────────────
  nodes.forEach((n) => {
    if (n.data?.blockType !== 'user_input') return
    const vals = sbv[n.id] || {}
    const kind = vals.kind || 'short-text'
    const defaultVal = vals.defaultValue
    if (!defaultVal || defaultVal === '') return // no default → nothing to check

    const nodeLabel = n.data?.title || 'User input'
    let msg = null

    switch (kind) {
      case 'number': {
        if (isNaN(Number(defaultVal))) msg = `Default value "${defaultVal}" is not a valid number (kind: number).`
        break
      }
      case 'email': {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultVal)) msg = `Default value "${defaultVal}" is not a valid email address (kind: email).`
        break
      }
      case 'url': {
        try { new URL(defaultVal) } catch { msg = `Default value "${defaultVal}" is not a valid URL (kind: url).` }
        break
      }
      case 'tel': {
        const clean = defaultVal.replace(/[\s\-().+]/g, '')
        if (!/^\d{7,15}$/.test(clean)) msg = `Default value "${defaultVal}" is not a valid phone number (kind: phone).`
        break
      }
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultVal)) msg = `Default value "${defaultVal}" is not a valid date — expected YYYY-MM-DD (kind: date).`
        break
      }
      case 'datetime': {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(defaultVal)) msg = `Default value "${defaultVal}" is not a valid datetime — expected YYYY-MM-DDTHH:MM (kind: datetime).`
        break
      }
      case 'color': {
        if (!/^#[0-9a-fA-F]{3,6}$/.test(defaultVal)) msg = `Default value "${defaultVal}" is not a valid hex color (kind: color).`
        break
      }
      default:
        break
    }

    if (msg) {
      problems.push({
        severity: 'warning',
        node: nodeLabel,
        message: msg,
        detail: { hint: 'Update the Default Value in the block inspector to match the selected Kind, or clear it.' },
      })
    }
  })

  return problems
}

export default ProblemsPanel
