/**
 * Built-in "TODO" panel — lightweight task list persisted in localStorage.
 * Each workflow gets its own todo list keyed by workflow id.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const LS_KEY = 'bs-todo-items'

function loadTodos(workflowId) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const all = JSON.parse(raw)
    return all[workflowId] || []
  } catch { return [] }
}

function saveTodos(workflowId, items) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[workflowId] = items
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch { /* quota exceeded — silently fail */ }
}

const TodoPanel = {
  id: 'todo',
  label: 'TODO',
  order: 50,
  badge: (ctx) => {
    const wfId = ctx.workflow?.id
    if (!wfId) return null
    const items = loadTodos(wfId)
    const pending = items.filter((t) => !t.done).length
    return pending || null
  },
  render(ctx) {
    return <TodoList workflowId={ctx.workflow?.id} />
  },
}

function TodoList({ workflowId }) {
  const [items, setItems] = useState(() => loadTodos(workflowId || '__global'))
  const [newText, setNewText] = useState('')
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')
  const inputRef = useRef(null)
  const editRef = useRef(null)
  const wfId = workflowId || '__global'

  // Reload when workflow changes
  useEffect(() => {
    setItems(loadTodos(wfId))
  }, [wfId])

  // Persist on change
  useEffect(() => {
    saveTodos(wfId, items)
  }, [wfId, items])

  const addTodo = useCallback(() => {
    const text = newText.trim()
    if (!text) return
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false, createdAt: Date.now() },
    ])
    setNewText('')
    inputRef.current?.focus()
  }, [newText])

  const toggleDone = useCallback((id) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }, [])

  const removeTodo = useCallback((id) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const startEdit = useCallback((item) => {
    setEditId(item.id)
    setEditText(item.text)
    setTimeout(() => editRef.current?.focus(), 0)
  }, [])

  const commitEdit = useCallback(() => {
    const text = editText.trim()
    if (text && editId) {
      setItems((prev) => prev.map((t) => (t.id === editId ? { ...t, text } : t)))
    }
    setEditId(null)
    setEditText('')
  }, [editId, editText])

  const pending = items.filter((t) => !t.done)
  const completed = items.filter((t) => t.done)

  return (
    <div className="bs-run-tab bs-todo-panel">
      {/* Add new */}
      <div className="bs-todo-add">
        <input
          ref={inputRef}
          className="bs-input bs-todo-input"
          type="text"
          placeholder="Add a task…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }}
        />
        <button className="bs-btn-primary bs-todo-add-btn" onClick={addTodo} disabled={!newText.trim()}>
          + Add
        </button>
      </div>

      {items.length === 0 && (
        <div className="bs-run-empty bs-todo-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: 6 }}>
            <polyline points="4,12 9,17 20,6" />
            <line x1="4" y1="6" x2="14" y2="6" opacity="0.3" />
            <line x1="4" y1="10" x2="12" y2="10" opacity="0.3" />
            <line x1="4" y1="18" x2="10" y2="18" opacity="0.3" />
          </svg>
          <span>No tasks yet. Add one above to get started.</span>
        </div>
      )}

      {/* Pending items */}
      {pending.map((item) => (
        <div key={item.id} className="bs-todo-item">
          <button className="bs-todo-check" onClick={() => toggleDone(item.id)} title="Mark done">
            <span className="bs-todo-checkbox" />
          </button>
          {editId === item.id ? (
            <input
              ref={editRef}
              className="bs-input bs-todo-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null) }}
            />
          ) : (
            <span className="bs-todo-text" onDoubleClick={() => startEdit(item)}>{item.text}</span>
          )}
          <button className="bs-todo-remove" onClick={() => removeTodo(item.id)} title="Remove">×</button>
        </div>
      ))}

      {/* Completed section */}
      {completed.length > 0 && (
        <>
          <div className="bs-todo-divider">
            <span>Completed ({completed.length})</span>
            <button
              className="bs-btn-ghost bs-todo-clear"
              onClick={() => setItems((prev) => prev.filter((t) => !t.done))}
            >
              Clear all
            </button>
          </div>
          {completed.map((item) => (
            <div key={item.id} className="bs-todo-item is-done">
              <button className="bs-todo-check is-checked" onClick={() => toggleDone(item.id)} title="Undo">
                <span className="bs-todo-checkbox is-checked">✓</span>
              </button>
              <span className="bs-todo-text is-done">{item.text}</span>
              <button className="bs-todo-remove" onClick={() => removeTodo(item.id)} title="Remove">×</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default TodoPanel
