/**
 * Workflow-level inspector.
 *
 * Rendered in place of the block inspector when no node is selected but a
 * workflow is open. Groups settings into two tabs:
 *
 *  - **Basic**     — name, description, team assignment
 *  - **Advanced**  — default timeout, retries, fail-fast, log level, tags
 *
 * Writes go through `updateWorkflow(id, patch)` in the workspace store, which
 * timestamps `updatedAt` and merges `metadata.*` in place.
 */
import { useMemo, useState } from 'react'
import { useWorkspaceStore } from '../stores/workspace-store'
import StyledSelect from '../components/StyledSelect'

export default function WorkflowInspector({ workflowId }) {
  const workflows = useWorkspaceStore((s) => s.workflows)
  const teams = useWorkspaceStore((s) => s.teams)
  const updateWorkflow = useWorkspaceStore((s) => s.updateWorkflow)
  const [mode, setMode] = useState('basic')

  const wf = useMemo(() => workflows.find((w) => w.id === workflowId), [workflows, workflowId])
  if (!wf) {
    return (
      <aside className="bs-inspector bs-inspector-empty">
        <div className="bs-inspector-hint">Workflow not found.</div>
      </aside>
    )
  }

  const meta = wf.metadata || {}
  const patchMeta = (k, v) => updateWorkflow(wf.id, { metadata: { [k]: v } })

  return (
    <aside className="bs-inspector">
      <header className="bs-inspector-header">
        <div className="bs-inspector-title-row">
          <div className="bs-inspector-swatch" style={{ background: '#6366f1' }} />
          <div>
            <div className="bs-inspector-title">Workflow settings</div>
            <div className="bs-inspector-sub">Edit metadata and runtime defaults</div>
          </div>
        </div>
        <div
          className="bs-inspector-modes"
          style={{ '--active-idx': ['basic', 'advanced'].indexOf(mode), '--mode-count': 2 }}
        >
          <div className="bs-inspector-pill" />
          {['basic', 'advanced'].map((m) => (
            <button
              key={m}
              className={`bs-inspector-mode ${mode === m ? 'bs-inspector-mode-active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      <div className="bs-inspector-body">
        {mode === 'basic' && (
          <>
            <div className="bs-field">
              <label className="bs-label">Name</label>
              <input
                className="bs-input"
                value={wf.name || ''}
                onChange={(e) => updateWorkflow(wf.id, { name: e.target.value })}
                placeholder="Untitled workflow"
              />
            </div>

            <div className="bs-field">
              <label className="bs-label">Description</label>
              <textarea
                className="bs-textarea"
                rows={3}
                value={wf.description || ''}
                onChange={(e) => updateWorkflow(wf.id, { description: e.target.value })}
                placeholder="What does this workflow do?"
              />
            </div>

            <div className="bs-field">
              <label className="bs-label">Team</label>
              <StyledSelect
                value={wf.teamId || ''}
                options={[
                  { id: '', label: '— Unassigned —' },
                  ...teams.map((t) => ({ id: t.id, label: t.name }))
                ]}
                onChange={(id) => updateWorkflow(wf.id, { teamId: id || undefined })}
                placeholder="— Unassigned —"
              />
              <div className="bs-hint">Controls which team owns this workflow in the sidebar.</div>
            </div>

            <div className="bs-field">
              <label className="bs-label">Created</label>
              <div className="bs-readonly">{fmtDate(wf.createdAt)}</div>
            </div>
            <div className="bs-field">
              <label className="bs-label">Last updated</label>
              <div className="bs-readonly">{fmtDate(wf.updatedAt || wf.createdAt)}</div>
            </div>
          </>
        )}

        {mode === 'advanced' && (
          <>
            <div className="bs-field">
              <label className="bs-label">Default timeout (ms)</label>
              <input
                type="number"
                min={0}
                step={500}
                className="bs-input"
                value={meta.defaultTimeoutMs ?? 30000}
                onChange={(e) => patchMeta('defaultTimeoutMs', Number(e.target.value) || 0)}
              />
              <div className="bs-hint">Fallback timeout for nodes that don't override it.</div>
            </div>

            <div className="bs-field">
              <label className="bs-label">Max retries</label>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="bs-input"
                value={meta.maxRetries ?? 0}
                onChange={(e) => patchMeta('maxRetries', Math.max(0, Number(e.target.value) || 0))}
              />
            </div>

            <label className="bs-check-row">
              <input
                type="checkbox"
                className="bs-check"
                checked={meta.failFast !== false}
                onChange={(e) => patchMeta('failFast', e.target.checked)}
              />
              <span className="bs-check-body">
                <span className="bs-check-title">Fail fast</span>
                <span className="bs-check-sub">
                  Halt the whole run on the first node error. Disable to let
                  sibling branches keep going and collect errors in the trace.
                </span>
              </span>
            </label>

            <div className="bs-field">
              <label className="bs-label">Log level</label>
              <select
                className="bs-input"
                value={meta.logLevel || 'info'}
                onChange={(e) => patchMeta('logLevel', e.target.value)}
              >
                <option value="trace">trace</option>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </div>

            <div className="bs-field">
              <label className="bs-label">Tags</label>
              <input
                className="bs-input"
                value={(meta.tags || []).join(', ')}
                onChange={(e) =>
                  patchMeta(
                    'tags',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  )
                }
                placeholder="billing, production, experimental"
              />
              <div className="bs-hint">Comma-separated. Used for filtering in the sidebar.</div>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return String(iso) }
}
