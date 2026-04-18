/**
 * Postman-style tab store for the center pane.
 *
 * A tab describes what's shown in the main workspace:
 *   { id: 'workflow' | `agent:<id>` | `skill:<id>`, kind, entityId?, title }
 *
 * The `workflow` tab is pinned (always present, cannot be closed) and shows the
 * ReactFlow canvas for the currently-active workflow. Clicking an agent or skill
 * row in the SideNav calls `openTab` to open (or focus) its editor tab.
 */
import { create } from 'zustand'

const WORKFLOW_TAB = { id: 'workflow', kind: 'workflow', title: 'Workflow' }

export const useTabsStore = create((set, get) => ({
  tabs: [WORKFLOW_TAB],
  activeId: 'workflow',

  openTab(tab) {
    const existing = get().tabs.find((t) => t.id === tab.id)
    if (existing) {
      set({ activeId: tab.id })
      return
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
  },

  closeTab(id) {
    if (id === 'workflow') return // pinned
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx < 0) return s
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeId = s.activeId
      if (activeId === id) {
        const fallback = tabs[Math.min(idx, tabs.length - 1)] || WORKFLOW_TAB
        activeId = fallback.id
      }
      return { tabs, activeId }
    })
  },

  setActive(id) {
    set({ activeId: id })
  },

  renameTab(id, title) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) }))
  },
}))

export function agentTabId(agentId) { return `agent:${agentId}` }
export function skillTabId(skillId) { return `skill:${skillId}` }
