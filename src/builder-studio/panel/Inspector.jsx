/**
 * Inspector panel — right rail. Shows subBlocks of the currently selected
 * node, filtered by `condition` (basic/advanced `mode` toggles via tabs).
 *
 * Mirrors sim's workflow-block config panel: header, mode switch, and a
 * sequential list of SubBlockRenderer instances.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWorkflowStore } from '../stores/workflow-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { getBlock } from '../blocks/registry'
import { getTypeColor, getCardPorts, getAllPortTypes, hasFeature, getCustomIOSections } from './io-registry'
import SubBlockRenderer from './SubBlockRenderer'
import ConfirmModal from '../components/ConfirmModal'
import WorkflowInspector from './WorkflowInspector'
import BlockDocViewer from '../docs/BlockDocViewer'
import '../docs/block-docs-entries' // register all block docs

const EMPTY = Object.freeze({})

function humanize(id) {
  if (!id) return ''
  return String(id)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
}

export default function Inspector() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const setSubBlockValue = useWorkflowStore((s) => s.setSubBlockValue)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)
  const lastOutputs = useWorkflowStore((s) => s.lastOutputs)
  const values = useMemo(
    () => (selectedNodeId ? subBlockValues[selectedNodeId] || EMPTY : EMPTY),
    [selectedNodeId, subBlockValues]
  )
  const [mode, setMode] = useState('basic')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const activeWorkflowId = useWorkspaceStore((s) => s.activeWorkflowId)

  // Reset doc overlay when switching nodes
  useEffect(() => { setShowDocs(false) }, [selectedNodeId])

  const node = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const cfg = node ? getBlock(node.data.blockType) : null
  const cfgKey = node ? node.data.blockType : null

  const availableModes = useMemo(() => {
    if (!cfg) return []
    const set = new Set(['basic'])
    for (const sb of cfg.subBlocks) {
      if (sb.mode === 'advanced' || sb.mode === 'trigger-advanced') set.add('advanced')
    }
    return ['basic', 'advanced'].filter((m) => set.has(m))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey])

  const visibleSubBlocks = useMemo(() => {
    if (!cfg) return []
    const effective = availableModes.includes(mode) ? mode : 'basic'
    return cfg.subBlocks.filter((sb) => matchesMode(sb.mode, effective) && conditionPasses(sb.condition, values))
  }, [cfg, mode, values, availableModes])

  if (!node || !cfg) {
    // Nothing selected → surface workflow-level edit & advanced options.
    if (activeWorkflowId) return <WorkflowInspector workflowId={activeWorkflowId} />
    return (
      <aside className="bs-inspector bs-inspector-empty">
        <div className="bs-inspector-hint">Create or open a workflow to edit its settings, or click a block on the canvas.</div>
      </aside>
    )
  }

  return (
    <aside className="bs-inspector">
      <header className="bs-inspector-header">
        <div className="bs-inspector-title-row">
          <div className="bs-inspector-swatch" style={{ background: cfg.bgColor }} />
          <div>
            <div className="bs-inspector-title">{cfg.name}</div>
            <div className="bs-inspector-sub">{cfg.description}</div>
          </div>
          {/* About icon — toggles documentation overlay */}
          <button
            className={`bsdoc-about-btn ${showDocs ? 'bsdoc-about-active' : ''}`}
            onClick={() => setShowDocs((v) => !v)}
            title={showDocs ? 'Close documentation' : 'About this block'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          <button className="bs-btn-danger-ghost" onClick={() => setConfirmDelete(true)} title="Delete block">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Delete
          </button>
        </div>
        {availableModes.length > 1 && (
          <div
            className="bs-inspector-modes"
            style={{ '--active-idx': availableModes.indexOf(mode), '--mode-count': availableModes.length }}
          >
            <div className="bs-inspector-pill" />
            {availableModes.map((m) => (
              <button
                key={m}
                className={`bs-inspector-mode ${mode === m ? 'bs-inspector-mode-active' : ''}`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Doc viewer overlay (replaces inspector body when active) ── */}
      {showDocs ? (
        <div className="bs-inspector-body">
          <BlockDocViewer
            blockType={cfg.type}
            onClose={() => setShowDocs(false)}
            bgColor={cfg.bgColor}
          />
        </div>
      ) : (
      <div className="bs-inspector-body">
        {visibleSubBlocks.map((sb) => (
          <div key={`${sb.id}-${sb.condition ? JSON.stringify(sb.condition) : ''}`} className="bs-field">
            <label className="bs-label">
              {sb.title || humanize(sb.id)}
              {isRequired(sb.required, values) && <span className="bs-required">*</span>}
            </label>
            <SubBlockRenderer
              sub={sb}
              value={values[sb.id]}
              blockValues={values}
              nodeId={node.id}
              onChange={(id, v) => {
                setSubBlockValue(node.id, id, v)
                // When user_input kind changes, reset defaultValue so stale
                // incompatible values don't cause validation warnings.
                if (cfgKey === 'user_input' && id === 'kind') {
                  setSubBlockValue(node.id, 'defaultValue', '')
                }
                // When MCP server is cleared, also clear the tool selection.
                if (id === 'server' && !v) {
                  setSubBlockValue(node.id, 'tool', '')
                }
              }}
            />
            {sb.description && <div className="bs-hint">{sb.description}</div>}
          </div>
        ))}
        {visibleSubBlocks.length === 0 && (
          <div className="bs-inspector-hint">No {mode} fields for this block.</div>
        )}

        <IOPanel
          node={node}
          cfg={cfg}
          nodes={nodes}
          edges={edges}
          lastOutputs={lastOutputs}
          subBlockValues={subBlockValues}
        />
      </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete block?"
          message={`"${node.data?.title || cfg.name}" and all its connections will be removed. This cannot be undone.`}
          confirmLabel="Delete block"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); removeNode(node.id) }}
        />
      )}
    </aside>
  )
}

function matchesMode(subMode, activeMode) {
  if (!subMode || subMode === 'both') return true
  return subMode === activeMode
}

/**
 * Evaluate sim-style condition: {field, value, not?, and?}.
 * Supports arrays (OR over values), not negation, and nested `and` conjunct.
 */
function conditionPasses(condition, values) {
  if (!condition) return true
  const cond = typeof condition === 'function' ? safeCall(() => condition(values)) : condition
  if (!cond) return true
  const current = values[cond.field]
  const expected = cond.value
  const matches = Array.isArray(expected)
    ? expected.map((v) => String(v)).includes(String(current ?? ''))
    : String(expected ?? '') === String(current ?? '')
  const primary = cond.not ? !matches : matches
  if (!primary) return false
  if (cond.and) return conditionPasses(cond.and, values)
  return true
}

function isRequired(required, values) {
  if (required == null || required === false) return false
  if (required === true) return true
  if (typeof required === 'function') return Boolean(safeCall(() => required(values)))
  return conditionPasses(required, values)
}

function safeCall(fn) {
  try { return fn() } catch { return undefined }
}

/* ── Type badge color map (ComfyUI-inspired) ─────────────────────────────── */
function typeBadge(type) {
  const c = getTypeColor(type)
  return (
    <span
      className="bs-io-type"
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      {type || 'any'}
    </span>
  )
}

/** Chip-style dropdown for picking a port type. */
function TypeChipDropdown({ value, onChange, allTypes }) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const ref = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Measure after paint: if menu overflows viewport bottom, flip upward
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !ref.current) return
    const chipRect = ref.current.getBoundingClientRect()
    const menuH = menuRef.current.offsetHeight
    const spaceBelow = window.innerHeight - chipRect.bottom - 8
    setDropUp(spaceBelow < menuH)
  }, [open])

  const c = getTypeColor(value)
  return (
    <div className="bs-type-chip-wrap" ref={ref}>
      <button
        className="bs-type-chip"
        data-iotype={value || 'any'}
        style={{ background: c.bg, borderColor: c.border, color: c.text }}
        onClick={() => setOpen((v) => !v)}
      >
        {value || 'any'}
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 3, flexShrink: 0 }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div ref={menuRef} className={`bs-type-chip-menu ${dropUp ? 'bs-type-chip-menu-up' : ''}`}>
          {allTypes.map((t) => {
            const tc = getTypeColor(t)
            const active = t === value
            return (
              <button
                key={t}
                className={`bs-type-chip-option ${active ? 'is-active' : ''}`}
                data-iotype={t}
                style={{ color: tc.text }}
                onClick={() => { onChange(t); setOpen(false) }}
              >
                <span className="bs-type-chip-dot" style={{ background: tc.solid }} />
                {t}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Derives template variables available to an agent node based on upstream
 * connections and their last outputs.
 */
function deriveTemplateVars(node, nodes, edges, lastOutputs) {
  const upstreamEdges = edges.filter((e) => e.target === node.id)
  const vars = []
  for (const e of upstreamEdges) {
    const srcNode = nodes.find((n) => n.id === e.source)
    if (!srcNode) continue
    const srcTitle = srcNode.data?.title || srcNode.data?.blockType || e.source
    const out = lastOutputs[e.source]
    // If upstream output was a JSON string, parse its keys
    if (typeof out === 'string') {
      try {
        const parsed = JSON.parse(out)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const k of Object.keys(parsed)) {
            vars.push({ key: k, from: srcTitle, type: typeof parsed[k] === 'number' ? 'number' : typeof parsed[k] })
          }
        }
      } catch { /* not JSON */ }
    } else if (out && typeof out === 'object' && !Array.isArray(out)) {
      for (const k of Object.keys(out)) {
        vars.push({ key: k, from: srcTitle, type: typeof out[k] === 'number' ? 'number' : typeof out[k] })
      }
    }
    // Always add generic `input`
    vars.push({ key: 'input', from: srcTitle, type: 'string' })
    // If upstream was a URL-like string
    if (typeof out === 'string' && /^https?:\/\//i.test(out.trim())) {
      vars.push({ key: 'url', from: srcTitle, type: 'string' })
    }
  }
  // Deduplicate by key
  const seen = new Set()
  return vars.filter((v) => { if (seen.has(v.key)) return false; seen.add(v.key); return true })
}

/**
 * Input / Output panel shown at the bottom of the Inspector for every block.
 * Inspired by ComfyUI's typed slot badges.
 */
function IOPanel({ node, cfg, nodes, edges, lastOutputs, subBlockValues }) {
  const cardPorts = useMemo(() => getCardPorts(cfg.type, cfg.inputs, cfg.outputs), [cfg])
  const cardInputs = cardPorts.inputs || []
  const cardOutputs = cardPorts.outputs || []
  const hasInputs = cardInputs.length > 0
  const hasOutputs = cardOutputs.length > 0
  const setSubBlockValue = useWorkflowStore((s) => s.setSubBlockValue)
  const hiddenPorts = (subBlockValues[node.id] || {})?._hiddenPorts || {}
  const portTypes = (subBlockValues[node.id] || {})?._portTypes || {}
  const allTypes = useMemo(() => getAllPortTypes(), [])

  const togglePort = (portKey) => {
    const next = { ...hiddenPorts, [portKey]: !hiddenPorts[portKey] }
    for (const k of Object.keys(next)) { if (!next[k]) delete next[k] }
    setSubBlockValue(node.id, '_hiddenPorts', next)
  }

  const setPortType = (portId, newType) => {
    const next = { ...portTypes, [portId]: newType }
    setSubBlockValue(node.id, '_portTypes', next)
  }

  /** Resolve effective type for a port — per-node override or default. */
  const effectiveType = (portId, defaultType) => portTypes[portId] || defaultType

  // Upstream connections
  const upstreamEdges = edges.filter((e) => e.target === node.id)
  const upstreamNodes = upstreamEdges.map((e) => {
    const n = nodes.find((nd) => nd.id === e.source)
    return n ? { id: n.id, title: n.data?.title || n.data?.blockType || n.id, blockType: n.data?.blockType } : null
  }).filter(Boolean)

  // Downstream connections
  const downstreamEdges = edges.filter((e) => e.source === node.id)
  const downstreamNodes = downstreamEdges.map((e) => {
    const n = nodes.find((nd) => nd.id === e.target)
    return n ? { id: n.id, title: n.data?.title || n.data?.blockType || n.id, blockType: n.data?.blockType } : null
  }).filter(Boolean)

  // Template vars — enabled for blocks registered via io-registry feature flags
  const showTemplateVars = hasFeature('templateVars', cfg.type)
  const templateVars = useMemo(
    () => showTemplateVars ? deriveTemplateVars(node, nodes, edges, lastOutputs) : [],
    [showTemplateVars, node, nodes, edges, lastOutputs]
  )

  // Custom IO sections from extensions
  const customSections = useMemo(
    () => getCustomIOSections().filter((s) => !s.match || s.match(cfg, node)),
    [cfg, node]
  )

  if (!hasInputs && !hasOutputs && upstreamNodes.length === 0 && downstreamNodes.length === 0) return null

  return (
    <div className="bs-io-panel">
      {/* ── Connections ── */}
      {(upstreamNodes.length > 0 || downstreamNodes.length > 0) && (
        <div className="bs-io-section">
          <div className="bs-io-heading">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
            Connections
          </div>
          {upstreamNodes.length > 0 && (
            <div className="bs-io-row">
              <span className="bs-io-dir">← from</span>
              <div className="bs-io-chips">
                {upstreamNodes.map((n) => (
                  <span key={n.id} className="bs-io-chip bs-io-chip-in">{n.title}</span>
                ))}
              </div>
            </div>
          )}
          {downstreamNodes.length > 0 && (
            <div className="bs-io-row">
              <span className="bs-io-dir">→ to</span>
              <div className="bs-io-chips">
                {downstreamNodes.map((n) => (
                  <span key={n.id} className="bs-io-chip bs-io-chip-out">{n.title}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Template variables (blocks with templateVars feature) ── */}
      {showTemplateVars && templateVars.length > 0 && (
        <div className="bs-io-section">
          <div className="bs-io-heading">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M14 4l-4 16"/></svg>
            Template Variables
          </div>
          <div className="bs-io-hint">Use <code>{'{{key}}'}</code> in prompts to reference upstream data</div>
          <div className="bs-io-var-list">
            {templateVars.map((v) => (
              <div key={v.key} className="bs-io-var-row">
                <code className="bs-io-var-key">{`{{${v.key}}}`}</code>
                {typeBadge(v.type)}
                <span className="bs-io-var-from">from {v.from}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Inputs ── */}
      {hasInputs && (
        <div className="bs-io-section">
          <div className="bs-io-heading">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            Input
          </div>
          <div className="bs-io-slots">
            {cardInputs.map((p) => {
              const portId = `in_${p.key}`
              const hidden = !!hiddenPorts[portId]
              const type = effectiveType(portId, p.type)
              return (
                <div key={p.key} className={`bs-io-slot ${hidden ? 'bs-io-slot-hidden' : ''}`}>
                  <span className="bs-io-slot-name">{p.key}</span>
                  <TypeChipDropdown value={type} allTypes={allTypes} onChange={(t) => setPortType(portId, t)} />
                  <button
                    className={`bs-io-toggle ${hidden ? '' : 'is-on'}`}
                    onClick={() => togglePort(portId)}
                    title={hidden ? 'Show on card' : 'Hide from card'}
                  >
                    <span className="bs-io-toggle-track"><span className="bs-io-toggle-thumb" /></span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Outputs ── */}
      {hasOutputs && (
        <div className="bs-io-section">
          <div className="bs-io-heading">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            Output
          </div>
          <div className="bs-io-slots">
            {cardOutputs.map((p) => {
              const portId = `out_${p.key}`
              const hidden = !!hiddenPorts[portId]
              const type = effectiveType(portId, p.type)
              return (
                <div key={p.key} className={`bs-io-slot ${hidden ? 'bs-io-slot-hidden' : ''}`}>
                  <span className="bs-io-slot-name">{p.key}</span>
                  <TypeChipDropdown value={type} allTypes={allTypes} onChange={(t) => setPortType(portId, t)} />
                  <button
                    className={`bs-io-toggle ${hidden ? '' : 'is-on'}`}
                    onClick={() => togglePort(portId)}
                    title={hidden ? 'Show on card' : 'Hide from card'}
                  >
                    <span className="bs-io-toggle-track"><span className="bs-io-toggle-thumb" /></span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Extension-registered custom sections ── */}
      {customSections.map((section) => (
        <section.Component
          key={section.key}
          node={node}
          cfg={cfg}
          nodes={nodes}
          edges={edges}
          lastOutputs={lastOutputs}
          subBlockValues={subBlockValues}
        />
      ))}
    </div>
  )
}
