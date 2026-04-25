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
import { PlayIcon, PanelRightIcon, PanelLeftIcon, SettingsIcon } from './components/icons'
import { BookIcon } from './tabs/WikiGuide'
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
  const syncWorkflowTabs = useTabsStore((s) => s.syncWorkflowTabs)
  const openWorkflowTab = useTabsStore((s) => s.openWorkflowTab)
  const renameTab = useTabsStore((s) => s.renameTab)
  const activeTabId = useTabsStore((s) => s.activeId)

  const [rOpen, setROpen] = useState(false)
  const [rWidth, setRWidth] = useState(R_DEFAULT)
  const [rDragging, setRDragging] = useState(false)

  /* ── Theme toggle (extension-only) ──────────────────────────────── */
  const isExtension = typeof window !== 'undefined' && window.__BS_MODE__ === 'vscode-extension'
  const [isDark, setIsDark] = useState(() => {
    if (!isExtension) return false
    const stored = typeof localStorage !== 'undefined' && localStorage.getItem('convengine_ui_theme')
    return stored ? stored === 'dark' : true // default dark in VS Code
  })
  useEffect(() => {
    if (!isExtension) return
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    document.documentElement.setAttribute('data-mode', 'extension')
    localStorage.setItem('convengine_ui_theme', isDark ? 'dark' : 'light')
  }, [isDark, isExtension])
  const toggleTheme = useCallback(() => setIsDark((d) => !d), [])
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
    const duration = type === 'error' ? 5000 : 2500
    toastTimer.current = setTimeout(() => setToast(null), duration)
  }, [])

  const active = workflows.find((w) => w.id === activeWorkflowId)
  const canRun = !!active && nodes.length >= 2
  const canSave = !!active
  const canExport = !!active && nodes.length >= 2

  const handleRun = useCallback(() => {
    if (!active) return
    if (nodes.length < 2) {
      showToast('Add at least 2 blocks to run', 'warning')
      return
    }
    animateBtn('.bs-topbar-icon-run')
    setDockTab('run')
    showToast('Running workflow…', 'run')
    if (runRef.current) runRef.current.tryRun()
    else setRunOpen(true)
  }, [active, animateBtn, nodes, showToast])

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



  // Initialize workflow tabs from workspace store on first mount
  useEffect(() => {
    if (tabsInited.current) return
    if (workflows.length > 0) {
      tabsInited.current = true
      initWorkflowTabs(workflows, activeWorkflowId)
    }
  }, [workflows, activeWorkflowId, initWorkflowTabs])

  // After background server sync adds new workflows, add their tabs without
  // resetting the current open tab state.
  useEffect(() => {
    if (!tabsInited.current) return
    syncWorkflowTabs(workflows)
  }, [workflows, syncWorkflowTabs])

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
      } else if (action === 'open-problems') {
        setDockTab('problems')
        setRunOpen(true)
      }
    }
    window.addEventListener('bs:action', handler)
    return () => window.removeEventListener('bs:action', handler)
}, [canRun, handleRun, showToast])

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
      // Browser: inspector on RIGHT — drag left increases width (negative dx = grow)
      // Extension: inspector on LEFT — drag right increases width (positive dx = grow)
      const next = Math.max(R_MIN, Math.min(R_MAX, isExtension
        ? dragRef.current.startW + dx
        : dragRef.current.startW - dx))
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
      const alt = e.altKey
      // In the VS Code extension, panel toggles use Alt/Option to avoid conflicts
      const panelMod = isExtension ? alt : meta
      const onWorkflowCanvas = activeTabId?.startsWith('workflow:')
      // ⌥. (ext) / ⌘. (browser) — toggle bottom panel
      if (panelMod && (isExtension ? e.code === 'Period' : e.key === '.')) { e.preventDefault(); setRunOpen((o) => !o); return }
      // ⌥/ (ext) / ⌘/ (browser) — toggle inspector
      if (panelMod && (isExtension ? e.code === 'Slash' : e.key === '/')) { e.preventDefault(); setROpen((o) => !o); return }
      // ⌘M — toggle light/dark theme (extension only)
      if (meta && (e.key === 'm' || e.key === 'M') && isExtension) { e.preventDefault(); toggleTheme(); return }
      // ⌥, (ext) / ⌘, (browser) — open Settings tab
      if (panelMod && (isExtension ? e.code === 'Comma' : e.key === ',')) { e.preventDefault(); openSettings(); return }
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTabId, handleExport, handleRun, handleSave, openSettings, isExtension, toggleTheme])

  const liveWorkflow = active ? { ...active, nodes, edges, subBlockValues } : null

  return (
    <div className="bs-root">
      <header className="bs-topbar">
        <div className="bs-topbar-title">
          {isExtension && (
            <button
              className="bs-btn-ghost bs-topbar-toggle"
              onClick={() => setROpen((o) => !o)}
              title={rOpen ? 'Hide inspector (⌥/)' : 'Show inspector (⌥/)'}
            >
              <PanelLeftIcon className="bs-ico-sm" />
            </button>
          )}
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
          {!isExtension && (
            <>
              <span className="bs-topbar-divider" />
              <button
                className="bs-btn-ghost bs-topbar-toggle"
                onClick={() => setROpen((o) => !o)}
                title={rOpen ? 'Hide inspector (⌘/)' : 'Show inspector (⌘/)'}
              >
                <PanelRightIcon className="bs-ico-sm" />
              </button>
            </>
          )}
          {isExtension && (
            <>
              <span className="bs-topbar-divider" />
              <button
                className="bs-btn-ghost bs-topbar-toggle"
                onClick={toggleTheme}
                title={isDark ? 'Switch to light mode (⌘M)' : 'Switch to dark mode (⌘M)'}
                data-tooltip={isDark ? 'Light mode (⌘M)' : 'Dark mode (⌘M)'}
              >
                {isDark ? (
                  /* Sun icon */
                  <svg className="bs-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  /* Moon icon */
                  <svg className="bs-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
            </>
          )}
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
        <section className={`bs-right ${rOpen ? 'is-open' : 'is-closed'}`} aria-hidden={!rOpen}>
          <Inspector />
        </section>

        <div
          className={`bs-splitter bs-splitter-right${rOpen ? '' : ' is-collapsed'}`}
          onPointerDown={onSplitterPointerDown}
          onMouseEnter={() => setRTip(true)}
          onMouseLeave={() => setRTip(false)}
          aria-label="Resize or collapse inspector"
        >
          <div className="bs-splitter-grip" />
          {rTip && !rDragging && (
            <div className="bs-splitter-tip">
              <div>Click to {rOpen ? 'collapse' : 'expand'} <kbd>{isExtension ? '⌥/' : '⌘/'}</kbd></div>
              <div>Drag to resize</div>
            </div>
          )}
        </div>

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

        <SideNav />
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
