/**
 * ReactFlow canvas — mirrors sim/apps/sim/app/workspace/[workspaceId]/w/[workflowId]/workflow.tsx.
 *
 * Supports drag-drop from the BlockPalette (via HTML5 DnD), pan/zoom,
 * minimap, background, and click-to-select for the inspector.
 *
 * Keyboard:
 *   - Delete / Backspace  → remove selected node
 *   - ⌘D / Ctrl-D         → duplicate selected node
 * (Both are suppressed while typing inside inputs/textareas/contentEditable.)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkflowStore } from '../stores/workflow-store'
import { getBlock } from '../blocks/registry'
import WorkflowNode from './WorkflowNode'
import ConfirmModal from '../components/ConfirmModal'

const nodeTypes = { builderBlock: WorkflowNode }

function isEditableTarget(t) {
  if (!t) return false
  const tag = (t.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (t.isContentEditable) return true
  // vanilla-jsoneditor / CodeMirror roots
  if (t.closest?.('.cm-editor, .bs-jsoneditor, [contenteditable="true"]')) return true
  return false
}

function CanvasInner() {
  const wrapperRef = useRef(null)
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnect = useWorkflowStore((s) => s.onConnect)
  const addNode = useWorkflowStore((s) => s.addNode)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const removeEdge = useWorkflowStore((s) => s.removeEdge)
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode)
  const beginRename = useWorkflowStore((s) => s.beginRename)
  const moveNodeBy = useWorkflowStore((s) => s.moveNodeBy)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const activeEdgeIds = useWorkflowStore((s) => s.activeEdgeIds)
  const completedNodeIds = useWorkflowStore((s) => s.completedNodeIds)
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const [pendingDelete, setPendingDelete] = useState(null) // { id, title } | null

  /**
   * Overlay run-state styles onto the edges ReactFlow renders:
   *  - edges currently flowing (`activeEdgeIds`) get a pulsing gradient
   *  - edges that have finished (both endpoints in `completedNodeIds`) get
   *    a solid "done" stroke
   * The node-level classes (running / done) are applied inside WorkflowNode,
   * which is the correct scope because the node is the child component.
   */
  const displayedEdges = useMemo(() => {
    const activeSet = new Set(activeEdgeIds)
    const doneSet = new Set(completedNodeIds)
    return edges.map((e) => {
      const cls = []
      if (activeSet.has(e.id)) cls.push('bs-edge-flowing')
      else if (doneSet.has(e.source) && doneSet.has(e.target)) cls.push('bs-edge-done')
      if (e.sourceHandle === 'true') cls.push('bs-edge-true')
      else if (e.sourceHandle === 'false') cls.push('bs-edge-false')
      else if (e.sourceHandle === 'else' || e.sourceHandle === 'default') cls.push('bs-edge-else')
      else if (e.sourceHandle && e.sourceHandle.startsWith('case_')) cls.push('bs-edge-case')
      else if (e.sourceHandle && e.sourceHandle.startsWith('branch_')) cls.push('bs-edge-case')
      const className = [e.className, ...cls].filter(Boolean).join(' ')
      return {
        ...e,
        className,
        animated: activeSet.has(e.id) || e.animated,
      }
    })
  }, [edges, activeEdgeIds, completedNodeIds])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      const blockType = e.dataTransfer.getData('application/builder-studio-block')
      if (!blockType) return
      const cfg = getBlock(blockType)
      if (!cfg) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(blockType, position, cfg)
    },
    [addNode, screenToFlowPosition]
  )

  // Delete selected edges via ReactFlow's onEdgesDelete handler (fired when
  // an edge is selected + user hits Delete). We also intercept keydown for
  // node deletion since RF's built-in only acts on its internal "selected".
  const onEdgesDelete = useCallback(
    (toDelete) => {
      toDelete.forEach((e) => removeEdge(e.id))
    },
    [removeEdge]
  )

  useEffect(() => {
    function onKey(e) {
      if (isEditableTarget(e.target)) return
      const meta = e.metaKey || e.ctrlKey

      // ⌘D — Duplicate
      if (meta && (e.key === 'd' || e.key === 'D')) {
        if (!selectedNodeId) return
        e.preventDefault()
        duplicateNode(selectedNodeId)
        return
      }

      // Delete / Backspace — prompt before removing the selected node.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedNodeId) return
        e.preventDefault()
        const n = nodesById[selectedNodeId]
        setPendingDelete({ id: selectedNodeId, title: n?.data?.title || n?.data?.blockType || 'this block' })
        return
      }

      // F2 / Enter — begin inline rename
      if (e.key === 'F2' || e.key === 'Enter') {
        if (!selectedNodeId) return
        e.preventDefault()
        beginRename(selectedNodeId)
        return
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        if (selectedNodeId) { e.preventDefault(); selectNode(null) }
        return
      }

      // Arrow keys — nudge position (10px; 50px with Shift)
      if (e.key.startsWith('Arrow')) {
        if (!selectedNodeId) return
        const step = e.shiftKey ? 50 : 10
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (dx || dy) {
          e.preventDefault()
          moveNodeBy(selectedNodeId, dx, dy)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNodeId, removeNode, duplicateNode, beginRename, moveNodeBy, selectNode])

  const memoNodeTypes = useMemo(() => nodeTypes, [])

  return (
    <div ref={wrapperRef} className="bs-canvas" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={displayedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onPaneClick={() => selectNode(null)}
        nodeTypes={memoNodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1.2} color="var(--ce-border)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.35)" />
      </ReactFlow>

      {pendingDelete && (
        <ConfirmModal
          title="Delete block?"
          message={`"${pendingDelete.title}" and all its connections will be removed. This cannot be undone.`}
          confirmLabel="Delete block"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { removeNode(pendingDelete.id); setPendingDelete(null) }}
        />
      )}
    </div>
  )
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
