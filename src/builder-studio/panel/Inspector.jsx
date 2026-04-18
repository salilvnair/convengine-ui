/**
 * Inspector panel — right rail. Shows subBlocks of the currently selected
 * node, filtered by `condition` (basic/advanced `mode` toggles via tabs).
 *
 * Mirrors sim's workflow-block config panel: header, mode switch, and a
 * sequential list of SubBlockRenderer instances.
 */
import { useMemo, useState } from 'react'
import { useWorkflowStore } from '../stores/workflow-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { getBlock } from '../blocks/registry'
import SubBlockRenderer from './SubBlockRenderer'
import ConfirmModal from '../components/ConfirmModal'
import WorkflowInspector from './WorkflowInspector'

const EMPTY = Object.freeze({})

function humanize(id) {
  if (!id) return ''
  return String(id)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
}

export default function Inspector() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const setSubBlockValue = useWorkflowStore((s) => s.setSubBlockValue)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)
  const values = useMemo(
    () => (selectedNodeId ? subBlockValues[selectedNodeId] || EMPTY : EMPTY),
    [selectedNodeId, subBlockValues]
  )
  const [mode, setMode] = useState('basic')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const activeWorkflowId = useWorkspaceStore((s) => s.activeWorkflowId)

  const node = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const cfg = node ? getBlock(node.data.blockType) : null

  const availableModes = useMemo(() => {
    if (!cfg) return []
    const set = new Set(['basic'])
    for (const sb of cfg.subBlocks) {
      if (sb.mode === 'advanced' || sb.mode === 'trigger-advanced') set.add('advanced')
    }
    return ['basic', 'advanced'].filter((m) => set.has(m))
  }, [cfg])

  const visibleSubBlocks = useMemo(() => {
    if (!cfg) return []
    const effective = availableModes.includes(mode) ? mode : 'basic'
    return cfg.subBlocks.filter((sb) => matchesMode(sb.mode, effective) && conditionPasses(sb.condition, values))
  }, [cfg, mode, values, availableModes])

  if (!node || !cfg) {
    // Nothing selected → surface workflow-level edit & advanced options.
    if (activeWorkflowId) return <WorkflowInspector workflowId={activeWorkflowId} />
    return (
      <aside className="bs-inspector bs-inspector-empty">
        <div className="bs-inspector-hint">Create or open a workflow to edit its settings, or click a block on the canvas.</div>
      </aside>
    )
  }

  return (
    <aside className="bs-inspector">
      <header className="bs-inspector-header">
        <div className="bs-inspector-title-row">
          <div className="bs-inspector-swatch" style={{ background: cfg.bgColor }} />
          <div>
            <div className="bs-inspector-title">{cfg.name}</div>
            <div className="bs-inspector-sub">{cfg.description}</div>
          </div>
          <button className="bs-btn-danger-ghost" onClick={() => setConfirmDelete(true)} title="Delete block">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Delete
          </button>
        </div>
        {availableModes.length > 1 && (
          <div className="bs-inspector-modes">
            {availableModes.map((m) => (
              <button
                key={m}
                className={`bs-inspector-mode ${mode === m ? 'bs-inspector-mode-active' : ''}`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="bs-inspector-body">
        {visibleSubBlocks.map((sb) => (
          <div key={`${sb.id}-${sb.condition ? JSON.stringify(sb.condition) : ''}`} className="bs-field">
            <label className="bs-label">
              {sb.title || humanize(sb.id)}
              {isRequired(sb.required, values) && <span className="bs-required">*</span>}
            </label>
            <SubBlockRenderer
              sub={sb}
              value={values[sb.id]}
              blockValues={values}
              onChange={(id, v) => setSubBlockValue(node.id, id, v)}
            />
            {sb.description && <div className="bs-hint">{sb.description}</div>}
          </div>
        ))}
        {visibleSubBlocks.length === 0 && (
          <div className="bs-inspector-hint">No {mode} fields for this block.</div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete block?"
          message={`"${node.data?.title || cfg.name}" and all its connections will be removed. This cannot be undone.`}
          confirmLabel="Delete block"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); removeNode(node.id) }}
        />
      )}
    </aside>
  )
}

function matchesMode(subMode, activeMode) {
  if (!subMode || subMode === 'both') return true
  return subMode === activeMode
}

/**
 * Evaluate sim-style condition: {field, value, not?, and?}.
 * Supports arrays (OR over values), not negation, and nested `and` conjunct.
 */
function conditionPasses(condition, values) {
  if (!condition) return true
  const cond = typeof condition === 'function' ? safeCall(() => condition(values)) : condition
  if (!cond) return true
  const current = values[cond.field]
  const expected = cond.value
  const matches = Array.isArray(expected)
    ? expected.map((v) => String(v)).includes(String(current ?? ''))
    : String(expected ?? '') === String(current ?? '')
  const primary = cond.not ? !matches : matches
  if (!primary) return false
  if (cond.and) return conditionPasses(cond.and, values)
  return true
}

function isRequired(required, values) {
  if (required == null || required === false) return false
  if (required === true) return true
  if (typeof required === 'function') return Boolean(safeCall(() => required(values)))
  return conditionPasses(required, values)
}

function safeCall(fn) {
  try { return fn() } catch { return undefined }
}
