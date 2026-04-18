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
import { Handle, Position } from 'reactflow'
import { useWorkflowStore } from '../stores/workflow-store'
import { getBlock } from '../blocks/registry'
import { getTypeColor, getCardPorts } from '../panel/io-registry'
import ContextMenu from '../sidenav/ContextMenu'
import ConfirmModal from '../components/ConfirmModal'
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

function WorkflowNode({ id, data, selected }) {
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode)
  const disconnectNode = useWorkflowStore((s) => s.disconnectNode)
  const renameNode = useWorkflowStore((s) => s.renameNode)
  const setSubBlockValue = useWorkflowStore((s) => s.setSubBlockValue)
  const renamingNodeId = useWorkflowStore((s) => s.renamingNodeId)
  const endRename = useWorkflowStore((s) => s.endRename)
  const values = useWorkflowStore((s) => s.subBlockValues[id])
  const activeNodeId = useWorkflowStore((s) => s.activeNodeId)
  const completedNodeIds = useWorkflowStore((s) => s.completedNodeIds)
  const errorNodeId = useWorkflowStore((s) => s.errorNodeId)
  const lastOutput = useWorkflowStore((s) => s.lastOutputs?.[id])
  const resizeNodeStore = useWorkflowStore((s) => s.resizeNode)
  const isActive = activeNodeId === id
  const isDone = completedNodeIds.includes(id)
  const isError = errorNodeId === id
  const cfg = getBlock(data.blockType)
  const Icon = data.icon || cfg?.icon

  // --- Dimensions: per-node persisted > block default > CSS default ---
  const DEFAULT_W = cfg?.defaultWidth || 280
  const DEFAULT_H = cfg?.defaultHeight || undefined // auto if not set
  const MIN_W = 200
  const MIN_H = 80

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

    function onMove(ev) {
      ev.preventDefault()
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let w = startW
      let h = startH
      if (edges.includes('e')) w = Math.max(MIN_W, startW + dx)
      if (edges.includes('w')) w = Math.max(MIN_W, startW - dx)
      if (edges.includes('s')) h = Math.max(MIN_H, startH + dy)
      if (edges.includes('n')) h = Math.max(MIN_H, startH - dy)
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

  const requestDelete = () => setConfirmDelete(true)

  // Keyboard-driven rename (F2/Enter on the canvas) flips us into edit mode.
  useEffect(() => {
    if (renamingNodeId === id) setEditing(true)
  }, [renamingNodeId, id])

  // Exit resize mode when node is deselected
  useEffect(() => {
    if (!selected) setResizeMode(false)
  }, [selected])

  const isContainer = data.blockType === 'loop' || data.blockType === 'parallel'
  const isTrigger = data.category === 'triggers' || cfg?.category === 'triggers'

  const previewRows = useMemo(() => {
    if (!cfg) return []
    return (cfg.subBlocks || [])
      .filter((sb) => !sb.hidden && sb.type !== 'oauth-input' && sb.mode !== 'advanced')
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
  const { inputPorts, outputPorts } = useMemo(() => {
    if (!cfg) return { inputPorts: [], outputPorts: [] }
    const card = getCardPorts(cfg.type, cfg.inputs, cfg.outputs)
    // For multi-output branching blocks, skip typed outputs
    const outs = outputHandles.length > 1 ? [] : (card.outputs || [])
    return {
      inputPorts: (card.inputs || []).map((p) => ({ ...p, color: getTypeColor(p.type) })),
      outputPorts: outs.map((p) => ({ ...p, color: getTypeColor(p.type) })),
    }
  }, [cfg, outputHandles])

  return (
    <>
      <div
        className={[
          'bs-node',
          selected ? 'bs-node-selected' : '',
          isContainer ? 'bs-node-container' : '',
          isActive ? 'bs-node-running' : '',
          isDone ? 'bs-node-done' : '',
          isError ? 'bs-node-error' : '',
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
        onClick={() => selectNode(id)}
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

        {/* ── Input port strip (ComfyUI-style) ── */}
        {inputPorts.length > 0 && (
          <div className="bs-port-strip bs-port-strip-in">
            {inputPorts.map((p) => (
              <div key={p.key} className="bs-port-row bs-port-row-in">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`in_${p.key}`}
                  className="bs-port-handle bs-port-handle-in"
                  style={{ background: p.color.solid }}
                />
                <span className="bs-port-dot" style={{ background: p.color.solid }} />
                <span className="bs-port-name">{p.key}</span>
                <span
                  className="bs-port-type-badge"
                  style={{ background: p.color.bg, borderColor: p.color.border, color: p.color.text }}
                >
                  {p.type}
                </span>
              </div>
            ))}
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
            {outputPorts.map((p, i) => (
              <div key={p.key} className="bs-port-row bs-port-row-out">
                <span
                  className="bs-port-type-badge"
                  style={{ background: p.color.bg, borderColor: p.color.border, color: p.color.text }}
                >
                  {p.type}
                </span>
                <span className="bs-port-name">{p.key}</span>
                <span className="bs-port-dot" style={{ background: p.color.solid }} />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={p.key}
                  className="bs-port-handle bs-port-handle-out"
                  style={{ background: p.color.solid }}
                />
                {/* Backward-compat: first output also responds to legacy "out" handle ID */}
                {i === 0 && p.key !== 'out' && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id="out"
                    className="bs-port-handle-hidden"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Fallback: single output handle for blocks with no typed outputs */}
        {outputPorts.length === 0 && outputHandles.length === 1 && (
          <Handle type="source" position={Position.Right} className="bs-handle" id={outputHandles[0]} />
        )}

        {/* ── Input backward-compat: hidden "in" handle for old edges ── */}
        {inputPorts.length > 0 && (
          <Handle type="target" position={Position.Left} id="in" className="bs-port-handle-hidden" />
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
            { id: 'open', label: 'Open in Inspector', icon: CtxInspectorIcon, onSelect: () => selectNode(id) },
            { id: 'rename', label: 'Rename', icon: CtxRenameIcon, shortcut: 'F2', onSelect: () => setEditing(true) },
            { id: 'dup', label: 'Duplicate', icon: CtxDuplicateIcon, shortcut: '⌘D', onSelect: () => duplicateNode(id) },
            { id: 'resize', label: resizeMode ? 'Lock Size' : 'Resize', icon: CtxResizeIcon, onSelect: () => setResizeMode((v) => !v) },
            { separator: true },
            { id: 'disc', label: 'Disconnect All Edges', icon: CtxDisconnectIcon, onSelect: () => disconnectNode(id) },
            { id: 'copy', label: 'Copy Node ID', icon: CtxCopyIcon, onSelect: copyId },
            { separator: true },
            { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, shortcut: '⌫', onSelect: requestDelete },
          ]}
        />
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
      return <SummaryChip text={arr.length ? `${arr.length} attached` : 'none'} />
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
function CtxCopyIcon(props) {
  return <svg {...svgProps} {...props}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
}

export default memo(WorkflowNode)
