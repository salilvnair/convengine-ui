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
              onAuxClick={(e) => { if (e.button === 1 && !pinned) closeTab(t.id) }}
              onContextMenu={(e) => handleTabContextMenu(e, t)}
            >
              <Icon className="bs-ico-xs" />
              <span className="bs-tab-label">{t.title}</span>
              {!pinned && (
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
              )}
            </button>
          )
        })}
      </div>
      {ctxMenu && (
        <div
          className="bs-ctx-menu"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          {!ctxMenu.pinned && (
            <button className="bs-ctx-item" onClick={() => { closeTab(ctxMenu.tabId); setCtxMenu(null) }}>Close</button>
          )}
          <button className="bs-ctx-item" onClick={() => { closeOtherTabs(ctxMenu.tabId); setCtxMenu(null) }}>Close Others</button>
          <button className="bs-ctx-item" onClick={() => { closeAllWorkflowTabs(); setCtxMenu(null) }}>Close All Workflows</button>
          <div className="bs-ctx-sep" />
          <button className="bs-ctx-item" onClick={() => { closeAllTabs(); setCtxMenu(null) }}>Close All</button>
        </div>
      )}
      <div className="bs-tab-body">
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
