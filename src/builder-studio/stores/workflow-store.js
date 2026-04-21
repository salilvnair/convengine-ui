/**
 * Workflow canvas store — nodes, edges, selection, subBlock values.
 *
 * Split mirrors sim's stores/workflows/{workflow,subblock}. Kept in one file
 * for concision but namespaced under two exported hooks.
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  addEdge as rfAddEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from 'reactflow'
import { v4 as uuid } from 'uuid'
import { getBlock } from '../blocks/registry'
import { getCardPorts } from '../panel/io-registry'

/* ── Undo / redo history ─────────────────────────────────────────────── */
const MAX_HISTORY = 100
const _past = []    // { nodes, edges, subBlockValues }[]
const _future = []  // same
let _lastPushTime = 0

function _snap(s) {
  return {
    nodes: JSON.parse(JSON.stringify(s.nodes)),
    edges: JSON.parse(JSON.stringify(s.edges)),
    subBlockValues: JSON.parse(JSON.stringify(s.subBlockValues)),
  }
}
function _pushSnap(s) {
  _past.push(_snap(s))
  if (_past.length > MAX_HISTORY) _past.shift()
  _future.length = 0
  _lastPushTime = Date.now()
}
/** Throttled push — coalesces rapid calls (e.g. continuous drag) into one snapshot. */
function _pushSnapThrottled(s) {
  const now = Date.now()
  if (now - _lastPushTime < 300 && _past.length > 0) return // skip if recent push
  _pushSnap(s)
}

const initialState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  /** IDs of all nodes currently selected (multi-select). ReactFlow keeps
   *  node.selected in sync; this mirrors it so other components can subscribe. */
  selectedNodeIds: [],
  /** Node currently in inline-rename mode. Set by keyboard (F2/Enter) or the
   *  context menu; `WorkflowNode` observes this to enter edit state. */
  renamingNodeId: null,
  /** Map<nodeId, Record<subBlockId, unknown>> — values per block instance. */
  subBlockValues: {},
  /** ComfyUI-style run state: id of the node currently executing, set of
   *  node ids that have finished (green flash), set of edge ids currently
   *  "flowing" (data traveling). All cleared at run start and after a
   *  run completes. */
  activeNodeId: null,
  completedNodeIds: [],
  activeEdgeIds: [],
  errorNodeIds: new Set(),
  errorShakeKey: 0,
  /** Node IDs whose run-panel inputs are currently invalid (wrong format/type).
   *  Drives the red squiggle card highlight in the canvas. Cleared when the
   *  user fixes the value. Does NOT clear on run start — the card stays red
   *  until the value is corrected. */
  invalidInputNodeIds: new Set(),
  invalidInputShakeKey: 0,
  /** Per-node last output from the most recent run. Drives the Save-to-Files
   *  preview body and can be consumed by any block that wants to show what
   *  it last produced. Keyed by node id. Cleared by `clearRunHighlights`. */
  lastOutputs: {},
  /** Per-node trace entry from the most recent run. Keyed by node id. */
  lastNodeTrace: {},

  /**
   * Extra problems injected outside the run flow (deploy errors, import
   * parse errors, etc.) — surfaced in the Problems panel alongside run errors.
   * Each entry: { severity, node, message, detail? }
   */
  extraProblems: [],

  /**
   * Canvas-level configuration — persisted with the workflow.
   * Every visual / behavioural preference lives here so it can be toggled
   * from Settings or context menus without touching component state.
   */
  canvasConfig: {
    // Interaction
    mode: 'pan',              // 'pan' | 'select'  — default drag behaviour
    snapToGrid: false,        // snap node positions to grid while dragging
    snapGrid: [16, 16],       // [x, y] grid size in px
    selectionMode: 'partial', // 'partial' | 'full'  — ReactFlow selectionMode
    // Display
    showMinimap: false,
    showBackground: true,
    backgroundVariant: 'dots', // 'dots' | 'lines' | 'cross'
    backgroundGap: 18,
    backgroundSize: 1.2,
    // Edges
    animateEdges: true,
    edgeType: 'smoothstep',   // 'smoothstep' | 'bezier' | 'straight' | 'step'
    // Node defaults
    defaultNodeWidth: 280,
    // Toolbar — pan/select mode toggle overlay
    modeSwitcherBtnSize: 22,  // px — width & height of each mode button
    modeSwitcherIconSize: 12, // px — SVG icon size inside mode button
    // Toolbar — zoom controls (+/-/fit)
    zoomBtnSize: 22,          // px — width & height of each zoom button
  },
}

