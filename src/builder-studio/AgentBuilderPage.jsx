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
import { useWorkspaceStore } from './stores/workspace-store'
import { useWorkflowStore } from './stores/workflow-store'
import { PlayIcon, PanelRightIcon } from './components/icons'
import './builder-studio.css'

const R_MIN = 280
const R_MAX = 560
const R_DEFAULT = 340

export default function AgentBuilderPage() {
  const activeWorkflowId = useWorkspaceStore((s) => s.activeWorkflowId)
  const workflows = useWorkspaceStore((s) => s.workflows)
  const saveWorkflow = useWorkspaceStore((s) => s.saveWorkflow)
  const createWorkflow = useWorkspaceStore((s) => s.createWorkflow)
  const teams = useWorkspaceStore((s) => s.teams)
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)

  const [rOpen, setROpen] = useState(true)
  const [rWidth, setRWidth] = useState(R_DEFAULT)
  const [rDragging, setRDragging] = useState(false)
  const [rTip, setRTip] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startW: R_DEFAULT, moved: false })
  const [runOpen, setRunOpen] = useState(false)

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
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); setROpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
            <div className="bs-topbar-wfname">{active.name}</div>
          ) : (
            <button
              className="bs-btn"
              onClick={() => createWorkflow('Untitled workflow', teams[0]?.id)}
            >
              + New workflow
            </button>
          )}
        </div>
        <div className="bs-topbar-actions">
          <button
            className="bs-btn bs-btn-run"
            disabled={!active}
            onClick={() => setRunOpen(true)}
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
        <CenterPane />

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

      {runOpen && liveWorkflow && (
        <RunModal workflow={liveWorkflow} onClose={() => setRunOpen(false)} />
      )}
    </div>
  )
}
