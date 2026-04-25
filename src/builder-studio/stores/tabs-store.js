/**
 * Postman-style tab store for the center pane.
 *
 * A tab describes what's shown in the main workspace:
 *   { id: 'workflow:<wfId>' | `agent:<id>` | `skill:<id>`, kind, entityId?, title }
 *
 * Each workflow gets its own tab. The first (default) workflow tab is pinned
 * and cannot be closed — like ComfyUI's default graph. Clicking an agent or
 * skill row in the SideNav calls `openTab` to open (or focus) its editor tab.
 */
import { create } from 'zustand'

export const useTabsStore = create((set, get) => ({
  tabs: [],          // populated by initWorkflowTabs on mount
  activeId: null,
  /** Id of the first workflow — this tab is pinned/non-closable. */
  pinnedWorkflowTabId: null,

  /** Called once at app boot — opens only the active (or first) workflow as a single tab. */
  initWorkflowTabs(workflows, activeWorkflowId) {
    const activeWf = workflows.find((w) => w.id === activeWorkflowId) || workflows[0]
    if (!activeWf) {
      set({ tabs: [], activeId: null, pinnedWorkflowTabId: null })
      return
    }
    const tab = { id: workflowTabId(activeWf.id), kind: 'workflow', entityId: activeWf.id, title: activeWf.name }
    set({ tabs: [tab], activeId: tab.id, pinnedWorkflowTabId: tab.id })
  },

  /** Open or focus a workflow as a tab. Returns the tab id. */
  openWorkflowTab(workflowId, name) {
    const tabId = workflowTabId(workflowId)
    const existing = get().tabs.find((t) => t.id === tabId)
    if (existing) {
      set({ activeId: tabId })
      return tabId
    }
    const tab = { id: tabId, kind: 'workflow', entityId: workflowId, title: name }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tabId }))
    return tabId
  },

  openTab(tab) {
    const existing = get().tabs.find((t) => t.id === tab.id)
    if (existing) {
      set({ activeId: tab.id })
      return
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
  },

  closeTab(id) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx < 0) return s
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeId = s.activeId
      if (activeId === id) {
        const fallback = tabs[Math.min(idx, tabs.length - 1)] || tabs[0]
        activeId = fallback?.id || null
      }
      // Re-pin to next workflow tab if pinned tab was closed
      let pinnedWorkflowTabId = s.pinnedWorkflowTabId
      if (id === pinnedWorkflowTabId) {
        const nextWf = tabs.find((t) => t.kind === 'workflow')
        pinnedWorkflowTabId = nextWf?.id || null
      }
      return { tabs, activeId, pinnedWorkflowTabId }
    })
  },

  setActive(id) {
    set({ activeId: id })
  },

  /** After a background server load, add tabs for any new workflows without
   *  resetting existing open tabs or the current active tab. */
  syncWorkflowTabs(workflows) {
    set((s) => {
      const existingIds = new Set(s.tabs.map((t) => t.id))
      const added = workflows
        .filter((w) => !existingIds.has(workflowTabId(w.id)))
        .map((w) => ({ id: workflowTabId(w.id), kind: 'workflow', entityId: w.id, title: w.name }))
      if (added.length === 0) return s
      return { tabs: [...s.tabs, ...added] }
    })
  },

  renameTab(id, title) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) }))
  },

  /** Focus (or open) the singleton Settings tab. */
  openSettings() {
    const existing = get().tabs.find((t) => t.id === SETTINGS_TAB_ID)
    if (existing) { set({ activeId: SETTINGS_TAB_ID }); return }
    set((s) => ({
      tabs: [...s.tabs, { id: SETTINGS_TAB_ID, kind: 'settings', title: 'Settings' }],
      activeId: SETTINGS_TAB_ID,
    }))
  },

  /** Focus (or open) the singleton Wiki tab. */
  openWiki() {
    const existing = get().tabs.find((t) => t.id === WIKI_TAB_ID)
    if (existing) { set({ activeId: WIKI_TAB_ID }); return }
    set((s) => ({
      tabs: [...s.tabs, { id: WIKI_TAB_ID, kind: 'wiki', title: 'Wiki' }],
      activeId: WIKI_TAB_ID,
    }))
  },

  /** Close all workflow tabs — leaves non-workflow tabs (settings, agent, etc.) intact. */
  closeAllWorkflowTabs() {
    set((s) => {
      const kept = s.tabs.filter((t) => t.kind !== 'workflow')
      const activeId = kept.find((t) => t.id === s.activeId)?.id || kept[0]?.id || null
      return { tabs: kept, activeId, pinnedWorkflowTabId: null }
    })
  },

  /** Close every tab — results in empty canvas state. */
  closeAllTabs() {
    set({ tabs: [], activeId: null, pinnedWorkflowTabId: null })
  },

  /** Close all tabs except the given one. */
  closeOtherTabs(id) {
    set((s) => {
      const kept = s.tabs.filter((t) => t.id === id)
      const pinnedWorkflowTabId = kept.find((t) => t.kind === 'workflow')?.id || null
      return { tabs: kept, activeId: id, pinnedWorkflowTabId }
    })
  },

  /** Close tabs to the right of the given tab. */
  closeTabsToRight(id) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx < 0) return s
      const kept = s.tabs.filter((_, i) => i <= idx)
      let activeId = s.activeId
      if (!kept.find((t) => t.id === activeId)) activeId = id
      const pinnedWorkflowTabId = kept.find((t) => t.id === s.pinnedWorkflowTabId)
        ? s.pinnedWorkflowTabId
        : kept.find((t) => t.kind === 'workflow')?.id || null
      return { tabs: kept, activeId, pinnedWorkflowTabId }
    })
  },

  /** Close tabs to the left of the given tab. */
  closeTabsToLeft(id) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx < 0) return s
      const kept = s.tabs.filter((_, i) => i >= idx)
      let activeId = s.activeId
      if (!kept.find((t) => t.id === activeId)) activeId = id
      const pinnedWorkflowTabId = kept.find((t) => t.id === s.pinnedWorkflowTabId)
        ? s.pinnedWorkflowTabId
        : kept.find((t) => t.kind === 'workflow')?.id || null
      return { tabs: kept, activeId, pinnedWorkflowTabId }
    })
  },
}))

export const SETTINGS_TAB_ID = 'settings'
export const WIKI_TAB_ID = 'wiki'
export function workflowTabId(wfId) { return `workflow:${wfId}` }
export function workflowIdFromTab(tabId) { return tabId?.startsWith('workflow:') ? tabId.slice(9) : null }
export function agentTabId(agentId) { return `agent:${agentId}` }
export function skillTabId(skillId) { return `skill:${skillId}` }
export function teamTabId(teamId) { return `team:${teamId}` }
