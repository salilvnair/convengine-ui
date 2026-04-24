/**
 * Modal shown after importing a workflow JSON.
 * Lets the user confirm/edit the name and pick a team to assign it to.
 *
 * Props:
 *   teams        — array of { id, name } team objects
 *   defaultName  — pre-filled workflow name from the JSON
 *   defaultTeamId — pre-selected team id (optional)
 *   onCancel     — () => void
 *   onImport     — (name: string, teamId: string) => void
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import StyledSelect from './StyledSelect'

export default function ImportWorkflowModal({
  teams = [],
  defaultName = 'Imported Workflow',
  defaultTeamId,
  onCancel,
  onImport,
}) {
  const [name, setName]   = useState(defaultName)
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
    onImport?.(name.trim(), teamId)
  }

  return createPortal(
    <div className="bs-modal-overlay" onClick={onCancel}>
      <form
        className="bs-modal bs-create-modal bs-import-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="bs-modal-header">
          <div className="bs-import-modal-icon">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#6366f1"/>
              <polyline points="17 8 12 3 7 8" stroke="#818cf8"/>
              <line x1="12" y1="3" x2="12" y2="15" stroke="#818cf8"/>
            </svg>
          </div>
          <h3 className="bs-modal-title">Import workflow</h3>
          <p className="bs-modal-sub">Confirm the name and assign it to a team.</p>
        </header>

        <div className="bs-modal-body">
          <div className="bs-field">
            <label className="bs-label">Workflow name</label>
            <input
              ref={nameRef}
              className="bs-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. URL → Summary"
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
          <button type="button" className="bs-btn bs-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="bs-btn bs-btn-primary"
            disabled={!canSubmit}
          >
            Import &amp; open
          </button>
        </footer>
      </form>
    </div>,
    document.body
  )
}