export const useWorkflowStore = create()(
  devtools(
    (set, get) => ({
      ...initialState,

      addExtraProblem(problem) {
        set((s) => ({ extraProblems: [...s.extraProblems, problem] }))
      },
      clearExtraProblems() {
        set({ extraProblems: [] })
      },

      loadWorkflow({ nodes, edges, subBlockValues }) {
        // ── Migrate legacy edge handles ──────────────────────────────────
        // Old workflows may have edges with targetHandle "in" or
        // sourceHandle "out" instead of the canonical "in_<key>" / "<key>"
        // format. Remap them so the runner and inspector don't see dupes.
        const nodeMap = Object.fromEntries((nodes || []).map((n) => [n.id, n]))
        const migrated = (edges || []).map((e) => {
          let { sourceHandle, targetHandle, ...rest } = e
          // target: "in" → "in_<firstInputKey>"
          if (!targetHandle || targetHandle === 'in') {
            const bt = nodeMap[e.target]?.data?.blockType
            const blk = bt && getBlock(bt)
            if (blk) {
              const card = getCardPorts(bt, blk.inputs, blk.outputs)
              if (card.inputs.length >= 1) targetHandle = `in_${card.inputs[0].key}`
            }
          }
          // source: "out" → first output key (raw, no prefix)
          if (!sourceHandle || sourceHandle === 'out') {
            const bt = nodeMap[e.source]?.data?.blockType
            const blk = bt && getBlock(bt)
            if (blk) {
              const card = getCardPorts(bt, blk.inputs, blk.outputs)
              if (card.outputs.length >= 1) sourceHandle = card.outputs[0].key
            }
          }
          return { ...rest, sourceHandle: sourceHandle || e.sourceHandle, targetHandle: targetHandle || e.targetHandle }
        })
        // Deduplicate edges (same source+target+handles)
        const seen = new Set()
        const deduped = migrated.filter((e) => {
          const key = `${e.source}::${e.target}::${e.sourceHandle}::${e.targetHandle}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        set({
          nodes: nodes || [],
          edges: deduped,
          subBlockValues: subBlockValues || {},
          selectedNodeId: null,
        })
      },

      onNodesChange(changes) {
        _pushSnapThrottled(get())
        set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
      },
      onEdgesChange(changes) {
        _pushSnapThrottled(get())
        set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
      },
      onConnect(params) {
        _pushSnap(get())
        set((s) => ({ edges: rfAddEdge({ ...params, animated: true }, s.edges) }))
      },

      addNode(blockType, position, blockConfig) {
        _pushSnap(get())
        const id = `n_${uuid()}`
        const node = {
          id,
          type: 'builderBlock',
          position,
          data: {
            blockType,
            title: blockConfig?.name || blockType,
            bgColor: blockConfig?.bgColor || '#334155',
            icon: blockConfig?.icon,
            category: blockConfig?.category,
          },
        }
        set((s) => ({ nodes: [...s.nodes, node] }))
        return node
      },

      removeNode(id) {
        _pushSnap(get())
        set((s) => {
          const { [id]: _dropped, ...restValues } = s.subBlockValues
          return {
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.source !== id && e.target !== id),
            subBlockValues: restValues,
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
          }
        })
      },

      /** Clone a node at a 32px/32px offset and deep-copy its subBlockValues. */
      duplicateNode(id) {
        _pushSnap(get())
        const s = get()
        const src = s.nodes.find((n) => n.id === id)
        if (!src) return null
        const newId = `n_${uuid()}`
        const copy = {
          ...src,
          id: newId,
          position: { x: (src.position?.x || 0) + 32, y: (src.position?.y || 0) - 60 },
          data: { ...src.data, title: `${src.data?.title || src.data?.blockType} copy` },
          selected: false,
        }
        const srcValues = s.subBlockValues[id]
        set({
          nodes: [...s.nodes, copy],
          subBlockValues: srcValues
            ? { ...s.subBlockValues, [newId]: JSON.parse(JSON.stringify(srcValues)) }
            : s.subBlockValues,
          selectedNodeId: newId,
        })
        return newId
      },

      /** Drop every edge incident to this node without removing the node. */
      disconnectNode(id) {
        _pushSnap(get())
        set((s) => ({
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        }))
      },

      /** Toggle disabled state on a node (ComfyUI-style mute). */
      toggleDisabled(id) {
        _pushSnap(get())
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, disabled: !n.data?.disabled } } : n
          ),
        }))
      },

      /** Rename a node's visible title (doesn't affect blockType or id). */
      renameNode(id, title) {
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, title } } : n)),
        }))
      },

      /** Start/stop inline-rename mode on a node. Used by keyboard shortcuts
       *  and the context menu; the actual <input> lives in WorkflowNode. */
      beginRename(id) { set({ renamingNodeId: id }) },
      endRename() { set({ renamingNodeId: null }) },

      /** Nudge a node's position by (dx,dy) px. Used by arrow-key shortcuts. */
      moveNodeBy(id, dx, dy) {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, position: { x: (n.position?.x || 0) + dx, y: (n.position?.y || 0) + dy } }
              : n
          ),
        }))
      },

      /** Resize a node. Stores width/height in node.data so it persists on save. */
      resizeNode(id, width, height) {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, width, height, userResized: true } }
              : n
          ),
        }))
      },

      /** Reset a node back to auto/fit-content height. */
      fitNode(id) {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, height: undefined, userResized: false } }
              : n
          ),
        }))
      },

      /** Remove a single edge by id. */
      removeEdge(id) {
        _pushSnap(get())
        set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }))
      },

      /** Remove all edges from the entire canvas. */
      disconnectAll() {
        _pushSnap(get())
        set({ edges: [] })
      },

      selectNode(id) {
        set({ selectedNodeId: id })
      },

      /** Sync the multi-selection id list from ReactFlow's onSelectionChange. */
      setSelectedNodeIds(ids) {
        set({ selectedNodeIds: ids })
      },

      /** Batch-remove multiple nodes and all their incident edges. */
      removeNodes(ids) {
        _pushSnap(get())
        const idSet = new Set(ids)
        set((s) => {
          const newValues = { ...s.subBlockValues }
          ids.forEach((id) => { delete newValues[id] })
          return {
            nodes: s.nodes.filter((n) => !idSet.has(n.id)),
            edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
            subBlockValues: newValues,
            selectedNodeId: idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
            selectedNodeIds: [],
          }
        })
      },

      /** Duplicate multiple nodes at a cascading offset. Replaces the current
       *  selection with the newly created copies. */
      duplicateNodes(ids) {
        _pushSnap(get())
        const s = get()
        const newNodes = []
        const newValues = { ...s.subBlockValues }
        ids.forEach((id, i) => {
          const src = s.nodes.find((n) => n.id === id)
          if (!src) return
          const newId = `n_${uuid()}`
          newNodes.push({
            ...src,
            id: newId,
            position: { x: (src.position?.x || 0) + 40 + i * 6, y: (src.position?.y || 0) - 60 + i * 6 },
            data: { ...src.data, title: `${src.data?.title || src.data?.blockType} copy` },
            selected: true,
          })
          if (s.subBlockValues[id]) {
            newValues[newId] = JSON.parse(JSON.stringify(s.subBlockValues[id]))
          }
        })
        set({
          nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
          subBlockValues: newValues,
          selectedNodeIds: newNodes.map((n) => n.id),
          selectedNodeId: newNodes[newNodes.length - 1]?.id ?? s.selectedNodeId,
        })
      },

      /** Nudge all given nodes by (dx, dy) pixels — used by arrow-key shortcuts
       *  when multiple nodes are selected. */
      moveNodesBy(ids, dx, dy) {
        const idSet = new Set(ids)
        set((s) => ({
          nodes: s.nodes.map((n) =>
            idSet.has(n.id)
              ? { ...n, position: { x: (n.position?.x || 0) + dx, y: (n.position?.y || 0) + dy } }
              : n
          ),
        }))
      },

      setSubBlockValue(nodeId, subBlockId, value) {
        set((s) => ({
          subBlockValues: {
            ...s.subBlockValues,
            [nodeId]: { ...(s.subBlockValues[nodeId] || {}), [subBlockId]: value },
          },
        }))
      },

      getSubBlockValues(nodeId) {
        return get().subBlockValues[nodeId] || {}
      },

      reset() {
        set(initialState)
      },

      /* ── Undo / Redo ── */
      undo() {
        if (_past.length === 0) return
        const s = get()
        _future.push(_snap(s))
        const prev = _past.pop()
        set({ nodes: prev.nodes, edges: prev.edges, subBlockValues: prev.subBlockValues })
      },
      redo() {
        if (_future.length === 0) return
        const s = get()
        _past.push(_snap(s))
        const next = _future.pop()
        set({ nodes: next.nodes, edges: next.edges, subBlockValues: next.subBlockValues })
      },
      canUndo() { return _past.length > 0 },
      canRedo() { return _future.length > 0 },

      /* ---------------- MiniMap visibility toggle ---------------- */
      showMinimap: false,
      toggleMinimap() { set((s) => ({ showMinimap: !s.showMinimap })) },

      /* ---------------- Canvas config ---------------- */
      /** Set a single key inside canvasConfig. */
      setCanvasConfigValue(key, value) {
        set((s) => ({
          canvasConfig: { ...s.canvasConfig, [key]: value },
        }))
      },
      /** Merge a partial canvasConfig object. */
      updateCanvasConfig(patch) {
        set((s) => ({
          canvasConfig: { ...s.canvasConfig, ...patch },
        }))
      },
      /** Reset canvasConfig to defaults. */
      resetCanvasConfig() {
        set((s) => ({
          canvasConfig: {
            ...initialState.canvasConfig,
            // preserve mode the user set during this session
            mode: s.canvasConfig?.mode ?? initialState.canvasConfig.mode,
          },
        }))
      },

      /* ---------------- ComfyUI-style run state ---------------- */
      startRun() {
        set({ activeNodeId: null, completedNodeIds: [], activeEdgeIds: [], errorNodeIds: new Set(), lastOutputs: {}, lastNodeTrace: {} })
      },
      recordNodeOutput(nodeId, output) {
        set((s) => ({ lastOutputs: { ...s.lastOutputs, [nodeId]: output } }))
      },
      recordNodeTrace(nodeId, traceEntry) {
        set((s) => ({ lastNodeTrace: { ...s.lastNodeTrace, [nodeId]: traceEntry } }))
      },
      markNodeRunning(nodeId) {
        set((s) => {
          // Mark inbound edges as "flowing" so they pulse.
          const inEdges = s.edges.filter((e) => e.target === nodeId).map((e) => e.id)
          return { activeNodeId: nodeId, activeEdgeIds: inEdges }
        })
      },
      markNodeDone(nodeId) {
        set((s) => ({
          activeNodeId: s.activeNodeId === nodeId ? null : s.activeNodeId,
          completedNodeIds: s.completedNodeIds.includes(nodeId)
            ? s.completedNodeIds
            : [...s.completedNodeIds, nodeId],
          activeEdgeIds: s.activeEdgeIds.filter((id) => !s.edges.find((e) => e.id === id && e.target === nodeId)),
        }))
      },
      markNodeError(nodeId) {
        set((s) => ({ errorNodeIds: new Set([...s.errorNodeIds, nodeId]), errorShakeKey: s.errorShakeKey + 1, activeNodeId: null, activeEdgeIds: [] }))
      },
      /** Called by the Run dock whenever invalidInputs changes.
       *  ids = Set<string> of node IDs that currently have bad values.
       *  Only bumps the shake key when the set of invalid IDs actually changes
       *  so that the squiggle animation isn't reset on every keystroke. */
      setInvalidInputNodeIds(ids) {
        set((s) => {
          const prev = s.invalidInputNodeIds
          const changed =
            ids.size !== prev.size ||
            [...ids].some((id) => !prev.has(id)) ||
            [...prev].some((id) => !ids.has(id))
          return {
            invalidInputNodeIds: ids,
            invalidInputShakeKey: changed ? s.invalidInputShakeKey + 1 : s.invalidInputShakeKey,
          }
        })
      },
      endRun() {
        // Keep completed highlights for a beat then clear via RunModal.
        set({ activeNodeId: null, activeEdgeIds: [] })
      },
      clearRunHighlights() {
        set({ activeNodeId: null, completedNodeIds: [], activeEdgeIds: [], errorNodeIds: new Set(), lastOutputs: {}, lastNodeTrace: {} })
      },
    }),
    { name: 'builder-studio-workflow' }
  )
)
