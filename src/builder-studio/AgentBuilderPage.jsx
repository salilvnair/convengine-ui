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
 * click to toggle, ⌘/ shortcut).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import SideNav from './sidenav/SideNav'
import CenterPane from './tabs/CenterPane'
import Inspector from './panel/Inspector'
import RunModal from './run/RunModal'
import BottomToolbar from './run/BottomToolbar'
import CreateWorkflowModal from './components/CreateWorkflowModal'
import { fetchAvailableProviders } from './api/llm-provider-client'
import { useWorkspaceStore } from './stores/workspace-store'
import { useLlmConfigStore } from './stores/llm-config-store'
import { useWorkflowStore } from './stores/workflow-store'
import { useTabsStore, workflowTabId } from './stores/tabs-store'
import { PlayIcon, PanelRightIcon, SettingsIcon, DeployIcon } from './components/icons'
import { BookIcon } from './tabs/WikiGuide'
import { deployWorkflow } from './api/deploy-client'
import './builder-studio.css'

const R_MIN = 280
const R_MAX = 560
const R_DEFAULT = 340

export default function AgentBuilderPage() {
  const activeWorkflowId = useWorkspaceStore((s) => s.activeWorkflowId)
  const workflows = useWorkspaceStore((s) => s.workflows)
  const saveWorkflow = useWorkspaceStore((s) => s.saveWorkflow)
  const syncToServer = useWorkspaceStore((s) => s.syncToServer)
  const loadFromServer = useWorkspaceStore((s) => s.loadFromServer)
  const createWorkflow = useWorkspaceStore((s) => s.createWorkflow)
  const renameWorkflow = useWorkspaceStore((s) => s.renameWorkflow)
  const teams = useWorkspaceStore((s) => s.teams)
  const setLlmConfig = useLlmConfigStore((s) => s.setConfig)
  const [editingName, setEditingName] = useState(false)
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)
  const openSettings = useTabsStore((s) => s.openSettings)
  const openWiki = useTabsStore((s) => s.openWiki)
  const initWorkflowTabs = useTabsStore((s) => s.initWorkflowTabs)
  const openWorkflowTab = useTabsStore((s) => s.openWorkflowTab)
  const renameTab = useTabsStore((s) => s.renameTab)
  const activeTabId = useTabsStore((s) => s.activeId)

  const [rOpen, setROpen] = useState(true)
  const [rWidth, setRWidth] = useState(R_DEFAULT)
  const [rDragging, setRDragging] = useState(false)
  const [rTip, setRTip] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startW: R_DEFAULT, moved: false })
  const [runOpen, setRunOpen] = useState(false)
  const [dockTab, setDockTab] = useState('run')
  const [newWorkflowOpen, setNewWorkflowOpen] = useState(false)
  const tabsInited = useRef(false)
  const runRef = useRef(null)
  const [toast, setToast] = useState(null) // { message, type, key }
  const toastTimer = useRef(null)

  /** Briefly add `is-clicked` class to a button for CSS animation */
  const animateBtn = useCallback((selector) => {
    const el = document.querySelector(selector)
    if (!el) return
    el.classList.remove('is-clicked')
    // Force reflow so re-adding triggers animation
    void el.offsetWidth
    el.classList.add('is-clicked')
    const onEnd = () => { el.classList.remove('is-clicked'); el.removeEventListener('animationend', onEnd) }
    el.addEventListener('animationend', onEnd)
    // Fallback removal
    setTimeout(() => el.classList.remove('is-clicked'), 800)
  }, [])

  const showToast = useCallback((message, type = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ message, type, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const active = workflows.find((w) => w.id === activeWorkflowId)
  const canRun = !!active && nodes.length >= 2
  const canSave = !!active
  const canExport = !!active && nodes.length >= 2
  const canDeploy = !!active && nodes.length >= 2

  const handleRun = useCallback(() => {
    if (!canRun) return
    animateBtn('.bs-topbar-icon-run')
    setDockTab('run')
    showToast('Running workflow…', 'run')
    if (runRef.current) runRef.current.tryRun()
    else setRunOpen(true)
  }, [animateBtn, canRun, showToast])

  const handleSave = useCallback(() => {
    if (!active) return
    animateBtn('.bs-topbar-icon-save')
    saveWorkflow(active.id, { nodes, edges, subBlockValues })
    syncToServer()
    showToast('Workflow saved', 'save')
  }, [active, animateBtn, edges, nodes, saveWorkflow, showToast, subBlockValues, syncToServer])

  const handleExport = useCallback(() => {
    if (!active || !canExport) return
    animateBtn('.bs-topbar-icon-export')
    const cleanNodes = nodes.map(({ width, height, dragging, selected, positionAbsolute, ...n }) => n)
    const cleanEdges = edges.map(({ selected, ...e }) => e)
    const exportData = {
      _comment: `Exported from ConvEngine Agent Builder Studio — ${new Date().toISOString()}`,
      workflow: {
        id:             active.id,
        name:           active.name,
        teamId:         active.teamId || null,
        nodes:          cleanNodes,
        edges:          cleanEdges,
        subBlockValues,
        createdAt:      active.createdAt || new Date().toISOString(),
      },
    }
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (active.name || active.id || 'workflow').replace(/\s+/g, '_') + '.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Workflow JSON exported', 'save')
  }, [active, animateBtn, canExport, edges, nodes, showToast, subBlockValues])

  const handleDeploy = useCallback(async () => {
    if (!active || !canDeploy) return
    animateBtn('.bs-topbar-icon-deploy')
    saveWorkflow(active.id, { nodes, edges, subBlockValues })
    syncToServer()
    const scheduleNode = nodes.find((n) => n.data?.blockType === 'schedule')
    const webhookNode = nodes.find((n) => n.data?.blockType === 'webhook_request')
    let trigger = { type: 'manual' }
    if (scheduleNode) {
      const sv = subBlockValues[scheduleNode.id] || {}
      trigger = { type: 'cron', cron: sv.cron || '0 * * * *', timezone: sv.timezone || 'UTC' }
    } else if (webhookNode) {
      trigger = { type: 'webhook' }
    }
    // Clear stale deploy problems before each attempt
    useWorkflowStore.getState().clearExtraProblems()
    try {
      const result = await deployWorkflow({
        workflowId: active.id,
        workflow: { nodes, edges, subBlockValues },
        trigger,
      })
      let msg = 'Workflow deployed'
      if (result.webhookUrl) msg += ` · Webhook: ${result.webhookUrl}`
      if (result.cronInterval) msg += ' · Cron active'
      showToast(msg, 'success')
    } catch (err) {
      showToast(`Deploy failed: ${err.message}`, 'error')
      useWorkflowStore.getState().addExtraProblem({
        severity: 'error',
        node: 'Deploy',
        message: err.message,
        detail: {
          message: err.message,
          blockType: 'deploy',
          nodeTitle: 'Deploy',
          cause: 'The workflow could not be deployed to ce-builder-studio. Check that the server is running and reachable.',
          hint: 'Verify VITE_CE_STUDIO_BASE points to the running ce-builder-studio instance (default: http://localhost:3001).',
          stack: err.stack,
          timestamp: new Date().toISOString(),
        },
      })
      setDockTab('problems')
      setRunOpen(true)
    }
  }, [active, animateBtn, canDeploy, edges, nodes, saveWorkflow, showToast, subBlockValues, syncToServer])

  // Initialize workflow tabs from workspace store on first mount
  useEffect(() => {
    if (tabsInited.current) return
    if (workflows.length > 0) {
      tabsInited.current = true
      initWorkflowTabs(workflows, activeWorkflowId)
    }
  }, [workflows, activeWorkflowId, initWorkflowTabs])

  // Hydrate from server on startup (if backend is available)
  const serverLoaded = useRef(false)
  useEffect(() => {
    if (serverLoaded.current) return
    serverLoaded.current = true
    loadFromServer().catch(() => {})
  }, [loadFromServer])

  useEffect(() => {
    fetchAvailableProviders()
      .then((config) => setLlmConfig(config))
      .catch(() => {})
  }, [setLlmConfig])

  useEffect(() => {
    if (!activeWorkflowId) return
    const wf = workflows.find((w) => w.id === activeWorkflowId)
    if (wf) loadWorkflow({ nodes: wf.nodes, edges: wf.edges, subBlockValues: wf.subBlockValues })
  }, [activeWorkflowId, workflows, loadWorkflow])

  // Listen for context-menu action dispatches from Canvas
  useEffect(() => {
    const handler = (e) => {
      const action = e.detail
      if (action === 'run') {
        if (!canRun) { showToast('Add at least 2 blocks to run', 'warning'); return }
        handleRun()
      } else if (action === 'deploy') {
        handleDeploy()
      } else if (action === 'open-problems') {
        setDockTab('problems')
        setRunOpen(true)
      }
    }
    window.addEventListener('bs:action', handler)
    return () => window.removeEventListener('bs:action', handler)
  }, [canRun, handleDeploy, handleRun, showToast])

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
      const onWorkflowCanvas = activeTabId?.startsWith('workflow:')
      // ⌘. — toggle bottom panel
      if (meta && e.key === '.') { e.preventDefault(); setRunOpen((o) => !o); return }
      // ⌘/ — toggle inspector
      if (meta && e.key === '/') { e.preventDefault(); setROpen((o) => !o); return }
      // ⌘, — open Settings tab
      if (meta && e.key === ',') { e.preventDefault(); openSettings(); return }
      // ? — open Settings (only when not typing)
      if (e.key === '?' && !isEditable(e.target)) { e.preventDefault(); openSettings() }
      // ⌘S — Save (prevent browser save dialog, works everywhere)
      if (meta && (e.key === 's' || e.key === 'S') && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        if (onWorkflowCanvas) handleSave()
        return
      }
      if (!meta || isEditable(e.target) || !onWorkflowCanvas || e.altKey || e.shiftKey) return
      if (e.key === '1') { e.preventDefault(); handleRun(); return }
      if (e.key === '2') { e.preventDefault(); handleSave(); return }
      if (e.key === '3') { e.preventDefault(); handleExport(); return }
      if (e.key === '4') { e.preventDefault(); handleDeploy() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTabId, handleDeploy, handleExport, handleRun, handleSave, openSettings])

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
            className="bs-topbar-icon-btn bs-topbar-icon-run"
            disabled={!canRun}
            onClick={handleRun}
            data-tooltip="Run (⌘/Ctrl+1)"
          >
            <PlayIcon className="bs-ico-topbar" />
          </button>
          <button
            className="bs-topbar-icon-btn bs-topbar-icon-save"
            disabled={!canSave}
            onClick={handleSave}
            data-tooltip="Save (⌘/Ctrl+2)"
          >
            <svg className="bs-ico-topbar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>
          <button
            className="bs-topbar-icon-btn bs-topbar-icon-export"
            disabled={!canExport}
            onClick={handleExport}
            data-tooltip="Export JSON (⌘/Ctrl+3)"
          >
            <svg className="bs-ico-topbar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button
            className="bs-topbar-icon-btn bs-topbar-icon-deploy"
            disabled={!canDeploy}
            onClick={handleDeploy}
            data-tooltip="Deploy (⌘/Ctrl+4)"
          >
            <DeployIcon className="bs-ico-topbar" />
          </button>
          <span className="bs-topbar-divider" />
          <button
            className={`bs-btn-ghost bs-topbar-toggle`}
            onClick={() => setROpen((o) => !o)}
            title={rOpen ? 'Hide inspector (⌘/)' : 'Show inspector (⌘/)'}
          >
            <PanelRightIcon className="bs-ico-sm" />
          </button>
        </div>
      </header>

      {toast && (
        <div key={toast.key} className={`bs-toast bs-toast-${toast.type}`}>
          <span className="bs-toast-dot" />
          <span>{toast.message}</span>
        </div>
      )}

      <main
        className={`bs-main ${rDragging ? 'is-dragging' : ''}`}
        style={{ '--bs-right-w': `${rOpen ? rWidth : 0}px` }}
      >
        <SideNav />
        <div className="bs-center-wrap">
          <CenterPane />
          {liveWorkflow && (
            <RunModal
              ref={runRef}
              workflow={liveWorkflow}
              onClose={() => setRunOpen(false)}
              onOpen={() => setRunOpen(true)}
              activeTab={dockTab}
              onTabChange={setDockTab}
              visible={runOpen}
              showToast={showToast}
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
              <div>Click to {rOpen ? 'collapse' : 'expand'} <kbd>⌘/</kbd></div>
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
