/**
 * Zustand store for TODO items — persisted in localStorage.
 * Keyed by workflow id. Supports pending, completed, and soft-deleted states.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useTodoStore = create(
  persist(
    (set, get) => ({
      /** { [workflowId]: TodoItem[] } */
      todos: {},

      _items(wfId) {
        return get().todos[wfId] || []
      },

      addTodo(wfId, item) {
        set((s) => ({
          todos: {
            ...s.todos,
            [wfId]: [...(s.todos[wfId] || []), item],
          },
        }))
      },

      updateTodo(wfId, id, patch) {
        set((s) => ({
          todos: {
            ...s.todos,
            [wfId]: (s.todos[wfId] || []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
          },
        }))
      },

      /** Soft-delete: mark as deleted (moves to Deleted section) */
      softDelete(wfId, id) {
        set((s) => ({
          todos: {
            ...s.todos,
            [wfId]: (s.todos[wfId] || []).map((t) =>
              t.id === id ? { ...t, deleted: true, deletedAt: Date.now() } : t
            ),
          },
        }))
      },

      /** Permanently remove from store */
      permanentDelete(wfId, id) {
        set((s) => ({
          todos: {
            ...s.todos,
            [wfId]: (s.todos[wfId] || []).filter((t) => t.id !== id),
          },
        }))
      },

      /** Restore from deleted back to its previous state */
      restore(wfId, id) {
        set((s) => ({
          todos: {
            ...s.todos,
            [wfId]: (s.todos[wfId] || []).map((t) =>
              t.id === id ? { ...t, deleted: false, deletedAt: undefined } : t
            ),
          },
        }))
      },

      /** Clear all permanently deleted items for a workflow */
      clearDeleted(wfId) {
        set((s) => ({
          todos: {
            ...s.todos,
            [wfId]: (s.todos[wfId] || []).filter((t) => !t.deleted),
          },
        }))
      },

      /** Reorder items (used after drag-drop) */
      setItems(wfId, items) {
        set((s) => ({
          todos: { ...s.todos, [wfId]: items },
        }))
      },
    }),
    {
      name: 'bs-todo-store',
      version: 1,
    }
  )
)
