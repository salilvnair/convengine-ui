/**
 * "New workflow" dialog.
 *
 * Prompts for a workflow name + team assignment before actually creating the
 * workflow. Replaces the previous hard-coded "new workflow → teams[0]" path
 * so users explicitly pick the owning team.
 *
 * Fires `onCreate(name, teamId)` when the user confirms; the caller is
 * expected to call `createWorkflow(name, teamId)` in the workspace store.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import StyledSelect from './StyledSelect'

export default function CreateWorkflowModal({
  teams = [],
  defaultTeamId,
  onCancel,
  onCreate,
}) {
  const [name, setName] = useState('Untitled workflow')
  const [teamId, setTeamId] = useState(defaultTeamId || teams[0]?.id || '')
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.select?.()
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const canSubmit = name.trim().length > 0 && !!teamId

  function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onCreate?.(name.trim(), teamId)
  }

  return createPortal(
    <div className="bs-modal-overlay" onClick={onCancel}>
      <form
        className="bs-modal bs-create-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="bs-modal-header">
          <h3 className="bs-modal-title">New workflow</h3>
          <p className="bs-modal-sub">Give it a name and pick a team to own it.</p>
        </header>

        <div className="bs-modal-body">
          <div className="bs-field">
            <label className="bs-label">Name</label>
            <input
              ref={nameRef}
              className="bs-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Order triage"
              autoFocus
            />
          </div>

          <div className="bs-field">
            <label className="bs-label">Team</label>
            {teams.length === 0 ? (
              <div className="bs-hint bs-hint-warn">
                No teams yet. Create a team first in the Teams tab.
              </div>
            ) : (
              <StyledSelect
                value={teamId}
                options={teams.map((t) => ({ id: t.id, label: t.name }))}
                onChange={setTeamId}
              />
            )}
          </div>
        </div>

        <footer className="bs-modal-footer">
          <button type="button" className="bs-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="bs-btn-primary" disabled={!canSubmit}>
            Create workflow
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
