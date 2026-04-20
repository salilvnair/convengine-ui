/**
 * Built-in "TODO" panel — colorful card-based task list with SVG icon picker.
 * Drag-and-drop between Pending ↔ Completed. Soft-delete with Deleted bin.
 * Backed by Zustand store with localStorage persistence.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTodoStore } from '../../stores/todo-store'

/* ── SVG Icon Library ── */
const TODO_ICONS = [
  { id: 'star',     color: '#fbbf24', label: 'Star',     path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { id: 'bolt',     color: '#f472b6', label: 'Bolt',     path: 'M13 2L3 14h9l-1 10 10-12h-9l1-10z' },
  { id: 'fire',     color: '#f87171', label: 'Fire',     path: 'M12 23c-3.9 0-7-2.7-7-7.3 0-3.2 2.1-5.8 3.5-7.2.4-.4 1.1-.1 1.1.5v1.5c0 .8.9 1.3 1.5.8 2-1.6 3.9-4 3.9-4s.3-.4.7-.1c.3.2.3.6.3.6 0 0-.5 3.2.5 5.2s2.5 3 2.5 5C19 20.3 15.9 23 12 23z' },
  { id: 'heart',    color: '#fb7185', label: 'Heart',    path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
  { id: 'rocket',   color: '#818cf8', label: 'Rocket',   path: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3 8.5-8.5c1.5-1.5 4-1.5 4-1.5s0 2.5-1.5 4L12 15z' },
  { id: 'flag',     color: '#34d399', label: 'Flag',     path: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7' },
  { id: 'gem',      color: '#22d3ee', label: 'Gem',      path: 'M6 3h12l4 6-10 13L2 9z M2 9h20 M12 22L6 3 M12 22l6-19' },
  { id: 'target',   color: '#a78bfa', label: 'Target',   path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  { id: 'clock',    color: '#60a5fa', label: 'Clock',    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4v6l4 2' },
  { id: 'bulb',     color: '#facc15', label: 'Idea',     path: 'M9 21h6M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z' },
  { id: 'pin',      color: '#f97316', label: 'Pin',      path: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  { id: 'code',     color: '#6ee7b7', label: 'Code',     path: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
]

function getIconById(id) { return TODO_ICONS.find((i) => i.id === id) || TODO_ICONS[0] }

function TodoIcon({ iconId, size = 16 }) {
  const icon = getIconById(iconId)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={icon.color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={icon.path} />
    </svg>
  )
}

function iconTint(iconId, alpha = 0.08) {
  const icon = getIconById(iconId)
  const hex = icon.color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const TodoPanel = {
  id: 'todo',
  label: 'TODO',
  order: 50,
  badge: (ctx) => {
    const wfId = ctx.workflow?.id
    if (!wfId) return null
    const items = useTodoStore.getState().todos[wfId] || []
    const pending = items.filter((t) => !t.done && !t.deleted).length
    return pending || null
  },
  render(ctx) {
    return <TodoList workflowId={ctx.workflow?.id} />
  },
}

/* ── Icon Picker Dropdown ── */
function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="bs-todo-icon-picker" ref={ref}>
      <button
        className="bs-todo-icon-picker-btn"
        onClick={() => setOpen((v) => !v)}
        title="Pick icon"
        type="button"
      >
        <TodoIcon iconId={value} size={14} />
        <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.4 }}>
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="bs-todo-icon-picker-dropdown">
          {TODO_ICONS.map((icon) => (
            <button
              key={icon.id}
              className={`bs-todo-icon-option ${value === icon.id ? 'is-active' : ''}`}
              onClick={() => { onChange(icon.id); setOpen(false) }}
              title={icon.label}
              type="button"
            >
              <TodoIcon iconId={icon.id} size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Drag & Drop Helpers ── */
const DRAG_TYPE = 'application/x-bs-todo'

function TodoList({ workflowId }) {
  const wfId = workflowId || '__global'
  const allTodos = useTodoStore((s) => s.todos)
  const items = useMemo(() => allTodos[wfId] || [], [allTodos, wfId])
  const store = useTodoStore

  const [newText, setNewText] = useState('')
  const [newIcon, setNewIcon] = useState('star')
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [dragOverZone, setDragOverZone] = useState(null) // 'pending' | 'completed' | null
  const [dragId, setDragId] = useState(null)
  const inputRef = useRef(null)
  const editRef = useRef(null)

  const handleAdd = useCallback(() => {
    const text = newText.trim()
    if (!text) return
    store.getState().addTodo(wfId, {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text, done: false, icon: newIcon, createdAt: Date.now(),
    })
    setNewText('')
    inputRef.current?.focus()
  }, [newText, newIcon, wfId])

  const toggleDone = useCallback((id) => {
    const item = items.find((t) => t.id === id)
    if (item) store.getState().updateTodo(wfId, id, { done: !item.done })
  }, [items, wfId])

  const handleRemoveClick = useCallback((id) => {
    const item = items.find((t) => t.id === id)
    if (item && !item.done) {
      setConfirmDeleteId(id)
    } else {
      store.getState().softDelete(wfId, id)
    }
  }, [items, wfId])

  const confirmSoftDelete = useCallback(() => {
    if (confirmDeleteId) store.getState().softDelete(wfId, confirmDeleteId)
    setConfirmDeleteId(null)
  }, [confirmDeleteId, wfId])

  const handleUpdateIcon = useCallback((id, iconId) => {
    store.getState().updateTodo(wfId, id, { icon: iconId })
  }, [wfId])

  const startEdit = useCallback((item) => {
    setEditId(item.id)
    setEditText(item.text)
    setTimeout(() => editRef.current?.focus(), 0)
  }, [])

  const commitEdit = useCallback(() => {
    const text = editText.trim()
    if (text && editId) store.getState().updateTodo(wfId, editId, { text })
    setEditId(null)
    setEditText('')
  }, [editId, editText, wfId])

  /* ── Drag handlers ── */
  const onDragStart = useCallback((e, itemId) => {
    e.dataTransfer.setData(DRAG_TYPE, itemId)
    e.dataTransfer.effectAllowed = 'move'
    setDragId(itemId)
  }, [])

  const onDragEnd = useCallback(() => {
    setDragId(null)
    setDragOverZone(null)
  }, [])

  const onDragOver = useCallback((e, zone) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverZone(zone)
  }, [])

  const onDragLeave = useCallback(() => {
    setDragOverZone(null)
  }, [])

  const onDrop = useCallback((e, targetDone) => {
    e.preventDefault()
    setDragOverZone(null)
    setDragId(null)
    const itemId = e.dataTransfer.getData(DRAG_TYPE)
    if (!itemId) return
    const item = items.find((t) => t.id === itemId)
    if (item && item.done !== targetDone) {
      store.getState().updateTodo(wfId, itemId, { done: targetDone })
    }
  }, [items, wfId])

  const pending = items.filter((t) => !t.done && !t.deleted)
  const completed = items.filter((t) => t.done && !t.deleted)
  const deleted = items.filter((t) => t.deleted)
  const activeItems = items.filter((t) => !t.deleted)

  const confirmItem = confirmDeleteId ? items.find((t) => t.id === confirmDeleteId) : null

  return (
    <div className="bs-run-tab bs-todo-panel-v2">
      {/* Add bar */}
      <div className="bs-todo-add-v2">
        <IconPicker value={newIcon} onChange={setNewIcon} />
        <input
          ref={inputRef}
          className="bs-input bs-todo-input-v2"
          type="text"
          placeholder="What needs to be done?"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <button className="bs-todo-add-btn-v2" onClick={handleAdd} disabled={!newText.trim()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {activeItems.length === 0 && deleted.length === 0 && (
        <div className="bs-todo-empty-v2">
          <div className="bs-todo-empty-icons">
            {['star', 'bolt', 'rocket', 'fire'].map((id) => (
              <TodoIcon key={id} iconId={id} size={20} />
            ))}
          </div>
          <span>No tasks yet — add one to get started!</span>
        </div>
      )}

      {/* ── Pending section ── */}
      {(pending.length > 0 || (activeItems.length > 0 && dragId)) && (
      <div
        className={`bs-todo-section bs-todo-drop-zone ${dragOverZone === 'pending' && dragId && items.find((t) => t.id === dragId)?.done ? 'is-drop-target' : ''}`}
        onDragOver={(e) => onDragOver(e, 'pending')}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, false)}
      >
        <div className="bs-todo-section-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Pending</span>
          {pending.length > 0 && <span className="bs-todo-section-count">{pending.length}</span>}
        </div>
        {pending.length === 0 && (
          <div className="bs-todo-drop-hint">Drag tasks here to mark as pending</div>
        )}
        <div className="bs-todo-cards">
          {pending.map((item) => (
            <div
              key={item.id}
              className={`bs-todo-card ${dragId === item.id ? 'is-dragging' : ''}`}
              style={{ '--todo-tint': iconTint(item.icon || 'star'), '--todo-border': iconTint(item.icon || 'star', 0.2) }}
              draggable
              onDragStart={(e) => onDragStart(e, item.id)}
              onDragEnd={onDragEnd}
            >
              <div className="bs-todo-card-grip" title="Drag to move">
                <svg width="8" height="12" viewBox="0 0 8 14" fill="currentColor" opacity="0.3">
                  <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                  <circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/>
                  <circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/>
                </svg>
              </div>
              <div className="bs-todo-card-left">
                <IconPicker value={item.icon || 'star'} onChange={(iconId) => handleUpdateIcon(item.id, iconId)} />
              </div>
              <div className="bs-todo-card-body">
                <button className="bs-todo-card-check" onClick={() => toggleDone(item.id)} title="Mark done">
                  <span className="bs-todo-checkbox-v2" />
                </button>
                {editId === item.id ? (
                  <input
                    ref={editRef}
                    className="bs-input bs-todo-edit-input-v2"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null) }}
                  />
                ) : (
                  <span className="bs-todo-card-text" onDoubleClick={() => startEdit(item)}>{item.text}</span>
                )}
              </div>
              <button className="bs-todo-card-remove" onClick={() => handleRemoveClick(item.id)} title="Remove">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ── Completed section ── */}
      {(completed.length > 0 || (activeItems.length > 0 && dragId)) && (
      <div
        className={`bs-todo-section bs-todo-drop-zone ${dragOverZone === 'completed' && dragId && !items.find((t) => t.id === dragId)?.done ? 'is-drop-target' : ''}`}
        onDragOver={(e) => onDragOver(e, 'completed')}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, true)}
      >
        <div className="bs-todo-section-label is-done-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Completed</span>
          {completed.length > 0 && <span className="bs-todo-section-count is-done-count">{completed.length}</span>}
        </div>
        {completed.length === 0 && (
          <div className="bs-todo-drop-hint">Drag tasks here to mark as done</div>
        )}
        <div className="bs-todo-cards">
          {completed.map((item) => (
            <div
              key={item.id}
              className={`bs-todo-card is-done ${dragId === item.id ? 'is-dragging' : ''}`}
              style={{ '--todo-tint': 'rgba(34,197,94,0.04)', '--todo-border': 'rgba(34,197,94,0.12)' }}
              draggable
              onDragStart={(e) => onDragStart(e, item.id)}
              onDragEnd={onDragEnd}
            >
              <div className="bs-todo-card-grip" title="Drag to move">
                <svg width="8" height="12" viewBox="0 0 8 14" fill="currentColor" opacity="0.3">
                  <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
                  <circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/>
                  <circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/>
                </svg>
              </div>
              <div className="bs-todo-card-left">
                <TodoIcon iconId={item.icon || 'star'} size={14} />
              </div>
              <div className="bs-todo-card-body">
                <button className="bs-todo-card-check is-checked" onClick={() => toggleDone(item.id)} title="Undo">
                  <span className="bs-todo-checkbox-v2 is-checked">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                </button>
                <span className="bs-todo-card-text is-done">{item.text}</span>
              </div>
              <button className="bs-todo-card-remove" onClick={() => handleRemoveClick(item.id)} title="Remove">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ── Deleted section ── */}
      {deleted.length > 0 && (
        <div className="bs-todo-section bs-todo-deleted-section">
          <div className="bs-todo-section-label is-deleted-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>Deleted</span>
            <span className="bs-todo-section-count is-deleted-count">{deleted.length}</span>
            <button
              className="bs-btn-ghost bs-todo-clear-v2 is-danger"
              onClick={() => setConfirmClearAll(true)}
              title="Permanently remove all"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete All
            </button>
          </div>
          <div className="bs-todo-cards">
            {deleted.map((item) => (
              <div
                key={item.id}
                className="bs-todo-card is-deleted"
                style={{ '--todo-tint': 'rgba(248,113,113,0.03)', '--todo-border': 'rgba(248,113,113,0.1)' }}
              >
                <div className="bs-todo-card-left">
                  <TodoIcon iconId={item.icon || 'star'} size={14} />
                </div>
                <div className="bs-todo-card-body">
                  <span className="bs-todo-card-text is-deleted">{item.text}</span>
                </div>
                <button
                  className="bs-todo-card-restore"
                  onClick={() => store.getState().restore(wfId, item.id)}
                  title="Restore"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                </button>
                <button
                  className="bs-todo-card-remove is-perm"
                  onClick={() => store.getState().permanentDelete(wfId, item.id)}
                  title="Delete permanently"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Confirm delete warning for pending items ── */}
      {confirmItem && (
        <div className="bs-todo-confirm-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="bs-todo-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="bs-todo-confirm-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="bs-todo-confirm-text">
              <strong>Delete pending task?</strong>
              <span>"{confirmItem.text}" is still pending. Move to trash?</span>
            </div>
            <div className="bs-todo-confirm-actions">
              <button className="bs-todo-confirm-cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="bs-todo-confirm-delete" onClick={confirmSoftDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete-all warning ── */}
      {confirmClearAll && (
        <div className="bs-todo-confirm-overlay" onClick={() => setConfirmClearAll(false)}>
          <div className="bs-todo-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="bs-todo-confirm-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </div>
            <div className="bs-todo-confirm-text">
              <strong>Delete all {deleted.length} item{deleted.length !== 1 ? 's' : ''} permanently?</strong>
              <span>This action cannot be undone.</span>
            </div>
            <div className="bs-todo-confirm-actions">
              <button className="bs-todo-confirm-cancel" onClick={() => setConfirmClearAll(false)}>Cancel</button>
              <button className="bs-todo-confirm-delete" onClick={() => { store.getState().clearDeleted(wfId); setConfirmClearAll(false) }}>Delete All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TodoPanel
