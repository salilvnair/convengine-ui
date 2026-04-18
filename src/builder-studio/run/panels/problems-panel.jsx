/**
 * Built-in "Problems" panel — shows workflow validation issues.
 * Scans nodes for missing required fields, disconnected edges, etc.
 */
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
          <div key={i} className={`bs-problem-row is-${p.severity}`}>
            <span className={`bs-problem-icon is-${p.severity}`}>
              {p.severity === 'error' ? '✕' : p.severity === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span className="bs-problem-node">{p.node || '—'}</span>
            <span className="bs-problem-msg">{p.message}</span>
          </div>
        ))}
      </div>
    )
  },
}

function collectProblems(ctx) {
  const { workflow } = ctx
  if (!workflow) return []
  const problems = []
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []

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
