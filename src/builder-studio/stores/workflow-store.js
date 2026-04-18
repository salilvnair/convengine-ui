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

const initialState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
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
  errorNodeId: null,
}

export const useWorkflowStore = create()(
  devtools(
    (set, get) => ({
      ...initialState,

      loadWorkflow({ nodes, edges, subBlockValues }) {
        set({
          nodes: nodes || [],
          edges: edges || [],
          subBlockValues: subBlockValues || {},
          selectedNodeId: null,
        })
      },

      onNodesChange(changes) {
        set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
      },
      onEdgesChange(changes) {
        set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
      },
      onConnect(params) {
        set((s) => ({ edges: rfAddEdge({ ...params, animated: true }, s.edges) }))
      },

      addNode(blockType, position, blockConfig) {
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
        const s = get()
        const src = s.nodes.find((n) => n.id === id)
        if (!src) return null
        const newId = `n_${uuid()}`
        const copy = {
          ...src,
          id: newId,
          position: { x: (src.position?.x || 0) + 32, y: (src.position?.y || 0) + 32 },
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
        set((s) => ({
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
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

      /** Remove a single edge by id. */
      removeEdge(id) {
        set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }))
      },

      selectNode(id) {
        set({ selectedNodeId: id })
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

      /* ---------------- ComfyUI-style run state ---------------- */
      startRun() {
        set({ activeNodeId: null, completedNodeIds: [], activeEdgeIds: [], errorNodeId: null })
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
        set({ errorNodeId: nodeId, activeNodeId: null, activeEdgeIds: [] })
      },
      endRun() {
        // Keep completed highlights for a beat then clear via RunModal.
        set({ activeNodeId: null, activeEdgeIds: [] })
      },
      clearRunHighlights() {
        set({ activeNodeId: null, completedNodeIds: [], activeEdgeIds: [], errorNodeId: null })
      },
    }),
    { name: 'builder-studio-workflow' }
  )
)
