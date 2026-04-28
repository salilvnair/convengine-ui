/**
 * Custom ReactFlow node — self-describing card with full lifecycle controls.
 *
 * Interactions:
 *   - click         → select (drives Inspector)
 *   - double-click  → inline-rename the card title
 *   - hover         → reveals a "×" delete button in the header
 *   - right-click   → ContextMenu (Open, Rename, Duplicate, Disconnect, Copy ID, Delete)
 *
 * Inline editors on the card body:
 *   - `switch`                → iOS-style toggle
 *   - `dropdown`/`combobox`   → compact <select>
 *   - anything else           → read-only value preview
 *
 * Renders a colored icon square + title + type badge in the header, then
 * each subBlock as a label→value row. Handles are centered on the sides
 * (left = target, right = source).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position } from 'reactflow'
import { useWorkflowStore } from '../stores/workflow-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useMcpStore } from '../mcp/mcp-store'
import { useLlmConfigStore } from '../stores/llm-config-store'
import { getBlock } from '../blocks/registry'
import { getTypeColor, getCardPorts, getAllPortTypes, isTypeCompatible } from '../panel/io-registry'
import { useTabsStore, skillTabId } from '../stores/tabs-store'
import ContextMenu from '../sidenav/ContextMenu'
import ConfirmModal from '../components/ConfirmModal'
import InspectModal from '../components/InspectModal'
import JsonView from '../run/JsonView'
import {
  TrashIcon,
  LinkIcon,
  PlusIcon,
  XIcon,
} from '../components/icons'

/**
 * subBlock types we render as dedicated inline widgets on the card.
 *
 * Design rule (Notion-style): inputs look like text until focused, then
 * reveal their chrome. For structural types (arrays / tables / code) we show
 * a compact read-only summary chip and rely on the Inspector for editing.
 * Anything not listed here falls through to `formatPreview`.
 */
/** Types that edit in place — pointer events must NOT bubble to the card
 *  (otherwise a click selects the node and steals focus mid-typing). */
const INLINE_INTERACTIVE = new Set([
  'switch', 'dropdown', 'combobox',
  'short-input', 'long-input', 'text', 'eval-input',
  'slider',
  'mcp-server-selector', 'mcp-tool-selector', 'mcp-dynamic-args',
])
/** Types that render as a read-only summary chip. Clicking bubbles up so the
 *  node gets selected and the Inspector surfaces the full editor. */
const INLINE_SUMMARY = new Set([
  'checkbox-list', 'grouped-checkbox-list',
  'table',
  'tool-input', 'skill-input',
  'skill-picker',
])
const INLINE_EDITABLE = new Set([...INLINE_INTERACTIVE, ...INLINE_SUMMARY])

/**
 * Evaluate condition object: {field, value, not?, and?}.
 * Used to hide conditional subBlock rows on the card when their
 * condition isn't met (mirrors Inspector's conditionPasses).
 */
