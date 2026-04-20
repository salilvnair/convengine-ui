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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position } from 'reactflow'
import { useWorkflowStore } from '../stores/workflow-store'
import { useWorkspaceStore } from '../stores/workspace-store'
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
])
/** Types that render as a read-only summary chip. Clicking bubbles up so the
 *  node gets selected and the Inspector surfaces the full editor. */
const INLINE_SUMMARY = new Set([
  'checkbox-list', 'grouped-checkbox-list',
  'table',
  'tool-input', 'skill-input',
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

function WorkflowNode({ id, data, selected }) {
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode)
  const disconnectNode = useWorkflowStore((s) => s.disconnectNode)
  const renameNode = useWorkflowStore((s) => s.renameNode)
  const setSubBlockValue = useWorkflowStore((s) => s.setSubBlockValue)
  const toggleDisabled = useWorkflowStore((s) => s.toggleDisabled)
  const renamingNodeId = useWorkflowStore((s) => s.renamingNodeId)
  const endRename = useWorkflowStore((s) => s.endRename)
  const values = useWorkflowStore((s) => s.subBlockValues[id])
  const activeNodeId = useWorkflowStore((s) => s.activeNodeId)
  const completedNodeIds = useWorkflowStore((s) => s.completedNodeIds)
  const errorNodeId = useWorkflowStore((s) => s.errorNodeId)
  const lastOutput = useWorkflowStore((s) => s.lastOutputs?.[id])
  const resizeNodeStore = useWorkflowStore((s) => s.resizeNode)
  // Check if this non-seed, non-disabled node has no incoming edges
  const SEED_TYPES = new Set(['starter', 'user_input'])
  const hasNoIncoming = useWorkflowStore((s) => {
    if (SEED_TYPES.has(data.blockType) || data.disabled) return false
    return !s.edges.some((e) => e.target === id)
  })
  const isActive = activeNodeId === id
  const isDone = completedNodeIds.includes(id)
  const isError = errorNodeId === id
  const isUnconnected = hasNoIncoming
  const isDisabled = !!data.disabled
  const cfg = getBlock(data.blockType)
  const Icon = data.icon || cfg?.icon

  // --- Dimensions: per-node persisted > block default > CSS default ---
  const DEFAULT_W = cfg?.defaultWidth || 280
  const DEFAULT_H = cfg?.defaultHeight || undefined // auto if not set
  const MIN_W = 200
  const MIN_H = 80
  const nodeRef = useRef(null)

  const [nodeW, setNodeW] = useState(data.width || DEFAULT_W)
  const [nodeH, setNodeH] = useState(data.height || DEFAULT_H)
  const [resizing, setResizing] = useState(false)
  const [resizeMode, setResizeMode] = useState(false) // right-click → Resize toggles this

  // Sync if data changes externally (e.g. undo, load)
  useEffect(() => {
    if (data.width) setNodeW(data.width)
    if (data.height) setNodeH(data.height)
  }, [data.width, data.height])

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
  useEffect(() => {
    if (renamingNodeId === id) setEditing(true)
  }, [renamingNodeId, id])

  // Exit resize mode when node is deselected
  useEffect(() => {
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
  useEffect(() => {
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
          isDisabled ? 'bs-node-disabled' : '',
          isUnconnected ? 'bs-node-unconnected' : '',
          outputHandles.length > 1 ? 'bs-node-multi-out' : '',
          resizing ? 'bs-node-resizing' : '',
          resizeMode ? 'bs-node-resize-mode' : '',
        ].filter(Boolean).join(' ')}
        style={{
          width: nodeW || undefined,
          ...(hasJsonPreview
            ? { minHeight: nodeH || undefined, height: 'auto' }
            : { height: nodeH || undefined }),
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

        {/* Unconnected warning */}
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
                return (
                  <div key={row.id} className="bs-node-jsonpreview" onClick={(e) => { e.stopPropagation(); selectNode(id) }}>
                    <div className="bs-node-jsonpreview-head">{row.label}</div>
                    <div className="bs-node-jsonpreview-body">
                      {lastOutput == null
                        ? <span className="bs-node-jsonpreview-empty">No run yet.</span>
                        : <JsonView value={lastOutput} />}
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
                      {renderInlineEditor(row.sb, row.value, (v) => setSubBlockValue(id, row.id, v))}
                    </span>
                  ) : (
                    <span className="bs-node-row-value">{formatPreview(row.value)}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Output port strip (ComfyUI-style) — single-output blocks ── */}
        {outputPorts.length > 0 && (
          <div className="bs-port-strip bs-port-strip-out">
            {outputPorts.map((p, i) => {
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
            { id: 'open', label: 'Open in Inspector', icon: CtxInspectorIcon, iconColor: '#818cf8', onSelect: () => selectNode(id) },
            { id: 'rename', label: 'Rename', icon: CtxRenameIcon, iconColor: '#fbbf24', shortcut: 'F2', onSelect: () => setEditing(true) },
            { id: 'dup', label: 'Duplicate', icon: CtxDuplicateIcon, iconColor: '#22d3ee', shortcut: '⌘D', onSelect: () => duplicateNode(id) },
            { id: 'inspect', label: 'Inspect', icon: CtxInspectIcon, iconColor: '#22d3ee', shortcut: '⌘I', disabled: !traceEntry, onSelect: () => setInspectOpen(true) },
            { id: 'resize', label: resizeMode ? 'Lock Size' : 'Resize', icon: CtxResizeIcon, iconColor: '#a78bfa', onSelect: () => setResizeMode((v) => !v) },
            { id: 'fit', label: 'Fit to Content', icon: CtxResizeIcon, iconColor: '#a78bfa', disabled: !nodeH, onSelect: () => { setNodeH(undefined); resizeNodeStore(id, nodeW, undefined) } },
            { separator: true },
            { id: 'disable', label: isDisabled ? 'Enable' : 'Disable', icon: isDisabled ? CtxEnableIcon : CtxDisableIcon, iconColor: isDisabled ? '#22c55e' : '#a855f6', onSelect: () => toggleDisabled(id) },
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

function renderInlineEditor(sb, value, onChange) {
  switch (sb.type) {
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
        <select
          className="bs-node-select"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {!value && <option value="">{sb.placeholder || 'Select…'}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
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

    default:
      return null
  }
}

/**
 * Notion-style "ghost" text input: invisible chrome until hovered/focused.
 * Commits on change; blurs on Enter; Escape reverts to last committed value.
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
      {...rest}
    />
  )
}

/** Skill chip: ≤5 skills rendered inline on the card, >5 shows a popover on click.
 *  Each skill item opens the SkillEditor tab. + button opens a picker to add/remove. */
function SkillChip({ skillIds, onChange }) {
  const skills = useWorkspaceStore((s) => s.skills)
  const openTab = useTabsStore((s) => s.openTab)
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const chipRef = useRef(null)
  const popRef = useRef(null)
  const pickerRef = useRef(null)

  const resolved = useMemo(() => {
    if (!skillIds.length) return []
    return skillIds
      .map((id) => skills.find((s) => s.id === id))
      .filter(Boolean)
  }, [skillIds, skills])

  // Close popover on outside click
  useEffect(() => {
    if (!open && !pickerOpen) return
    function handler(e) {
      if (chipRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return
      if (pickerRef.current?.contains(e.target)) return
      setOpen(false)
      setPickerOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open, pickerOpen])

  function openSkill(skill, e) {
    e.stopPropagation()
    openTab({ id: skillTabId(skill.id), kind: 'skill', entityId: skill.id, title: skill.name })
    setOpen(false)
  }

  function toggleSkill(skillId, e) {
    e.stopPropagation()
    if (!onChange) return
    const current = [...skillIds]
    const idx = current.indexOf(skillId)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(skillId)
    onChange(JSON.stringify(current, null, 2))
  }

  const selectedSet = useMemo(() => new Set(skillIds), [skillIds])

  const addButton = onChange ? (
    <button
      className="bs-skill-add-btn"
      onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v) }}
      title="Add / remove skills"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  ) : null

  const pickerPopup = pickerOpen && skills.length > 0 ? (
    <div className="bs-skill-picker" ref={pickerRef}>
      <div className="bs-skill-picker-title">Skills / Tools</div>
      {skills.map((sk) => (
        <button
          key={sk.id}
          className={`bs-skill-picker-item ${selectedSet.has(sk.id) ? 'is-selected' : ''}`}
          onClick={(e) => toggleSkill(sk.id, e)}
        >
          <span className="bs-skill-picker-check">{selectedSet.has(sk.id) ? '✓' : ''}</span>
          <span className="bs-skill-popover-icon">⚡</span>
          <span className="bs-skill-popover-name">{sk.name}</span>
          <span className="bs-skill-popover-lang">{sk.language}</span>
        </button>
      ))}
    </div>
  ) : null

  if (!resolved.length) {
    return (
      <span className="bs-skill-chip-wrap" ref={chipRef}>
        <span className="bs-node-chip">none</span>
        {addButton}
        {pickerPopup}
      </span>
    )
  }

  // ≤5 skills: render inline skill cards directly on the node
  if (resolved.length <= 5) {
    return (
      <span className="bs-skill-chip-wrap" ref={chipRef}>
        <div className="bs-skill-inline-list">
          {resolved.map((sk) => (
            <button
              key={sk.id}
              className="bs-skill-inline-item"
              onClick={(e) => openSkill(sk, e)}
            >
              <span className="bs-skill-popover-icon">⚡</span>
              <span className="bs-skill-popover-name">{sk.name}</span>
              <span className="bs-skill-popover-lang">{sk.language}</span>
            </button>
          ))}
        </div>
        {addButton}
        {pickerPopup}
      </span>
    )
  }

  // >5 skills: show count chip with popover on click
  return (
    <span className="bs-skill-chip-wrap" ref={chipRef}>
      <span
        className="bs-node-chip bs-node-chip-clickable"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        {resolved.length} attached
      </span>
      {addButton}
      {open && (
        <div className="bs-skill-popover" ref={popRef}>
          {resolved.map((sk) => (
            <button
              key={sk.id}
              className="bs-skill-popover-item"
              onClick={(e) => openSkill(sk, e)}
            >
              <span className="bs-skill-popover-icon">⚡</span>
              <span className="bs-skill-popover-name">{sk.name}</span>
              <span className="bs-skill-popover-lang">{sk.language}</span>
            </button>
          ))}
        </div>
      )}
      {pickerPopup}
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
  useEffect(() => {
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
        style={{ background: color.bg, borderColor: color.border, color: color.text }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        {type}
      </span>
      {open && (
        <div className={`bs-port-badge-menu ${dropUp ? 'bs-port-badge-menu-up' : ''}`} ref={menuRef}>
          {allTypes.map((t) => {
            const c = getTypeColor(t)
            return (
              <button
                key={t}
                className={`bs-type-chip-option ${t === type ? 'is-active' : ''}`}
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
