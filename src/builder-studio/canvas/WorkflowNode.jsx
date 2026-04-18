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
import { memo, useEffect, useMemo, useState } from 'react'
import { Handle, Position } from 'reactflow'
import { useWorkflowStore } from '../stores/workflow-store'
import { getBlock } from '../blocks/registry'
import ContextMenu from '../sidenav/ContextMenu'
import {
  TrashIcon,
  LinkIcon,
  PlusIcon,
  XIcon,
} from '../components/icons'

// subBlock types we allow editing inline on the card; everything else is
// read-only preview (use the Inspector for full editing).
const INLINE_EDITABLE = new Set(['switch', 'dropdown', 'combobox'])

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
  const cfg = getBlock(data.blockType)
  const Icon = data.icon || cfg?.icon

  const [menu, setMenu] = useState(null)       // { x, y } in screen coords
  const [editing, setEditing] = useState(false) // inline-rename

  // Keyboard-driven rename (F2/Enter on the canvas) flips us into edit mode.
  useEffect(() => {
    if (renamingNodeId === id) setEditing(true)
  }, [renamingNodeId, id])

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

  return (
    <>
      <div
        className={`bs-node ${selected ? 'bs-node-selected' : ''} ${isContainer ? 'bs-node-container' : ''}`}
        onClick={() => selectNode(id)}
        onContextMenu={openMenu}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      >
        {!isTrigger && (
          <Handle type="target" position={Position.Left} className="bs-handle" id="in" />
        )}

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

          {/* Hover-delete (mirrors sidenav rows). Stops propagation so
              clicking it doesn't also select the node. */}
          <button
            className="bs-node-close"
            title="Delete block"
            onClick={(e) => { e.stopPropagation(); removeNode(id) }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <XIcon className="bs-ico-xs" />
          </button>
        </div>

        {previewRows.length > 0 && (
          <div className="bs-node-body">
            {previewRows.map((row) => {
              const editable = INLINE_EDITABLE.has(row.sb.type)
              return (
                <div key={row.id} className="bs-node-row">
                  <span className="bs-node-row-label">{row.label}</span>
                  {editable ? (
                    <span className="bs-node-row-edit" {...stopPointer}>
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

        <Handle type="source" position={Position.Right} className="bs-handle" id="out" />
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { id: 'open', label: 'Open in Inspector', icon: LinkIcon, onSelect: () => selectNode(id) },
            { id: 'rename', label: 'Rename', shortcut: 'F2', onSelect: () => setEditing(true) },
            { id: 'dup', label: 'Duplicate', icon: PlusIcon, shortcut: '⌘D', onSelect: () => duplicateNode(id) },
            { id: 'disc', label: 'Disconnect edges', onSelect: () => disconnectNode(id) },
            { id: 'copy', label: 'Copy node ID', onSelect: copyId },
            { separator: true },
            { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, shortcut: '⌫', onSelect: () => removeNode(id) },
          ]}
        />
      )}
    </>
  )
}

function renderInlineEditor(sb, value, onChange) {
  if (sb.type === 'switch') {
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
  }
  if (sb.type === 'dropdown' || sb.type === 'combobox') {
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
  return null
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

export default memo(WorkflowNode)
