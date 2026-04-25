/**
 * Postman-style tab bar + body for the builder studio center pane.
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ [📄 Demo ×]  [📄 New WF ×]  [🤖 Agent ×]          │ tab bar
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │   (active tab's content — Canvas or entity editor)  │
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 *
 * Each workflow gets its own tab. The first workflow tab is pinned (cannot
 * be closed) — like ComfyUI's default graph. Switching workflow tabs sets
 * `activeWorkflowId` in workspace store so the canvas shows the right graph.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTabsStore, workflowIdFromTab } from '../stores/tabs-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import Canvas from '../canvas/Canvas'
import AgentEditor from './AgentEditor'
import SkillEditor from './SkillEditor'
import SettingsTab from './SettingsTab'
import WikiGuide, { BookIcon } from './WikiGuide'
import TeamEditor from './TeamEditor'
import { WorkflowsIcon, AgentsIcon, SkillsIcon, TeamsIcon, SettingsIcon, XIcon } from '../components/icons'

const ICONS = {
  workflow: WorkflowsIcon,
  agent: AgentsIcon,
  skill: SkillsIcon,
  team: TeamsIcon,
  settings: SettingsIcon,
  wiki: BookIcon,
}

export default function CenterPane() {
  const tabs = useTabsStore((s) => s.tabs)
  const activeId = useTabsStore((s) => s.activeId)
  const pinnedWorkflowTabId = useTabsStore((s) => s.pinnedWorkflowTabId)
  const setActive = useTabsStore((s) => s.setActive)
  const closeTab = useTabsStore((s) => s.closeTab)
  const closeAllTabs = useTabsStore((s) => s.closeAllTabs)
  const closeAllWorkflowTabs = useTabsStore((s) => s.closeAllWorkflowTabs)
  const closeOtherTabs = useTabsStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useTabsStore((s) => s.closeTabsToRight)
  const closeTabsToLeft = useTabsStore((s) => s.closeTabsToLeft)
  const openWorkflow = useWorkspaceStore((s) => s.openWorkflow)
  const initDone = useRef(false)
  const [ctxMenu, setCtxMenu] = useState(null)

  const active = tabs.find((t) => t.id === activeId) || tabs[0]

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const handler = () => setCtxMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [ctxMenu])

  // When the active tab changes, if it's a workflow tab, sync activeWorkflowId
  useEffect(() => {
    if (!activeId) return
    const wfId = workflowIdFromTab(activeId)
    if (wfId) openWorkflow(wfId)
  }, [activeId, openWorkflow])

  const handleTabContextMenu = useCallback((e, t) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, tabId: t.id, pinned: t.id === pinnedWorkflowTabId })
  }, [pinnedWorkflowTabId])

  return (
    <div className="bs-center">
      <div className="bs-tabbar" role="tablist">
        {tabs.map((t) => {
          const Icon = ICONS[t.kind] || WorkflowsIcon
          const isActive = t.id === activeId
          const pinned = t.id === pinnedWorkflowTabId
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              className={`bs-tab ${isActive ? 'is-active' : ''} ${pinned ? 'is-pinned' : ''}`}
              onClick={() => setActive(t.id)}
              onAuxClick={(e) => { if (e.button === 1) closeTab(t.id) }}
              onContextMenu={(e) => handleTabContextMenu(e, t)}
            >
              <Icon className="bs-ico-xs" />
              <span className="bs-tab-label">{t.title}</span>
              <span
                className="bs-tab-close"
                role="button"
                tabIndex={0}
                title="Close tab"
                onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(t.id) } }}
              >
                <XIcon className="bs-ico-xs" />
              </span>
            </button>
          )
        })}
      </div>
      {ctxMenu && (() => {
        const ctxIdx = tabs.findIndex((t) => t.id === ctxMenu.tabId)
        const hasRight = tabs.slice(ctxIdx + 1).some((t) => t.id !== pinnedWorkflowTabId)
        const hasLeft = tabs.slice(0, ctxIdx).some((t) => t.id !== pinnedWorkflowTabId)
        return (
        <div
          className="bs-ctx-menu"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          {!ctxMenu.pinned && (
            <button className="bs-ctx-item" onClick={() => { closeTab(ctxMenu.tabId); setCtxMenu(null) }}>
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Close
            </button>
          )}
          <button className="bs-ctx-item" disabled={tabs.length <= 1} onClick={() => { closeOtherTabs(ctxMenu.tabId); setCtxMenu(null) }}>
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18" /><path d="M6 6l12 12" /><rect x="1" y="1" width="7" height="7" rx="1.5" opacity="0.4" /></svg>
            Close Others
          </button>
          <button className="bs-ctx-item" disabled={!hasRight} onClick={() => { closeTabsToRight(ctxMenu.tabId); setCtxMenu(null) }}>
            <svg viewBox="0 0 24 24"><path d="M13 6l6 6-6 6" /><line x1="5" y1="12" x2="19" y2="12" /><line x1="16" y1="9" x2="22" y2="15" opacity="0.4" /><line x1="22" y1="9" x2="16" y2="15" opacity="0.4" /></svg>
            Close to the Right
          </button>
          <button className="bs-ctx-item" disabled={!hasLeft} onClick={() => { closeTabsToLeft(ctxMenu.tabId); setCtxMenu(null) }}>
            <svg viewBox="0 0 24 24"><path d="M11 18l-6-6 6-6" /><line x1="19" y1="12" x2="5" y2="12" /><line x1="8" y1="9" x2="2" y2="15" opacity="0.4" /><line x1="2" y1="9" x2="8" y2="15" opacity="0.4" /></svg>
            Close to the Left
          </button>
          <button className="bs-ctx-item" disabled={tabs.filter((t) => t.kind === 'workflow').length === 0} onClick={() => { closeAllWorkflowTabs(); setCtxMenu(null) }}>
            <svg viewBox="0 0 24 24"><path d="M9 3H5a2 2 0 0 0-2 2v4" /><path d="M15 3h4a2 2 0 0 1 2 2v4" /><path d="M9 21H5a2 2 0 0 1-2-2v-4" /><path d="M15 21h4a2 2 0 0 0 2-2v-4" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>
            Close All Workflows
          </button>
          <div className="bs-ctx-sep" />
          <button className="bs-ctx-item is-danger" onClick={() => { closeAllTabs(); setCtxMenu(null) }}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            Close All
          </button>
        </div>
        )
      })()}
      <div className="bs-tab-body">
        {!active && (
          <div className="bs-empty-canvas">
            <div className="bs-empty-canvas-hint">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="3" y1="9" x2="21" y2="9" />
              </svg>
              <span>No open tabs</span>
              <span className="bs-empty-canvas-sub">Open a workflow from the sidebar or create a new one.</span>
            </div>
          </div>
        )}
        {active?.kind === 'workflow' && <Canvas />}
        {active?.kind === 'agent' && <AgentEditor agentId={active.entityId} />}
        {active?.kind === 'skill' && <SkillEditor skillId={active.entityId} />}
        {active?.kind === 'team' && <TeamEditor teamId={active.entityId} />}
        {active?.kind === 'settings' && <SettingsTab />}
        {active?.kind === 'wiki' && <WikiGuide />}
      </div>
    </div>
  )
}