function conditionPasses(condition, vals) {
  if (!condition) return true
  const cond = typeof condition === 'function' ? (() => { try { return condition(vals) } catch { return null } })() : condition
  if (!cond) return true
  const current = vals?.[cond.field]
  const expected = cond.value
  const matches = Array.isArray(expected)
    ? expected.map((v) => String(v)).includes(String(current ?? ''))
    : String(expected ?? '') === String(current ?? '')
  const primary = cond.not ? !matches : matches
  if (!primary) return false
  if (cond.and) return conditionPasses(cond.and, vals)
  return true
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Audio Recorder — inline UI on the audio_input card                         */
/* ─────────────────────────────────────────────────────────────────────────── */

function AudioRecorderInline({ nodeId, values, setSubBlockValue }) {
  const [recording, setRecording] = useState(false)
  const [timer, setTimer] = useState('00:00')
  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const startTimeRef = useRef(0)

  const hasAudio = !!values?._audioB64

  useEffect(() => () => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(animRef.current)
    if (mrRef.current?.state === 'recording') mrRef.current.stop()
  }, [])

  /* ── Waveform visualiser (mirrors whisper-mcp demo) ─────────────────── */
  useEffect(() => {
    if (!recording) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    drawWaveform()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  function drawWaveform() {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    const ctx = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(data)
    ctx.clearRect(0, 0, W, H)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ef4444'
    ctx.beginPath()
    const step = W / data.length
    for (let i = 0; i < data.length; i++) {
      const y = (data[i] / 128.0) * (H / 2)
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * step, y)
    }
    ctx.stroke()
    animRef.current = requestAnimationFrame(drawWaveform)
  }

  function stopWaveform() {
    cancelAnimationFrame(animRef.current)
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      // Analyser for waveform
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser
      const src = audioCtx.createMediaStreamSource(stream)
      src.connect(analyser)
      mrRef.current = new MediaRecorder(stream)
      chunksRef.current = []
      mrRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mrRef.current.start(100)
      setRecording(true)
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setTimer(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
      }, 200)
    } catch (err) {
      console.error('Microphone access denied', err)
    }
  }

  async function stopRecording() {
    const mr = mrRef.current
    if (!mr || mr.state !== 'recording') return
    mr.stop()
    mr.stream.getTracks().forEach((t) => t.stop())
    clearInterval(timerRef.current)
    stopWaveform()
    setRecording(false)
    setTimer('00:00')
    analyserRef.current = null
    await new Promise((r) => { mr.onstop = r })
    const mimeType = mr.mimeType || 'audio/webm'
    // Normalise like the whisper-mcp UI demo:
    // "audio/webm;codecs=opus" → "webm", "audio/ogg" → "ogg"
    let fmt = 'webm'
    if (mimeType.includes('ogg')) fmt = 'ogg'
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) fmt = 'mp4'
    if (mimeType.includes('wav')) fmt = 'wav'
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) fmt = 'mp3'
    if (mimeType.includes('flac')) fmt = 'flac'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    const durationMs = Date.now() - startTimeRef.current
    const buf = await blob.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    bytes.forEach((b) => { binary += String.fromCharCode(b) })
    const b64 = btoa(binary)
    setSubBlockValue(nodeId, '_audioB64', b64)
    setSubBlockValue(nodeId, '_audioFormat', fmt)
    setSubBlockValue(nodeId, '_audioDurationMs', durationMs)
    try { await audioCtxRef.current?.close() } catch { /* ignore */ }
  }

  const stop = {
    onClick: (e) => e.stopPropagation(),
    onMouseDown: (e) => e.stopPropagation(),
    onPointerDown: (e) => e.stopPropagation(),
  }

  return (
    <div className="bs-node-audio-wrap" {...stop}>
      {hasAudio ? (
        <div className="bs-node-audio-done">
          <span className="bs-node-audio-dot" />
          <span className="bs-node-audio-info">
            Recorded · {values._audioFormat || 'webm'} · {Math.round((values._audioDurationMs || 0) / 100) / 10}s
          </span>
          <button
            className="bs-node-audio-rerecord"
            {...stop}
            onClick={(e) => { e.stopPropagation(); setSubBlockValue(nodeId, '_audioB64', '') }}
            title="Discard and re-record"
          >
            Re-record
          </button>
        </div>
      ) : recording ? (
        <div className="bs-node-audio-recording-wrap">
          <div className="bs-node-audio-recording-row">
            <button className="bs-node-audio-stop" onClick={(e) => { e.stopPropagation(); stopRecording() }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
            <span className="bs-node-audio-timer">{timer}</span>
            <span className="bs-node-audio-pulse" />
          </div>
          <canvas ref={canvasRef} className="bs-node-audio-waveform" />
        </div>
      ) : (
        <button className="bs-node-audio-record" onClick={(e) => { e.stopPropagation(); startRecording() }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <span>Record Audio</span>
        </button>
      )}
    </div>
  )
}

function WorkflowNode({ id, data, selected }) {
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode)
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes)
  const disconnectNode = useWorkflowStore((s) => s.disconnectNode)
  const renameNode = useWorkflowStore((s) => s.renameNode)
  const setSubBlockValue = useWorkflowStore((s) => s.setSubBlockValue)
  const toggleDisabled = useWorkflowStore((s) => s.toggleDisabled)
  const renamingNodeId = useWorkflowStore((s) => s.renamingNodeId)
  const endRename = useWorkflowStore((s) => s.endRename)
  const values = useWorkflowStore((s) => s.subBlockValues[id])
  const activeNodeId = useWorkflowStore((s) => s.activeNodeId)
  const completedNodeIds = useWorkflowStore((s) => s.completedNodeIds)
  const errorNodeIds = useWorkflowStore((s) => s.errorNodeIds)
  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds)
  const isInMultiSelect = selectedNodeIds.length > 1 && selectedNodeIds.includes(id)
  const errorShakeKey = useWorkflowStore((s) => s.errorShakeKey)
  const invalidInputNodeIds = useWorkflowStore((s) => s.invalidInputNodeIds)
  const invalidInputShakeKey = useWorkflowStore((s) => s.invalidInputShakeKey)
  const lastOutput = useWorkflowStore((s) => s.lastOutputs?.[id])
  const resizeNodeStore = useWorkflowStore((s) => s.resizeNode)
  const fitNodeStore = useWorkflowStore((s) => s.fitNode)
  // Subscribe to active LLM provider so model comboboxes on card re-render when provider changes
  useLlmConfigStore((s) => s.activeProvider)
  // Check if this non-seed, non-disabled node has no incoming edges
  const SEED_TYPES = new Set(['starter', 'user_input'])
  const hasNoIncoming = useWorkflowStore((s) => {
    if (SEED_TYPES.has(data.blockType) || data.disabled) return false
    return !s.edges.some((e) => e.target === id)
  })
  const isActive = activeNodeId === id
  const isDone = completedNodeIds.includes(id)
  const isError = errorNodeIds?.has?.(id) ?? false
  const isDisabled = !!data.disabled
  // Disabled nodes are never flagged for missing config — they're bypassed at runtime
  const isInvalidInput = !isDisabled && (invalidInputNodeIds?.has?.(id) ?? false)
  const isUnconnected = hasNoIncoming
  const cfg = getBlock(data.blockType)
  const Icon = data.icon || cfg?.icon

  // --- Dimensions: per-node persisted > block default > CSS default ---
  const DEFAULT_W = cfg?.defaultWidth || 280
  const MIN_W = 200
  const MIN_H = 80
  const nodeRef = useRef(null)

  // Height is ALWAYS auto (fit-content) unless the user explicitly resized
  // via the resize handles. We track this with data.userResized so a plain
  // page refresh never locks in a stale saved height.
  //
  // nodeW/nodeH are local overrides that the resize handler writes. We seed
  // them from data on mount, then the resize handler owns them until the node
  // is externally updated (undo / load). We detect that via a ref-based
  // comparison so we never call setState inside an effect.
  const [nodeW, setNodeW] = useState(() => data.width || DEFAULT_W)
  const [nodeH, setNodeH] = useState(() => data.userResized ? (data.height || undefined) : undefined)
  const [resizing, setResizing] = useState(false)
  const [resizeMode, setResizeMode] = useState(false) // right-click → Resize toggles this

  // Sync dimensions when the node's data changes externally (undo / load).
  // Using refs to track previous values avoids setState-in-effect.
  const prevDataW = useRef(data.width)
  const prevDataH = useRef(data.height)
  const prevUserResized = useRef(data.userResized)
  if (prevDataW.current !== data.width) {
    prevDataW.current = data.width
    if (data.width) setNodeW(data.width)
  }
  if (prevUserResized.current !== data.userResized || prevDataH.current !== data.height) {
    prevUserResized.current = data.userResized
    prevDataH.current = data.height
    if (data.userResized && data.height) setNodeH(data.height)
    else if (!data.userResized) setNodeH(undefined)
  }

  /**
   * Generic resize handler. `edges` indicates which edges are being dragged:
   * any combo of 'n', 's', 'e', 'w'.
   */
  const onResizeStart = useCallback((e, edges) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    const startX = e.clientX
    const startY = e.clientY
    const startW = nodeW || DEFAULT_W
    const startH = nodeH || 200
    // Measure the node's natural content height as the floor
    const contentH = nodeRef.current ? nodeRef.current.scrollHeight : MIN_H
    const minH = Math.max(MIN_H, contentH)

    function onMove(ev) {
      ev.preventDefault()
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let w = startW
      let h = startH
      if (edges.includes('e')) w = Math.max(MIN_W, startW + dx)
      if (edges.includes('w')) w = Math.max(MIN_W, startW - dx)
      if (edges.includes('s')) h = Math.max(minH, startH + dy)
      if (edges.includes('n')) h = Math.max(minH, startH - dy)
      setNodeW(w)
      setNodeH(h)
    }

    function onUp() {
      setResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      // Persist to store
      setNodeW((w) => { setNodeH((h) => { resizeNodeStore(id, w, h); return h }); return w })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [nodeW, nodeH, id, resizeNodeStore, DEFAULT_W])

  /**
   * Output handles — for most blocks this is a single centered pin on the
   * right. Branching blocks declare `outputHandles: [...]` (strings) or
   * `outputHandlesFromValues(values)` (a function for dynamic counts, used
   * by if-elseif-else and switch with variable N).
   */
  const outputHandles = useMemo(() => {
    if (!cfg) return ['out']
    if (typeof cfg.outputHandlesFromValues === 'function') {
      try { return cfg.outputHandlesFromValues(values || {}) || ['out'] } catch { return ['out'] }
    }
    if (Array.isArray(cfg.outputHandles) && cfg.outputHandles.length > 0) return cfg.outputHandles
    return ['out']
  }, [cfg, values])

  const [menu, setMenu] = useState(null)       // { x, y } in screen coords
  const [editing, setEditing] = useState(false) // inline-rename
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [inspectOpen, setInspectOpen] = useState(false)
  const traceEntry = useWorkflowStore((s) => s.lastNodeTrace?.[id])

  // Listen for keyboard-driven inspect (⌘I from Canvas)
  useEffect(() => {
    function onInspect(e) {
      if (e.detail?.nodeId === id && traceEntry) setInspectOpen(true)
    }
    window.addEventListener('bs:inspect-node', onInspect)
    return () => window.removeEventListener('bs:inspect-node', onInspect)
  }, [id, traceEntry])

  // Replay the shake animation each time this node is marked as errored.
  // React may batch the class removal+addition so the browser never sees a
  // transition; instead we directly manipulate the element's animation via
  // the ref: reset to none, force a reflow, then restore.
  useEffect(() => {
    if (!isError || !nodeRef.current) return
    const el = nodeRef.current
    el.style.animation = 'none'
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth // trigger reflow
    el.style.animation = ''
  }, [isError, errorShakeKey])

  // Replay the squiggle animation when invalid-input state changes.
  useEffect(() => {
    if (!isInvalidInput || !nodeRef.current) return
    const el = nodeRef.current
    el.style.animation = 'none'
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth // trigger reflow
    el.style.animation = ''
  }, [isInvalidInput, invalidInputShakeKey])

  // ─── Connection-drag type compatibility (ComfyUI-style glow/dim) ──────
  const [connectDrag, setConnectDrag] = useState(null) // { handleType, portType } | null
  useEffect(() => {
    function onDrag(e) {
      const d = e.detail
      if (!d.dragging) { setConnectDrag(null); return }
      // Skip the node we're dragging from
      if (d.nodeId === id) { setConnectDrag(null); return }
      setConnectDrag({ handleType: d.handleType, portType: d.portType })
    }
    window.addEventListener('bs:connect-drag', onDrag)
    return () => window.removeEventListener('bs:connect-drag', onDrag)
  }, [id])

  const requestDelete = () => setConfirmDelete(true)

  // Keyboard-driven rename (F2/Enter on the canvas) flips us into edit mode.
  useLayoutEffect(() => {
    if (renamingNodeId === id) setEditing(true)
  }, [renamingNodeId, id])

  // Exit resize mode when node is deselected
  useLayoutEffect(() => {
    if (!selected) setResizeMode(false)
  }, [selected])

  // Auto-fit height when visible content changes (e.g. conditional sub-blocks hide/show)
  // Only resets when the node has no user-set height (i.e. nodeH is undefined)
  const visibleSubBlockCount = useMemo(() => {
    if (!cfg) return 0
    return (cfg.subBlocks || []).filter(
      (sb) => !sb.hidden && sb.type !== 'oauth-input' && sb.mode !== 'advanced' && conditionPasses(sb.condition, values)
    ).length
  }, [cfg, values])

  // When visible rows change and the node has a stored height, clear it so it auto-fits
  const prevRowCount = useRef(visibleSubBlockCount)
  useLayoutEffect(() => {
    if (prevRowCount.current !== visibleSubBlockCount && nodeH != null) {
      setNodeH(undefined)
      resizeNodeStore(id, nodeW, undefined)
    }
    prevRowCount.current = visibleSubBlockCount
  }, [visibleSubBlockCount])

  const isContainer = data.blockType === 'loop' || data.blockType === 'parallel'
  const isTrigger = data.category === 'triggers' || cfg?.category === 'triggers'

  const previewRows = useMemo(() => {
    if (!cfg) return []
    return (cfg.subBlocks || [])
      .filter((sb) => !sb.hidden && sb.type !== 'oauth-input' && sb.mode !== 'advanced' && conditionPasses(sb.condition, values))
      .slice(0, 8)
      .map((sb) => ({
        sb,
        id: sb.id,
        label: sb.title || sb.id,
        value: values?.[sb.id] ?? sb.defaultValue,
      }))
  }, [cfg, values])

  function openMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    // Close any other open context menu first (global event)
    window.dispatchEvent(new Event('bs:close-context-menus'))
    setMenu({ x: e.clientX, y: e.clientY })
  }

  function copyId() {
    try { navigator.clipboard?.writeText(id) } catch { /* ignore */ }
  }

  function finishRename() {
    setEditing(false)
    if (renamingNodeId === id) endRename()
  }

  // Stops clicks inside an inline control from bubbling to the node's
  // onClick (which would select the node and potentially steal focus).
  const stopPointer = {
    onClick: (e) => e.stopPropagation(),
    onMouseDown: (e) => e.stopPropagation(),
    onPointerDown: (e) => e.stopPropagation(),
  }

  // Cards with json-preview subBlocks should auto-grow to fit content,
  // so use minHeight instead of fixed height for them.
  const hasJsonPreview = useMemo(
    () => cfg?.subBlocks?.some((sb) => sb.type === 'json-preview'),
    [cfg]
  )

  // ─── Typed port strips (ComfyUI-style) — registry-driven ────────────────
  const hiddenPorts = values?._hiddenPorts || {}
  const portTypes = values?._portTypes || {}
  const { inputPorts, outputPorts } = useMemo(() => {
    if (!cfg) return { inputPorts: [], outputPorts: [] }
    const card = getCardPorts(cfg.type, cfg.inputs, cfg.outputs)
    // For multi-output branching blocks, skip typed outputs
    const outs = outputHandles.length > 1 ? [] : (card.outputs || [])
    return {
      inputPorts: (card.inputs || []).filter((p) => !hiddenPorts[`in_${p.key}`]).map((p) => {
        const t = portTypes[`in_${p.key}`] || p.type
        return { ...p, type: t, color: getTypeColor(t) }
      }),
      outputPorts: outs.filter((p) => !hiddenPorts[`out_${p.key}`]).map((p) => {
        const t = portTypes[`out_${p.key}`] || p.type
        return { ...p, type: t, color: getTypeColor(t) }
      }),
    }
  }, [cfg, outputHandles, hiddenPorts, portTypes])

  return (
    <>
      <div
        ref={nodeRef}
        className={[
          'bs-node',
          selected ? 'bs-node-selected' : '',
          isContainer ? 'bs-node-container' : '',
          isActive ? 'bs-node-running' : '',
          isDone ? 'bs-node-done' : '',
          isError ? 'bs-node-error' : '',
          isInvalidInput && !isError ? 'bs-node-invalid-input' : '',
          isDisabled ? 'bs-node-disabled' : '',
          isUnconnected ? 'bs-node-unconnected' : '',
          outputHandles.length > 1 ? 'bs-node-multi-out' : '',
          resizing ? 'bs-node-resizing' : '',
          resizeMode ? 'bs-node-resize-mode' : '',
        ].filter(Boolean).join(' ')}
        style={{
          width: nodeW || undefined,
          // Height: auto (fit-content) unless the user explicitly resized
          ...(nodeH
            ? (hasJsonPreview
                ? { minHeight: nodeH, height: 'auto' }
                : { height: nodeH, minHeight: 'fit-content' })
            : { height: 'auto', minHeight: 'fit-content' }),
        }}
        onContextMenu={openMenu}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      >
        {/* Resize handles — only visible when resize mode is active */}
        {resizeMode && (
          <>
            <div className="bs-resize bs-resize-n" onPointerDown={(e) => onResizeStart(e, 'n')} />
            <div className="bs-resize bs-resize-s" onPointerDown={(e) => onResizeStart(e, 's')} />
            <div className="bs-resize bs-resize-e" onPointerDown={(e) => onResizeStart(e, 'e')} />
            <div className="bs-resize bs-resize-w" onPointerDown={(e) => onResizeStart(e, 'w')} />
            <div className="bs-resize bs-resize-nw" onPointerDown={(e) => onResizeStart(e, 'nw')} />
            <div className="bs-resize bs-resize-ne" onPointerDown={(e) => onResizeStart(e, 'ne')} />
            <div className="bs-resize bs-resize-sw" onPointerDown={(e) => onResizeStart(e, 'sw')} />
            <div className="bs-resize bs-resize-se" onPointerDown={(e) => onResizeStart(e, 'se')} />
          </>
        )}

        {/* ── Disabled overlay (ComfyUI-style full-card, toggled via ⌘B) ── */}
        {isDisabled && (
          <div className="bs-node-disabled-overlay">
            <div className="bs-node-disabled-banner">
              {/* Broken-link icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                <line x1="2" y1="2" x2="22" y2="22"/>
              </svg>
              <span>Disabled in workflow</span>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="bs-node-header">
          <div className="bs-node-icon-well" style={{ background: cfg?.bgColor || data.bgColor }}>
            {Icon ? <Icon className="bs-node-icon" /> : null}
          </div>

          {editing ? (
            <input
              autoFocus
              className="bs-inline-edit bs-node-rename"
              defaultValue={data.title}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== data.title) renameNode(id, v)
                finishRename()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') finishRename()
              }}
            />
          ) : (
            <div className="bs-node-title" title={data.title}>{data.title}</div>
          )}

          <span className="bs-node-badge">{data.blockType}</span>

          <button
            className="bs-node-close"
            title="Delete block"
            onClick={(e) => { e.stopPropagation(); requestDelete() }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <XIcon className="bs-ico-xs" />
          </button>
        </div>

        {/* Unconnected warning banner */}
        {isUnconnected && (
          <div className="bs-node-unconnected-banner" title="This block has no incoming connections and won't receive any data during execution. Connect an edge from another block's output to this block's input.">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>No incoming connection</span>
          </div>
        )}

        {/* ── Input port strip (ComfyUI-style) ── */}
        {inputPorts.length > 0 && (
          <div className="bs-port-strip bs-port-strip-in">
            {inputPorts.map((p) => {
              const compat = connectDrag && connectDrag.handleType === 'source'
                ? isTypeCompatible(connectDrag.portType, p.type) : null
              return (
                <div key={p.key} className={`bs-port-row bs-port-row-in ${compat === false ? 'bs-port-incompatible' : ''} ${compat === true ? 'bs-port-compatible' : ''}`}>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`in_${p.key}`}
                    className="bs-port-handle bs-port-handle-in"
                    style={{ background: p.color.solid }}
                  />
                  <span className="bs-port-dot" style={{ background: p.color.solid }} />
                  <span className="bs-port-name">{p.key}</span>
                  <PortTypeBadge type={p.type} color={p.color} portId={`in_${p.key}`} nodeId={id} />
                </div>
              )
            })}
          </div>
        )}

        {/* Fallback: single input handle for blocks with no typed inputs */}
        {inputPorts.length === 0 && !isTrigger && (
          <Handle type="target" position={Position.Left} className="bs-handle" id="in" />
        )}

        {/* ── Body rows ── */}
        {previewRows.length > 0 && (
          <div className="bs-node-body">
            {previewRows.map((row) => {
              if (row.sb.type === 'json-preview') {
                let previewValue = lastOutput
                // Only treat as JSON if it IS an object/array — strings stay strings.
                const isJsonOutput = lastOutput !== null && lastOutput !== undefined && typeof lastOutput === 'object'
                return (
                  <div key={row.id} className="bs-node-jsonpreview" onClick={(e) => { e.stopPropagation(); selectNode(id) }}>
                    <div className="bs-node-jsonpreview-head">{row.label}</div>
                    <div className="bs-node-jsonpreview-body">
                      {lastOutput == null
                        ? <span className="bs-node-jsonpreview-empty">No run yet.</span>
                        : isJsonOutput
                          ? <JsonView value={previewValue} collapsible defaultExpanded={2} />
                          : <pre className="bs-node-jsonpreview-text">{String(previewValue)}</pre>}
                    </div>
                  </div>
                )
              }
              const editable = INLINE_EDITABLE.has(row.sb.type)
              const interactive = INLINE_INTERACTIVE.has(row.sb.type)
              const pin = fieldPinColor(row.sb)
              return (
                <div key={row.id} className="bs-node-row">
                  <span
                    className={`bs-node-row-pin bs-node-row-pin-${pin}`}
                    title={`${row.sb.type || 'field'}`}
                    aria-hidden="true"
                  />
                  <span className="bs-node-row-label">{row.label}</span>
                  {editable ? (
                    <span
                      className="bs-node-row-edit"
                      {...(interactive ? stopPointer : {})}
                    >
                      {renderInlineEditor(row.sb, row.value, (v) => {
                        setSubBlockValue(id, row.id, v)
                        if (data.blockType === 'user_input' && row.id === 'kind') {
                          setSubBlockValue(id, 'defaultValue', '')
                        }
                        // When MCP server is cleared, also clear the tool selection.
                        if (row.sb.type === 'mcp-server-selector' && !v) {
                          setSubBlockValue(id, 'tool', '')
                        }
                      }, { values })}
                    </span>
                  ) : (
                    <span className="bs-node-row-value">{formatPreview(row.value)}</span>
                  )}
                </div>
              )
            })}
            {/* Extra "Value" row for user_input — shows defaultValue inline after Label */}
            {data.blockType === 'user_input' && (
              <div className="bs-node-row bs-ui-node-value-row" {...stopPointer}>
                <span className="bs-node-row-pin bs-node-row-pin-green" aria-hidden="true" />
                <span className="bs-node-row-label">Value</span>
                <span className="bs-node-row-edit">
                  {values?.kind === 'json' ? (
                    <span className="bs-node-json-badge" title="Edit JSON in the Inspector panel">
                      {(values?.defaultValue && values.defaultValue !== '{}')
                        ? String(values.defaultValue).slice(0, 20) + (String(values.defaultValue).length > 20 ? '…' : '')
                        : '{ … }'}
                    </span>
                  ) : (
                    <InlineInput
                      type={(values?.kind === 'password') ? 'password' : 'text'}
                      value={values?.defaultValue ?? ''}
                      placeholder={`Enter ${(values?.label || 'value').toLowerCase()}…`}
                      onChange={(v) => setSubBlockValue(id, 'defaultValue', v)}
                    />
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Audio Input recorder inline on card ── */}
        {data.blockType === 'audio_input' && !isDisabled && (
          <AudioRecorderInline nodeId={id} values={values} setSubBlockValue={setSubBlockValue} />
        )}

        {/* ── Output port strip (ComfyUI-style) — single-output blocks ── */}
        {outputPorts.length > 0 && (
          <div className="bs-port-strip bs-port-strip-out">
            {outputPorts.map((p) => {
              const compat = connectDrag && connectDrag.handleType === 'target'
                ? isTypeCompatible(p.type, connectDrag.portType) : null
              return (
                <div key={p.key} className={`bs-port-row bs-port-row-out ${compat === false ? 'bs-port-incompatible' : ''} ${compat === true ? 'bs-port-compatible' : ''}`}>
                  <PortTypeBadge type={p.type} color={p.color} portId={`out_${p.key}`} nodeId={id} />
                  <span className="bs-port-name">{p.key}</span>
                  <span className="bs-port-dot" style={{ background: p.color.solid }} />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={p.key}
                    className="bs-port-handle bs-port-handle-out"
                    style={{ background: p.color.solid }}
                  />

                </div>
              )
            })}
          </div>
        )}

        {/* Fallback: single output handle for blocks with no typed outputs */}
        {outputPorts.length === 0 && outputHandles.length === 1 && (
          <Handle type="source" position={Position.Right} className="bs-handle" id={outputHandles[0]} />
        )}



        {/* ── Multi-output branching handles (if_else, switch, etc.) ── */}
        {outputHandles.length > 1 && (
          <div className="bs-port-strip bs-port-strip-out bs-port-strip-branch">
            {outputHandles.map((h) => (
              <div key={h} className="bs-port-row bs-port-row-out">
                <span className={`bs-port-branch-label bs-port-branch-${safeHandleColor(h)}`}>{h}</span>
                <span className={`bs-port-dot bs-port-dot-${safeHandleColor(h)}`} />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={h}
                  className={`bs-port-handle bs-port-handle-out bs-port-handle-${safeHandleColor(h)}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(isInMultiSelect ? [
              { id: 'multi-header', label: `${selectedNodeIds.length} nodes selected`, disabled: true },
              { id: 'multi-dup', label: `Duplicate ${selectedNodeIds.length} nodes`, icon: CtxDuplicateIcon, iconColor: '#22d3ee', shortcut: '⌘D', onSelect: () => duplicateNodes(selectedNodeIds) },
              { id: 'multi-del', label: `Delete ${selectedNodeIds.length} nodes`, icon: TrashIcon, danger: true, shortcut: '⌫', onSelect: () => window.dispatchEvent(new CustomEvent('bs:multi-delete', { detail: { ids: selectedNodeIds } })) },
              { separator: true },
            ] : []),
            { id: 'open', label: 'Open in Inspector', icon: CtxInspectorIcon, iconColor: '#818cf8', onSelect: () => selectNode(id) },
            { id: 'rename', label: 'Rename', icon: CtxRenameIcon, iconColor: '#fbbf24', shortcut: 'F2', onSelect: () => setEditing(true) },
            { id: 'dup', label: 'Duplicate', icon: CtxDuplicateIcon, iconColor: '#22d3ee', shortcut: '⌘D', onSelect: () => duplicateNode(id) },
            { id: 'inspect', label: 'Inspect', icon: CtxInspectIcon, iconColor: '#22d3ee', shortcut: '⌘I', disabled: !traceEntry, onSelect: () => setInspectOpen(true) },
            { id: 'resize', label: resizeMode ? 'Lock Size' : 'Resize', icon: CtxResizeIcon, iconColor: '#a78bfa', onSelect: () => setResizeMode((v) => !v) },
            { id: 'fit', label: 'Fit to Content', icon: CtxResizeIcon, iconColor: '#a78bfa', disabled: !nodeH, onSelect: () => { setNodeH(undefined); fitNodeStore(id) } },
            { separator: true },
            { id: 'disable', label: isDisabled ? 'Enable' : 'Disable', icon: isDisabled ? CtxEnableIcon : CtxDisableIcon, iconColor: isDisabled ? '#22c55e' : '#a855f6', shortcut: '⌥B', onSelect: () => toggleDisabled(id) },
            { id: 'disc', label: 'Disconnect All Edges', icon: CtxDisconnectIcon, iconColor: '#f87171', onSelect: () => disconnectNode(id) },
            { id: 'copy', label: 'Copy Node ID', icon: CtxCopyIcon, iconColor: '#94a3b8', shortcut: '⌘C', onSelect: copyId },
            { separator: true },
            { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, shortcut: '⌫', onSelect: requestDelete },
          ]}
        />
      )}

      {inspectOpen && createPortal(
        <InspectModal
          nodeId={id}
          nodeData={data}
          traceEntry={traceEntry}
          onClose={() => setInspectOpen(false)}
        />,
        document.body
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete block?"
          message={`"${data.title || data.blockType}" and all its connections will be removed. This cannot be undone.`}
          confirmLabel="Delete block"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); removeNode(id) }}
        />
      )}
    </>
  )
}

/** Inline MCP server dropdown — reads live server list from the MCP store. */
function McpServerNodeSelect({ value, onChange, placeholder }) {
  const servers = useMcpStore((s) => s.servers)
  const loading = useMcpStore((s) => s.loading)
  const ensureLoaded = useMcpStore((s) => s.ensureLoaded)

  useEffect(() => { ensureLoaded() }, [ensureLoaded])

  const serverOptions = servers.map((s) => ({ id: s.id, label: s.name || s.id }))
  // Only prepend the clear option when there are actual servers to show — avoids
  // a "clear-only" menu appearing when the store hasn't loaded yet.
  const options = (value && serverOptions.length > 0)
    ? [{ id: '', label: '— Clear selection —', isClear: true }, ...serverOptions]
    : serverOptions
  return (
    <NodeDropdown
      value={value ?? ''}
      options={options}
      onChange={onChange}
      placeholder={loading ? 'Loading…' : (placeholder || 'Select server…')}
    />
  )
}

/** Inline MCP tool dropdown — filters tools by the currently selected server. */
function McpToolNodeSelect({ value, onChange, placeholder, serverId }) {
  const toolsByServer = useMcpStore((s) => s.toolsByServer)
  const loadTools = useMcpStore((s) => s.loadTools)

  useEffect(() => {
    if (!serverId) return
    if (!toolsByServer[serverId]) loadTools(serverId)
  }, [serverId, toolsByServer, loadTools])

  const tools = (serverId && toolsByServer[serverId]) || []
  const toolOptions = tools.map((t) => ({ id: t.name, label: t.name }))
  // Only prepend clear option when tools are actually loaded.
  const options = (value && toolOptions.length > 0)
    ? [{ id: '', label: '— Clear selection —', isClear: true }, ...toolOptions]
    : toolOptions
  const loadingTools = serverId && toolsByServer[serverId] == null
  return (
    <NodeDropdown
      value={value ?? ''}
      options={options}
      onChange={onChange}
      placeholder={loadingTools ? 'Loading…' : (placeholder || 'Select tool…')}
    />
  )
}

/**
 * Compact inline body for user_input nodes:
 * shows the Label field (editable) then a Value row (defaultValue, editable).
 * The full config (kind, placeholder, options…) stays in the Inspector.
 */
function UserInputNodeBody({ id, values, setSubBlockValue }) {
  const label = values?.label ?? 'Input'
  const kind = values?.kind ?? 'short-text'
  const isPassword = kind === 'password'
  const defVal = values?.defaultValue ?? ''

  const stopPointer = {
    onClick: (e) => e.stopPropagation(),
    onMouseDown: (e) => e.stopPropagation(),
    onPointerDown: (e) => e.stopPropagation(),
  }

  return (
    <div className="bs-node-body bs-ui-node-body">
      {/* Row 1 — Label */}
      <div className="bs-node-row">
        <span className="bs-node-row-pin bs-node-row-pin-orange" />
        <span className="bs-node-row-label">Label</span>
        <span className="bs-node-row-edit" {...stopPointer}>
          <InlineInput
            type="text"
            value={label}
            placeholder="Input"
            onChange={(v) => setSubBlockValue(id, 'label', v)}
          />
        </span>
      </div>
      {/* Row 2 — Value (defaultValue) */}
      <div className="bs-node-row bs-ui-node-value-row">
        <span className="bs-node-row-pin bs-node-row-pin-green" />
        <span className="bs-node-row-label">Value</span>
        <span className="bs-node-row-edit" {...stopPointer}>
          <InlineInput
            type={isPassword ? 'password' : 'text'}
            value={defVal}
            placeholder={isPassword ? '••••••' : `Enter ${label.toLowerCase() || 'value'}…`}
            onChange={(v) => setSubBlockValue(id, 'defaultValue', v)}
          />
        </span>
      </div>
    </div>
  )
}

function renderInlineEditor(sb, value, onChange, ctx = {}) {
  switch (sb.type) {
    case 'mcp-server-selector':
      return (
        <McpServerNodeSelect
          value={value ?? ''}
          onChange={onChange}
          placeholder={sb.placeholder}
        />
      )

    case 'mcp-tool-selector':
      return (
        <McpToolNodeSelect
          value={value ?? ''}
          onChange={onChange}
          placeholder={sb.placeholder}
          serverId={ctx.values?.server ?? ''}
        />
      )

    case 'mcp-dynamic-args':
      return (
        <InlineInput
          type="text"
          value={typeof value === 'string' ? value : (value ? JSON.stringify(value) : '')}
          placeholder="{}"
          onChange={onChange}
        />
      )

    case 'switch':
      return (
        <label className="bs-switch bs-switch-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span />
        </label>
      )

    case 'dropdown':
    case 'combobox': {
      const options = typeof sb.options === 'function' ? safeCall(sb.options) : (sb.options || [])
      return (
        <NodeDropdown
          value={value ?? ''}
          options={options}
          placeholder={sb.placeholder}
          onChange={onChange}
        />
      )
    }

    // Text inputs — rendered as "ghost" fields that look like text until focus.
    // For `eval-input` / `long-input` we still use a single-line input on the
    // card; the Inspector holds the full multi-line textarea.
    case 'short-input':
    case 'long-input':
    case 'text':
    case 'eval-input':
      return (
        <InlineInput
          type={sb.password ? 'password' : 'text'}
          value={value ?? ''}
          placeholder={sb.placeholder}
          onChange={onChange}
        />
      )

    case 'slider': {
      // Show a compact number field (keeps the card tight). Full slider lives
      // in the Inspector.
      const min = sb.min ?? 0
      const max = sb.max ?? 1
      const step = sb.step ?? (sb.integer ? 1 : 0.01)
      return (
        <InlineInput
          type="number"
          value={value ?? min}
          min={min}
          max={max}
          step={step}
          onChange={(v) => onChange(v === '' ? v : Number(v))}
        />
      )
    }

    case 'checkbox-list':
    case 'grouped-checkbox-list': {
      const arr = Array.isArray(value) ? value : []
      return <SummaryChip text={arr.length ? `${arr.length} selected` : 'none'} />
    }

    case 'table': {
      const rows = Array.isArray(value) ? value : []
      return <SummaryChip text={rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : 'empty'} />
    }

    case 'tool-input':
    case 'skill-input': {
      const arr = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? safeJsonArray(value) : [])
      return <SkillChip skillIds={arr} onChange={onChange} />
    }

    case 'skill-picker': {
      // skill-picker stores a single skill ID string; adapt to SkillChip's array API
      const arr = value ? [value] : []
      return (
        <SkillChip
          skillIds={arr}
          onChange={(v) => {
            const ids = safeJsonArray(v)
            onChange(ids[0] ?? '')
          }}
        />
      )
    }

    default:
      return null
  }
}

/** Compact styled dropdown for inline card fields (replaces native <select>). */
function NodeDropdown({ value, options = [], onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find((o) => o.id === value) || null

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  return (
    <div ref={ref} className="bs-node-dropdown nowheel">
      <button
        type="button"
        className={`bs-node-dropdown-trigger ${open ? 'is-open' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <span className={`bs-node-dropdown-value ${!selected ? 'is-placeholder' : ''}`}>
          {selected ? selected.label : (placeholder || 'Select…')}
        </span>
        <svg className="bs-node-dropdown-chevron" width="8" height="5" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="bs-node-dropdown-menu nowheel" onClick={(e) => e.stopPropagation()}>
          {options.map((o) => (
            <button
              key={o.id || '__clear__'}
              type="button"
              className={`bs-node-dropdown-option ${o.id === value ? 'is-active' : ''} ${o.isClear ? 'is-clear' : ''}`}
              onClick={(e) => { e.stopPropagation(); onChange(o.id); setOpen(false) }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
              {o.id === value && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0, color: 'var(--bs-dropdown-check-color, var(--bs-accent))' }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Notion-style "ghost" text input: invisible chrome until hovered/focused.
 * Commits on change; blurs on Enter; Escape reverts to last committed value.
 * Stops pointer/mouse/dblclick events from bubbling to ReactFlow drag and
 * the card's double-click rename handler.
 */
function InlineInput({ type = 'text', value, onChange, placeholder, ...rest }) {
  return (
    <input
      className="bs-node-input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
      // Prevent ReactFlow from starting a card drag when the user clicks/drags inside the input
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      // Prevent the card's double-click → rename handler from firing when user double-clicks to select text
      onDoubleClick={(e) => e.stopPropagation()}
      {...rest}
    />
  )
}

/** Skill chip: single-select compact badge on the node card.
 *  Empty → dashed + button. Selected → ⚡ badge + change + remove.
 *  Clicking the badge itself opens the SkillEditor tab. */
function SkillChip({ skillIds, onChange }) {
  const skills = useWorkspaceStore((s) => s.skills)
  const openTab = useTabsStore((s) => s.openTab)
  const [pickerOpen, setPickerOpen] = useState(false)
  const ref = useRef(null)

  // Single-select: use only the first element
  const selectedId = skillIds[0] ?? null
  const selected = selectedId ? (skills.find((s) => s.id === selectedId) ?? null) : null

  useEffect(() => {
    if (!pickerOpen) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setPickerOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [pickerOpen])

  function selectSkill(skillId, e) {
    e.stopPropagation()
    if (onChange) onChange(JSON.stringify([skillId]))
    setPickerOpen(false)
  }

  function removeSkill(e) {
    e.stopPropagation()
    if (onChange) onChange(JSON.stringify([]))
  }

  function openSkillTab(e) {
    e.stopPropagation()
    if (!selected) return
    openTab({ id: skillTabId(selected.id), kind: 'skill', entityId: selected.id, title: selected.name })
  }

  return (
    <span ref={ref} className="bs-skill-chip-wrap">
      {selected ? (
        <>
          <button className="bs-skill-node-badge" onClick={openSkillTab} title={`Open "${selected.name}"`}>
            <span className="bs-skill-node-icon">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </span>
            <span className="bs-skill-popover-name">{selected.name}</span>
            {selected.language && <span className="bs-skill-popover-lang">{selected.language}</span>}
          </button>
          {onChange && (
            <>
              <button
                className="bs-skill-node-action"
                onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v) }}
                title="Change skill"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/>
                  <path d="M17.5 2.5a2.12 2.12 0 0 1 3 3L12 14l-4 1 1-4 7.5-7.5z"/>
                </svg>
              </button>
              <button
                className="bs-skill-node-action bs-skill-node-action--remove"
                onClick={removeSkill}
                title="Remove skill"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </>
          )}
        </>
      ) : (
        onChange && (
          <button
            className="bs-skill-node-empty"
            onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v) }}
            title="Select skill"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Select skill…</span>
          </button>
        )
      )}
      {pickerOpen && (
        <div className="bs-skill-picker">
          <div className="bs-skill-picker-title">Skills / Tools</div>
          {skills.length === 0 ? (
            <div className="bs-skill-picker-empty">No skills defined yet</div>
          ) : skills.map((sk) => (
            <button
              key={sk.id}
              className={`bs-skill-picker-item ${sk.id === selectedId ? 'is-selected' : ''}`}
              onClick={(e) => selectSkill(sk.id, e)}
            >
              <span className="bs-skill-picker-check">{sk.id === selectedId ? '✓' : ''}</span>
              <span className="bs-skill-node-icon" style={{ fontSize: 12 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </span>
              <span className="bs-skill-popover-name">{sk.name}</span>
              {sk.language && <span className="bs-skill-popover-lang">{sk.language}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

/** Clickable type badge on card ports — opens a dropdown to change the port type. */
function PortTypeBadge({ type, color, portId, nodeId }) {
  const setSubBlockValue = useWorkflowStore((s) => s.setSubBlockValue)
  const portTypes = useWorkflowStore((s) => s.subBlockValues[nodeId]?._portTypes) ?? {}
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const wrapRef = useRef(null)
  const menuRef = useRef(null)
  const allTypes = useMemo(() => getAllPortTypes(), [])

  // Measure and flip if near bottom
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    setDropUp(rect.bottom + 150 > window.innerHeight)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (wrapRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  function pick(t, e) {
    e.stopPropagation()
    const next = { ...portTypes, [portId]: t }
    setSubBlockValue(nodeId, '_portTypes', next)
    setOpen(false)
  }

  return (
    <span className="bs-port-badge-wrap" ref={wrapRef}>
      <span
        className="bs-port-type-badge bs-port-type-badge-clickable"
        data-iotype={type}
        style={{ background: color.bg, borderColor: color.border, color: color.text }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        {type}
      </span>
      {open && (
        <div className={`bs-port-badge-menu nowheel ${dropUp ? 'bs-port-badge-menu-up' : ''}`} ref={menuRef}>
          {allTypes.map((t) => {
            const c = getTypeColor(t)
            return (
              <button
                key={t}
                className={`bs-type-chip-option ${t === type ? 'is-active' : ''}`}
                data-iotype={t}
                onClick={(e) => pick(t, e)}
              >
                <span className="bs-type-chip-dot" style={{ background: c.solid }} />
                {t}
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}

/** Read-only summary pill used for arrays/tables. Clicking the row selects
 *  the node (handled by the parent), which surfaces the Inspector for editing. */
function SummaryChip({ text }) {
  return <span className="bs-node-chip">{text}</span>
}

/**
 * Map an output-handle label to a semantic color bucket used by the CSS.
 * `true` → green, `false` → red, numeric case labels → indigo, others → indigo.
 */
function safeHandleColor(h) {
  const s = String(h).toLowerCase()
  if (s === 'true') return 'true'
  if (s === 'false') return 'false'
  if (s === 'else' || s === 'default') return 'else'
  return 'case'
}

/**
 * ComfyUI-style per-field pin color. Each subBlock row shows a tiny colored
 * dot on its left edge mapped to the field's data shape so a user can scan
 * a node at a glance and see "this one takes a string, that one a list".
 *   green  → boolean/toggle
 *   cyan   → number / slider
 *   blue   → string-ish
 *   purple → enum (dropdown/combobox)
 *   orange → structured (table / list / tool-input)
 *   grey   → anything else
 */
function fieldPinColor(sb) {
  const t = sb?.type
  if (t === 'switch' || t === 'checkbox') return 'green'
  if (t === 'slider' || t === 'number-input') return 'cyan'
  if (t === 'short-input' || t === 'long-input' || t === 'text' || t === 'eval-input' || t === 'code') return 'blue'
  if (t === 'dropdown' || t === 'combobox') return 'purple'
  if (t === 'table' || t === 'checkbox-list' || t === 'grouped-checkbox-list' || t === 'tool-input' || t === 'skill-input') return 'orange'
  return 'grey'
}

function safeJsonArray(s) {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

function safeCall(fn) {
  try { return fn() } catch { return [] }
}

function formatPreview(value) {
  if (value === null || value === undefined || value === '') return <em>empty</em>
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : <em>empty</em>
  if (typeof value === 'object') return <em>{'{…}'}</em>
  const s = String(value)
  return s.length > 32 ? `${s.slice(0, 32)}…` : s
}

/* ─── Context Menu SVG Icons ─────────────────────────────────────────────── */
const svgProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function CtxInspectorIcon(props) {
  return <svg {...svgProps} {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></svg>
}
function CtxRenameIcon(props) {
  return <svg {...svgProps} {...props}><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
}
function CtxDuplicateIcon(props) {
  return <svg {...svgProps} {...props}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
}
function CtxResizeIcon(props) {
  return <svg {...svgProps} {...props}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
}
function CtxDisconnectIcon(props) {
  return <svg {...svgProps} {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
}
function CtxDisableIcon(props) {
  return <svg {...svgProps} {...props}><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
}
function CtxEnableIcon(props) {
  // Slide-toggle "on" icon
  return <svg {...svgProps} {...props}><rect x="1" y="5" width="22" height="14" rx="7" /><circle cx="16" cy="12" r="4" fill="currentColor" stroke="none" /><path d="M16 12" /></svg>
}
function CtxCopyIcon(props) {
  return <svg {...svgProps} {...props}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
}
function CtxInspectIcon(props) {
  return <svg {...svgProps} {...props}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
}

export default memo(WorkflowNode)
