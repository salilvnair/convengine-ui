/**
 * Run dock — bottom-anchored, resizable, IntelliJ-style tabbed panel.
 *
 * The dock itself is now dumb: it lays out a tab strip + body, handles
 * resize/run state, and delegates every tab's contents to a `panel`
 * registered via `panel-registry.js`. Core ships three panels (Run / Debug /
 * Trace); extensions can drop files into `run-extensions/*.{js,jsx}` or call
 * `registerRunPanel(...)` at runtime to add more.
 *
 * That solves two problems at once:
 *  (a) the "pasting a URL blanks the panel" bug — the Run panel now always
 *      renders its inputs + result (no conditional disappearance).
 *  (b) the framework is extensible: an extension that wants an "Inputs",
 *      "LLM stream", or "Cost" tab just registers a panel.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { executeGraph } from './graph-runner'
import { useWorkflowStore } from '../stores/workflow-store'
import { PlayIcon, MinimizeIcon } from '../components/icons'
import { getRunPanels, onRunPanelsChange, registerRunPanel } from './panel-registry'
import { collectInputNodes } from './input-registry'
import RunPanel from './panels/run-panel'
import DebugPanel from './panels/debug-panel'
import TracePanel from './panels/trace-panel'
import ProblemsPanel from './panels/problems-panel'
import TodoPanel from './panels/todo-panel'

// Register the core panels once. Keeps the registry populated even if no
// extension files exist.
registerRunPanel(RunPanel)
registerRunPanel(DebugPanel)
registerRunPanel(TracePanel)
registerRunPanel(ProblemsPanel)
registerRunPanel(TodoPanel)

const RunModal = forwardRef(function RunModal({ workflow, onClose, onOpen, activeTab: activeTabProp, onTabChange, visible = true, showToast }, ref) {
  const inputNodes = useMemo(() => collectInputNodes(workflow), [workflow])
  const [values, setValues] = useState(() =>
    Object.fromEntries(inputNodes.map((n) => [n.id, n.defaultValue || '']))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState([])
  const progressRef = useRef([])
  const [expanded, setExpanded] = useState({})
  const [height, setHeight] = useState(340)
  const [panels, setPanels] = useState(() => getRunPanels())
  const activeTab = activeTabProp || 'run'
  const setActiveTab = onTabChange || (() => {})

  const startRun = useWorkflowStore((s) => s.startRun)
  const markNodeRunning = useWorkflowStore((s) => s.markNodeRunning)
  const markNodeDone = useWorkflowStore((s) => s.markNodeDone)
  const markNodeError = useWorkflowStore((s) => s.markNodeError)
  const endRun = useWorkflowStore((s) => s.endRun)

  const missing = inputNodes.filter((n) => n.required && !String(values[n.id] || '').trim())
  const runBtnRef = useRef(null)
  const prevMissingRef = useRef(missing.length)

  // Auto-focus the Run button when user fills all required inputs (first time)
  useEffect(() => {
    if (prevMissingRef.current > 0 && missing.length === 0 && visible) {
      runBtnRef.current?.focus()
    }
    prevMissingRef.current = missing.length
  }, [missing.length, visible])

  // Expose tryRun() so the parent can trigger a run from top-bar / context-menu.
  // If all required inputs are filled → run immediately (dock stays closed).
  // If required inputs are missing → open the dock so user can fill them.
  useImperativeHandle(ref, () => ({
    tryRun() {
      if (missing.length === 0 && inputNodes.length > 0) {
        doRun()
      } else {
        onOpen?.()
      }
    },
  }))

  // Keep the tab list in sync if an extension registers a panel at runtime.
  useEffect(() => onRunPanelsChange(() => setPanels(getRunPanels())), [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onResizePointerDown = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    function onMove(ev) {
      const d = startY - ev.clientY
      const next = Math.min(Math.max(140, startH + d), Math.round(window.innerHeight * 0.85))
      setHeight(next)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [height])

  async function doRun() {
    // If workflow has required inputs, auto-minimize the dock on Run
    if (inputNodes.length > 0 && missing.length === 0) {
      onClose()
    }
    setBusy(true); setError(null); setResult(null); setProgress([]); progressRef.current = []; setExpanded({})
    setActiveTab('run')
    startRun()
    try {
      for (const n of inputNodes) {
        if (n.required && !String(values[n.id] || '').trim()) {
          throw new Error(`"${n.label}" is required.`)
        }
      }
      const res = await executeGraph({
        workflow,
        inputs: values,
        onProgress: (p) => {
          const entry = { ...p, at: Date.now() }
          progressRef.current = [...progressRef.current, entry]
          setProgress((prev) => [...prev, entry])
          if (p.type === 'start') markNodeRunning(p.nodeId)
          else if (p.type === 'done') markNodeDone(p.nodeId)
          else if (p.type === 'error') markNodeError(p.nodeId)
        },
      })
      setResult(res)
      endRun()
      // Check if any node errored in the trace
      const hasTraceErrors = res?.trace?.some((t) => t.error)
      if (hasTraceErrors) {
        showToast?.('Workflow failed', 'error')
        setActiveTab('problems')
        onOpen?.()
      } else {
        showToast?.('Workflow completed', 'success')
      }
    } catch (err) {
      // Build a synthetic result from progress events so Problems tab gets full detail
      const errorEvents = progressRef.current.filter((p) => p.type === 'error' && p.errorDetail)
      const errorTrace = errorEvents.map((p) => ({
        nodeId: p.nodeId,
        blockType: p.blockType,
        title: p.title,
        error: p.error,
        errorDetail: p.errorDetail,
      }))
      // If the thrown error itself has rich fields from run-client, include it
      if (errorTrace.length === 0 && (err.url || err.status || err.requestPayload)) {
        errorTrace.push({
          nodeId: 'unknown',
          blockType: err.blockType,
          title: err.nodeTitle,
          error: err.message || String(err),
          errorDetail: {
            message: err.message, url: err.url, resolvedUrl: err.resolvedUrl,
            method: err.method, status: err.status, statusText: err.statusText,
            responseBody: err.responseBody, responseHeaders: err.responseHeaders,
            requestHeaders: err.requestHeaders, requestPayload: err.requestPayload,
            stack: err.stack,
          },
        })
      }
      if (errorTrace.length > 0) {
        setResult({ output: null, trace: errorTrace })
      }
      setError(err.message || String(err))
      endRun()
      showToast?.('Workflow failed', 'error')
      setActiveTab('problems')
      onOpen?.()
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    if (!result?.trace) return null
    const done = result.trace.filter((t) => !t.error).length
    const err = result.trace.filter((t) => t.error).length
    const ms = result.trace.reduce((a, t) => a + (t.ms || 0), 0)
    return { done, err, ms, total: result.trace.length }
  }, [result])

  const ctx = {
    workflow, values, setValues, inputNodes, missing,
    busy, error, result, progress, expanded, setExpanded,
    onRun: doRun,
  }
  const activePanel = panels.find((p) => p.id === activeTab) || panels[0]

  return (
    <div className="bs-run-dock" style={{ height, display: visible ? undefined : 'none' }}>
      <div className="bs-run-dock-resize" onPointerDown={onResizePointerDown} title="Drag to resize" />

      <header className="bs-run-dock-head">
        <div className="bs-run-dock-tabs" role="tablist">
          {panels.map((p) => {
            const badge = typeof p.badge === 'function' ? p.badge(ctx) : null
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={activeTab === p.id}
                className={`bs-run-dock-tab ${activeTab === p.id ? 'is-active' : ''}`}
                onClick={() => setActiveTab(p.id)}
              >
                {p.label}
                {badge ? <span className="bs-run-dock-tabcount">{badge}</span> : null}
              </button>
            )
          })}
        </div>

        <div className="bs-run-dock-state">
          {busy && <span className="bs-run-dock-pill">running…</span>}
          {!busy && error && <span className="bs-run-dock-pill is-error">failed</span>}
          {!busy && result && !error && (
            <span className="bs-run-dock-pill is-ok">
              done · {stats?.done}/{stats?.total} · {stats?.ms}ms
            </span>
          )}
        </div>

        <div className="bs-run-dock-actions">
          {inputNodes.some((n) => n.required) && (
            <button ref={runBtnRef} className="bs-btn-run-green bs-btn-sm" onClick={doRun} disabled={busy || missing.length > 0} title={missing.length > 0 ? 'Fill all required inputs first' : 'Run workflow'}>
              <PlayIcon className="bs-ico-xs" /> {busy ? 'Running…' : 'Run'}
            </button>
          )}
          <button className="bs-btn-ghost bs-btn-sm" onClick={onClose} title="Minimize">
            <MinimizeIcon className="bs-ico-xs" />
          </button>
        </div>
      </header>

      <div className="bs-run-dock-body" role="tabpanel">
        {activePanel ? activePanel.render(ctx) : null}
      </div>
    </div>
  )
})

export default RunModal
