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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { executeGraph } from './graph-runner'
import { useWorkflowStore } from '../stores/workflow-store'
import { PlayIcon, XIcon } from '../components/icons'
import { getRunPanels, onRunPanelsChange, registerRunPanel } from './panel-registry'
import RunPanel from './panels/run-panel'
import DebugPanel from './panels/debug-panel'
import TracePanel from './panels/trace-panel'

// Register the core panels once. Keeps the registry populated even if no
// extension files exist.
registerRunPanel(RunPanel)
registerRunPanel(DebugPanel)
registerRunPanel(TracePanel)

export default function RunModal({ workflow, onClose }) {
  const inputNodes = useMemo(() => collectInputNodes(workflow), [workflow])
  const [values, setValues] = useState(() =>
    Object.fromEntries(inputNodes.map((n) => [n.id, n.defaultValue || '']))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState([])
  const [expanded, setExpanded] = useState({})
  const [height, setHeight] = useState(340)
  const [panels, setPanels] = useState(() => getRunPanels())
  const [activeTab, setActiveTab] = useState(() => getRunPanels()[0]?.id || 'run')

  const startRun = useWorkflowStore((s) => s.startRun)
  const markNodeRunning = useWorkflowStore((s) => s.markNodeRunning)
  const markNodeDone = useWorkflowStore((s) => s.markNodeDone)
  const markNodeError = useWorkflowStore((s) => s.markNodeError)
  const endRun = useWorkflowStore((s) => s.endRun)

  const missing = inputNodes.filter((n) => n.required && !String(values[n.id] || '').trim())
  const canAutoRun = inputNodes.length > 0 && missing.length === 0

  // Keep the tab list in sync if an extension registers a panel at runtime.
  useEffect(() => onRunPanelsChange(() => setPanels(getRunPanels())), [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Auto-run ONCE on mount if every input is satisfied.
  useEffect(() => {
    if (canAutoRun && !busy && !result && !error) doRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setBusy(true); setError(null); setResult(null); setProgress([]); setExpanded({})
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
          setProgress((prev) => [...prev, { ...p, at: Date.now() }])
          if (p.type === 'start') markNodeRunning(p.nodeId)
          else if (p.type === 'done') markNodeDone(p.nodeId)
          else if (p.type === 'error') markNodeError(p.nodeId)
        },
      })
      setResult(res)
      endRun()
    } catch (err) {
      setError(err.message || String(err))
      endRun()
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
    <div className="bs-run-dock" style={{ height }}>
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
          <button className="bs-btn-ghost bs-btn-sm" onClick={doRun} disabled={busy} title="Run again">
            <PlayIcon className="bs-ico-xs" /> Run
          </button>
          <button className="bs-btn-ghost bs-btn-sm" onClick={onClose} disabled={busy} title="Close">
            <XIcon className="bs-ico-xs" />
          </button>
        </div>
      </header>

      <div className="bs-run-dock-body" role="tabpanel">
        {activePanel ? activePanel.render(ctx) : null}
      </div>
    </div>
  )
}

function collectInputNodes(workflow) {
  if (!workflow) return []
  const nodes = workflow.nodes || []
  return nodes
    .filter((n) => n.data?.blockType === 'user_input')
    .map((n) => {
      const v = workflow.subBlockValues?.[n.id] || {}
      return {
        id: n.id,
        label: v.label || n.data?.title || 'Input',
        kind: v.kind || 'short-text',
        placeholder: v.placeholder || '',
        defaultValue: v.defaultValue || '',
        required: v.required !== false,
      }
    })
}
