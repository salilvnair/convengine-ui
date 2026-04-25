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
import { executeGraph, GraphValidationError } from './graph-runner'
import { useWorkflowStore } from '../stores/workflow-store'
import { PlayIcon, MinimizeIcon } from '../components/icons'
import { getRunPanels, onRunPanelsChange, registerRunPanel } from './panel-registry'
import { getBlock } from '../blocks/registry'
import { coerceInput, collectInputNodes, validateInput } from './input-registry'
import RunPanel from './panels/run-panel'
import DebugPanel from './panels/debug-panel'
import TracePanel from './panels/trace-panel'
import ProblemsPanel from './panels/problems-panel'
import TodoPanel from './panels/todo-panel'
import ChatRunPanel from './panels/chat-panel'

// Register the core panels once. Keeps the registry populated even if no
// extension files exist.
registerRunPanel(RunPanel)
registerRunPanel(DebugPanel)
registerRunPanel(TracePanel)
registerRunPanel(ProblemsPanel)
registerRunPanel(TodoPanel)
registerRunPanel(ChatRunPanel)

const RunModal = forwardRef(function RunModal({ workflow, onClose, onOpen, activeTab: activeTabProp, onTabChange, visible = true, showToast }, ref) {
  const inputNodes = useMemo(() => collectInputNodes(workflow), [workflow])
  const [values, setValues] = useState(() =>
    Object.fromEntries(inputNodes.map((n) => [n.id, n.defaultValue]))
  )

  // Detect chat mode: starter block's startWorkflow subBlock === 'chat'
  const isChatMode = useMemo(() => {
    const starterNode = workflow?.nodes?.find((n) => n.data?.blockType === 'starter')
    if (!starterNode) return false
    const sbv = workflow?.subBlockValues?.[starterNode.id] || {}
    return sbv.startWorkflow === 'chat'
  }, [workflow])

  // Track each node's kind so we can wipe the typed value when it changes.
  const prevKindsRef = useRef({})

  // Re-sync values whenever inputNodes changes (user edits default values, adds/removes inputs).
  // If the KIND of an input changed, reset that field's value — stale typed values
  // for the old kind (e.g. a URL left over when kind was "Phone") should not persist.
  useEffect(() => {
    setValues((prev) => {
      const next = {}
      for (const n of inputNodes) {
        const prevKind = prevKindsRef.current[n.id]
        const kindChanged = prevKind !== undefined && prevKind !== n.kind
        if (!Object.prototype.hasOwnProperty.call(prev, n.id) || kindChanged) {
          next[n.id] = n.defaultValue ?? ''
        } else {
          next[n.id] = prev[n.id]
        }
        prevKindsRef.current[n.id] = n.kind
      }
      return next
    })
  }, [inputNodes])
  const [busy, setBusy] = useState(false)
  const [runAttempted, setRunAttempted] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState([])
  const progressRef = useRef([])
  const [expanded, setExpanded] = useState({})
  const [height, setHeight] = useState(340)
  const [panels, setPanels] = useState(() => getRunPanels())
  const [resizeTip, setResizeTip] = useState(false)
  const resizeDragging = useRef(false)
  const activeTab = activeTabProp || 'run'
  const setActiveTab = onTabChange || (() => {})

  const startRun = useWorkflowStore((s) => s.startRun)
  const markNodeRunning = useWorkflowStore((s) => s.markNodeRunning)
  const markNodeDone = useWorkflowStore((s) => s.markNodeDone)
  const markNodeError = useWorkflowStore((s) => s.markNodeError)
  const endRun = useWorkflowStore((s) => s.endRun)
  const extraProblems = useWorkflowStore((s) => s.extraProblems)
  const setInvalidInputNodeIds = useWorkflowStore((s) => s.setInvalidInputNodeIds)
  const shakeInvalidInputs = useWorkflowStore((s) => s.shakeInvalidInputs)

  const isExtension = typeof window !== 'undefined' && window.__BS_MODE__ === 'vscode-extension'

  const invalidInputs = useMemo(() => {
    const out = {}
    for (const n of inputNodes) {
      const msg = validateInput(n, values[n.id])
      if (msg) {
        // Capture a real JS stack trace pointing into the validation code
        const err = new Error(msg)
        out[n.id] = { message: msg, stack: err.stack }
      }
    }
    return out
  }, [inputNodes, values])
  const missing = useMemo(() => inputNodes.filter((n) => invalidInputs[n.id]), [inputNodes, invalidInputs])

  // Compute which non-seed nodes are missing required subBlock values (MCP server/tool, etc.)
  // This runs reactively so the squiggle clears as soon as the user fixes the field.
  const missingConfigNodeIds = useMemo(() => {
    const SEED_TYPES = new Set(['starter', 'user_input', 'schedule', 'webhook_request'])
    const nodes = workflow?.nodes || []
    const edges = workflow?.edges || []
    const subBlockValues = workflow?.subBlockValues || {}
    const disabledIds = new Set(nodes.filter((n) => n.data?.disabled).map((n) => n.id))
    const outgoing = {}
    for (const e of edges) {
      if (!outgoing[e.source]) outgoing[e.source] = []
      outgoing[e.source].push(e.target)
    }
    const reachable = new Set()
    const queue = nodes.filter((n) => SEED_TYPES.has(n.data?.blockType)).map((n) => n.id)
    for (const id of queue) {
      if (reachable.has(id)) continue
      reachable.add(id)
      for (const t of (outgoing[id] || [])) queue.push(t)
    }
    const result = new Set()
    for (const n of nodes) {
      if (SEED_TYPES.has(n.data?.blockType)) continue
      if (disabledIds.has(n.id)) continue
      if (!reachable.has(n.id)) continue
      const blockDef = getBlock(n.data?.blockType)
      if (!blockDef?.subBlocks?.length) continue
      const vals = subBlockValues[n.id] || {}
      for (const sub of blockDef.subBlocks) {
        if (!sub.required) continue
        if (typeof sub.required === 'object') {
          const dep = vals[sub.required.field]
          const reqVals = Array.isArray(sub.required.value) ? sub.required.value : [sub.required.value]
          if (!reqVals.includes(dep)) continue
        }
        const v = vals[sub.id]
        if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
          result.add(n.id)
        }
      }
    }
    return result
  }, [workflow])

  const runBtnRef = useRef(null)
  const prevMissingRef = useRef(missing.length)

  // Push invalid node IDs into the canvas store so the card on canvas turns orange.
  // Merges user_input validation errors with missing required-config nodes so both
  // show the squiggle animation. Clears completely when the dock is closed.
  useEffect(() => {
    if (!visible) {
      setInvalidInputNodeIds(new Set())
      return
    }
    const ids = new Set([
      ...Object.keys(invalidInputs).filter((nodeId) => !!invalidInputs[nodeId]),
      ...missingConfigNodeIds,
    ])
    setInvalidInputNodeIds(ids)
  }, [invalidInputs, missingConfigNodeIds, visible, setInvalidInputNodeIds])

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
      if (missing.length === 0) {
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
    resizeDragging.current = true
    const startY = e.clientY
    const startH = height
    function onMove(ev) {
      const d = startY - ev.clientY
      const next = Math.min(Math.max(140, startH + d), Math.round(window.innerHeight * 0.85))
      setHeight(next)
    }
    function onUp() {
      resizeDragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [height])

  async function doRun() {
    // Always mark that the user has attempted a run (enables required-field highlighting)
    setRunAttempted(true)

    // If any input field is invalid, surface the Problems tab and bail out early.
    // Also force-replay the shake animation on every Run press so the card jiggles
    // even if the same fields were already invalid (shake key must always bump).
    if (missing.length > 0) {
      shakeInvalidInputs()
      setActiveTab('problems')
      onOpen?.()
      return
    }

    // ── Pre-run required-subBlock validation (MCP server/tool, agent model, etc.) ──
    // Walk every reachable node, check its block definition for required subBlocks,
    // and shake any node whose required field is empty — same squiggle as user_input.
    {
      const SEED_TYPES = new Set(['starter', 'user_input', 'schedule', 'webhook_request'])
      const nodes = workflow?.nodes || []
      const edges = workflow?.edges || []
      const subBlockValues = workflow?.subBlockValues || {}
      const disabledIds = new Set(nodes.filter((n) => n.data?.disabled).map((n) => n.id))

      // BFS to find reachable nodes from seed types
      const outgoing = {}
      for (const e of edges) {
        if (!outgoing[e.source]) outgoing[e.source] = []
        outgoing[e.source].push(e.target)
      }
      const reachable = new Set()
      const queue = nodes.filter((n) => SEED_TYPES.has(n.data?.blockType)).map((n) => n.id)
      for (const id of queue) {
        if (reachable.has(id)) continue
        reachable.add(id)
        for (const t of (outgoing[id] || [])) queue.push(t)
      }

      const missingConfigNodeIds = new Set()
      const missingConfigDetails = [] // { nodeId, nodeTitle, blockType, fieldLabel }

      for (const n of nodes) {
        if (SEED_TYPES.has(n.data?.blockType)) continue
        if (disabledIds.has(n.id)) continue
        if (!reachable.has(n.id)) continue
        const blockDef = getBlock(n.data?.blockType)
        if (!blockDef?.subBlocks?.length) continue
        const vals = subBlockValues[n.id] || {}
        for (const sub of blockDef.subBlocks) {
          if (!sub.required) continue
          // Conditional required: only required when a dep field matches
          if (typeof sub.required === 'object') {
            const dep = vals[sub.required.field]
            const reqVals = Array.isArray(sub.required.value) ? sub.required.value : [sub.required.value]
            if (!reqVals.includes(dep)) continue
          }
          const v = vals[sub.id]
          const isEmpty = v == null || v === '' || (Array.isArray(v) && v.length === 0)
          if (isEmpty) {
            missingConfigNodeIds.add(n.id)
            missingConfigDetails.push({
              nodeId: n.id,
              nodeTitle: n.data?.title || blockDef.name || n.data?.blockType || n.id,
              blockType: n.data?.blockType,
              fieldLabel: sub.title || sub.id,
            })
          }
        }
      }

      if (missingConfigNodeIds.size > 0) {
        setInvalidInputNodeIds(missingConfigNodeIds)
        shakeInvalidInputs()
        // Build synthetic trace entries so Problems tab shows detail
        const traceEntries = missingConfigDetails.map((d) => ({
          nodeId: d.nodeId,
          blockType: d.blockType,
          title: d.nodeTitle,
          error: `"${d.nodeTitle}" is missing required field: ${d.fieldLabel}`,
          errorDetail: {
            nodeId: d.nodeId,
            nodeTitle: d.nodeTitle,
            blockType: d.blockType,
            cause: `The "${d.fieldLabel}" field is required but has not been configured.`,
            hint: `Select or enter a value for "${d.fieldLabel}" in the "${d.nodeTitle}" block before running.`,
          },
        }))
        setResult({ output: null, trace: traceEntries })
        setError(`${missingConfigNodeIds.size} block${missingConfigNodeIds.size > 1 ? 's are' : ' is'} missing required configuration`)
        setActiveTab('problems')
        onOpen?.()
        return
      }
    }

    // All inputs valid — close dock and execute
    if (inputNodes.length > 0) onClose()
    setBusy(true); setError(null); setResult(null); setProgress([]); progressRef.current = []; setExpanded({})
    setActiveTab('run')
    startRun()
    try {
      const runtimeInputs = {}
      for (const n of inputNodes) {
        runtimeInputs[n.id] = coerceInput(n, values[n.id])
      }

      const res = await executeGraph({
        workflow,
        inputs: runtimeInputs,
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
      // ── GraphValidationError: mark affected nodes and build rich trace ──
      if (err instanceof GraphValidationError) {
        // Mark the primary offending node as errored on the canvas
        if (err.nodeId) markNodeError(err.nodeId)
        // Also mark any additional affected nodes
        for (const affected of (err.affectedNodes || [])) {
          if (affected.id && affected.id !== err.nodeId) markNodeError(affected.id)
        }
        const traceEntries = (err.affectedNodes?.length > 0 ? err.affectedNodes : [{ id: err.nodeId, title: err.nodeTitle, blockType: err.blockType }])
          .map((nd) => ({
            nodeId: nd.id,
            blockType: nd.blockType,
            title: nd.title,
            error: `"${nd.title}" has no input connection`,
            errorDetail: {
              ...err.errorDetail,
              nodeId: nd.id,
              nodeTitle: nd.title,
              blockType: nd.blockType,
              hint: err.hint,
            },
          }))
        setResult({ output: null, trace: traceEntries })
        setError(err.message)
        endRun()
        showToast?.('Validation failed', 'error')
        setActiveTab('problems')
        onOpen?.()
        setBusy(false)
        return
      }

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

  // ── Chat mode: run the graph with the user's message as the starter output ──
  async function onChatSend({ message, history }) {
    setBusy(true); setError(null)
    startRun()
    try {
      const res = await executeGraph({
        workflow,
        inputs: {
          __chat__: { message, history },
          // Also thread any user_input default values
          ...Object.fromEntries(inputNodes.map((n) => [n.id, coerceInput(n, values[n.id])])),
        },
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
      return res
    } catch (err) {
      setError(err.message || String(err))
      endRun()
      showToast?.('Workflow failed', 'error')
      setActiveTab('problems')
      onOpen?.()
      throw err
    } finally {
      setBusy(false)
    }
  }

  const ctx = {
    workflow, values, setValues, inputNodes, missing,
    invalidInputs, runAttempted, busy, error, result, progress, expanded, setExpanded,
    onRun: doRun,
    extraProblems,
    isChatMode,
    onChatSend,
  }
  const activePanel = panels.find((p) => p.id === activeTab) || panels[0]
  // Panels that should be visible given the current ctx (chat mode, etc.)
  const visiblePanels = useMemo(
    () => panels.filter((p) => typeof p.isVisible === 'function' ? p.isVisible(ctx) : true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, isChatMode]
  )
  // When chat mode changes, auto-switch to the 'chat' tab (or 'run' tab)
  useEffect(() => {
    if (isChatMode) setActiveTab('chat')
    else setActiveTab('run')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatMode])

  return (
    <div className="bs-run-dock" style={{ height, display: visible ? undefined : 'none' }}>
      <div
        className="bs-run-dock-resize"
        onPointerDown={onResizePointerDown}
        onMouseEnter={() => setResizeTip(true)}
        onMouseLeave={() => setResizeTip(false)}
      >
        <div
          className="bs-run-dock-resize-grip"
          onClick={(e) => { e.stopPropagation(); if (!resizeDragging.current) onClose() }}
        />
        {resizeTip && !resizeDragging.current && (
          <div className="bs-run-dock-resize-tip">
            <div>Click to collapse <kbd>{isExtension ? '⌥.' : '⌘.'}</kbd></div>
            <div>Drag to resize</div>
          </div>
        )}
      </div>

      <header className="bs-run-dock-head">
        <div className="bs-run-dock-tabs" role="tablist">
          {visiblePanels.map((p) => {
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
          {!isChatMode && (
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
