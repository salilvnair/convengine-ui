/**
 * Agent Builder Studio — sim-inspired 4-pane workspace.
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ Topbar: [Brand]   [Workflow name]        [▶ Run] [Save]       │
 *   ├──┬──────────────┬──────────────────────────┬───┬──────────────┤
 *   │R │ SideNav      │ Tabs: [Workflow][Agent…] │ ║ │ Inspector    │
 *   │ail│  panel      │ (Canvas / entity editor) │   │  (subBlocks) │
 *   └──┴──────────────┴──────────────────────────┴───┴──────────────┘
 *
 * Left rail+panel+splitter is managed inside `SideNav`.
 * Right splitter is managed here (mirrors the left one: drag to resize,
 * click to toggle, ⌘. shortcut).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import SideNav from './sidenav/SideNav'
import CenterPane from './tabs/CenterPane'
import Inspector from './panel/Inspector'
import RunModal from './run/RunModal'
import BottomToolbar from './run/BottomToolbar'
import CreateWorkflowModal from './components/CreateWorkflowModal'
import { useWorkspaceStore } from './stores/workspace-store'
import { useWorkflowStore } from './stores/workflow-store'
import { useTabsStore, workflowTabId } from './stores/tabs-store'
import { PlayIcon, PanelRightIcon, SettingsIcon } from './components/icons'
import './builder-studio.css'

const R_MIN = 280
const R_MAX = 560
const R_DEFAULT = 340

export default function AgentBuilderPage() {
  const activeWorkflowId = useWorkspaceStore((s) => s.activeWorkflowId)
  const workflows = useWorkspaceStore((s) => s.workflows)
  const saveWorkflow = useWorkspaceStore((s) => s.saveWorkflow)
  const createWorkflow = useWorkspaceStore((s) => s.createWorkflow)
  const renameWorkflow = useWorkspaceStore((s) => s.renameWorkflow)
  const teams = useWorkspaceStore((s) => s.teams)
  const [editingName, setEditingName] = useState(false)
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)
  const openSettings = useTabsStore((s) => s.openSettings)
  const initWorkflowTabs = useTabsStore((s) => s.initWorkflowTabs)
  const openWorkflowTab = useTabsStore((s) => s.openWorkflowTab)
  const renameTab = useTabsStore((s) => s.renameTab)

  const [rOpen, setROpen] = useState(true)
  const [rWidth, setRWidth] = useState(R_DEFAULT)
  const [rDragging, setRDragging] = useState(false)
  const [rTip, setRTip] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startW: R_DEFAULT, moved: false })
  const [runOpen, setRunOpen] = useState(false)
  const [dockTab, setDockTab] = useState('run')
  const [newWorkflowOpen, setNewWorkflowOpen] = useState(false)
  const tabsInited = useRef(false)

  // Initialize workflow tabs from workspace store on first mount
  useEffect(() => {
    if (tabsInited.current) return
    if (workflows.length > 0) {
      tabsInited.current = true
      initWorkflowTabs(workflows, activeWorkflowId)
    }
  }, [workflows, activeWorkflowId, initWorkflowTabs])

  useEffect(() => {
    if (!activeWorkflowId) return
    const wf = workflows.find((w) => w.id === activeWorkflowId)
    if (wf) loadWorkflow({ nodes: wf.nodes, edges: wf.edges, subBlockValues: wf.subBlockValues })
  }, [activeWorkflowId, workflows, loadWorkflow])

  // ----- Right splitter -----
  const onSplitterPointerDown = useCallback((e) => {
    dragRef.current = { active: true, startX: e.clientX, startW: rWidth, moved: false }
    setRDragging(true)
    e.preventDefault()
  }, [rWidth])

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.startX
      if (Math.abs(dx) > 3) dragRef.current.moved = true
      // Inverse: dragging LEFT increases the right pane width.
      const next = Math.max(R_MIN, Math.min(R_MAX, dragRef.current.startW - dx))
      setRWidth(next)
    }
    function onUp() {
      if (!dragRef.current.active) return
      const moved = dragRef.current.moved
      dragRef.current.active = false
      setRDragging(false)
      if (!moved) setROpen((o) => !o)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  useEffect(() => {
    function isEditable(t) {
      if (!t) return false
      const tag = (t.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      return !!t.isContentEditable
    }
    function onKey(e) {
      const meta = e.metaKey || e.ctrlKey
      // ⌘. — toggle inspector
      if (meta && e.key === '.') { e.preventDefault(); setROpen((o) => !o); return }
      // ⌘, — open Settings tab
      if (meta && e.key === ',') { e.preventDefault(); openSettings(); return }
      // ? — open Settings (only when not typing)
      if (e.key === '?' && !isEditable(e.target)) { e.preventDefault(); openSettings() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSettings])

  const active = workflows.find((w) => w.id === activeWorkflowId)
  const liveWorkflow = active ? { ...active, nodes, edges, subBlockValues } : null

  return (
    <div className="bs-root">
      <header className="bs-topbar">
        <div className="bs-topbar-title">
          <span className="bs-topbar-brand">Agent Builder Studio</span>
        </div>
        <div className="bs-topbar-center">
          {active ? (
            editingName ? (
              <input
                autoFocus
                className="bs-topbar-wfname-input"
                defaultValue={active.name}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== active.name) { renameWorkflow(active.id, v); renameTab(workflowTabId(active.id), v) }
                  setEditingName(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditingName(false)
                }}
              />
            ) : (
              <button
                type="button"
                className="bs-topbar-wfname"
                onClick={() => setEditingName(true)}
                onDoubleClick={() => setEditingName(true)}
                title="Click to rename this workflow"
              >
                <span>{active.name}</span>
                <svg className="bs-topbar-wfname-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            )
          ) : (
            <button
              className="bs-btn"
              onClick={() => setNewWorkflowOpen(true)}
            >
              + New workflow
            </button>
          )}
        </div>
        <div className="bs-topbar-actions">
          <button
            className="bs-btn bs-btn-run"
            disabled={!active}
            onClick={() => { setDockTab('run'); setRunOpen(true) }}
            title="Run this workflow"
          >
            <PlayIcon className="bs-ico-sm" />
            Run
          </button>
          <button
            className="bs-btn-primary"
            disabled={!active}
            onClick={() => { if (!active) return; saveWorkflow(active.id, { nodes, edges, subBlockValues }) }}
          >
            Save
          </button>
          <button
            className="bs-btn-ghost bs-topbar-toggle"
            onClick={() => openSettings()}
            title="Settings & shortcuts (⌘,)"
          >
            <SettingsIcon className="bs-ico-sm" />
          </button>
          <button
            className={`bs-btn-ghost bs-topbar-toggle ${rOpen ? 'is-on' : ''}`}
            onClick={() => setROpen((o) => !o)}
            title={rOpen ? 'Hide inspector (⌘.)' : 'Show inspector (⌘.)'}
          >
            <PanelRightIcon className="bs-ico-sm" />
          </button>
        </div>
      </header>

      <main
        className={`bs-main ${rDragging ? 'is-dragging' : ''}`}
        style={{ '--bs-right-w': `${rOpen ? rWidth : 0}px` }}
      >
        <SideNav />
        <div className="bs-center-wrap">
          <CenterPane />
          {liveWorkflow && (
            <RunModal
              workflow={liveWorkflow}
              onClose={() => setRunOpen(false)}
              activeTab={dockTab}
              onTabChange={setDockTab}
              visible={runOpen}
            />
          )}
          <BottomToolbar
            activeTab={dockTab}
            dockOpen={runOpen}
            onTabClick={(tabId) => {
              if (runOpen && dockTab === tabId) {
                setRunOpen(false)
              } else {
                setDockTab(tabId)
                setRunOpen(true)
              }
            }}
          />
        </div>

        <div
          className="bs-splitter bs-splitter-right"
          onPointerDown={onSplitterPointerDown}
          onMouseEnter={() => setRTip(true)}
          onMouseLeave={() => setRTip(false)}
          aria-label="Resize or collapse inspector"
        >
          <div className="bs-splitter-grip" />
          {rTip && !rDragging && (
            <div className="bs-splitter-tip bs-splitter-tip-right">
              <div>Click to {rOpen ? 'collapse' : 'expand'} <kbd>⌘.</kbd></div>
              <div>Drag to resize</div>
            </div>
          )}
        </div>

        <section className={`bs-right ${rOpen ? 'is-open' : 'is-closed'}`} aria-hidden={!rOpen}>
          <Inspector />
        </section>
      </main>

      {newWorkflowOpen && (
        <CreateWorkflowModal
          teams={teams}
          onCancel={() => setNewWorkflowOpen(false)}
          onCreate={(name, teamId) => {
            const wf = createWorkflow(name, teamId)
            openWorkflowTab(wf.id, wf.name)
            setNewWorkflowOpen(false)
          }}
        />
      )}
    </div>
  )
}
