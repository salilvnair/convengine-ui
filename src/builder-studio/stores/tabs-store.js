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

  /** Called once at app boot to seed workflow tabs from workspace store. */
  initWorkflowTabs(workflows, activeWorkflowId) {
    const wfTabs = workflows.map((w) => ({
      id: workflowTabId(w.id),
      kind: 'workflow',
      entityId: w.id,
      title: w.name,
    }))
    const pinnedId = wfTabs.length > 0 ? wfTabs[0].id : null
    const activeTab = activeWorkflowId ? workflowTabId(activeWorkflowId) : pinnedId
    set({ tabs: wfTabs, activeId: activeTab, pinnedWorkflowTabId: pinnedId })
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
      // Don't close if it's the last remaining tab
      if (s.tabs.length <= 1) return s
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx < 0) return s
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeId = s.activeId
      if (activeId === id) {
        const fallback = tabs[Math.min(idx, tabs.length - 1)] || tabs[0]
        activeId = fallback?.id || null
      }
      // If pinned tab was closed, re-pin the first remaining workflow tab
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

  /** Close all workflow tabs except the pinned one. */
  closeAllWorkflowTabs() {
    set((s) => {
      const kept = s.tabs.filter((t) => t.kind !== 'workflow' || t.id === s.pinnedWorkflowTabId)
      let activeId = s.activeId
      if (!kept.find((t) => t.id === activeId)) {
        activeId = kept[0]?.id || null
      }
      return { tabs: kept, activeId }
    })
  },

  /** Close all tabs except the pinned workflow tab. */
  closeAllTabs() {
    set((s) => {
      const kept = s.tabs.filter((t) => t.id === s.pinnedWorkflowTabId)
      return { tabs: kept, activeId: kept[0]?.id || null }
    })
  },

  /** Close all tabs except the given one (and the pinned workflow tab). */
  closeOtherTabs(id) {
    set((s) => {
      const kept = s.tabs.filter((t) => t.id === id || t.id === s.pinnedWorkflowTabId)
      return { tabs: kept, activeId: id }
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
