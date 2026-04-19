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
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow, updateEdge } from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkflowStore } from '../stores/workflow-store'
import { DeployIcon } from '../components/icons'
import { useWorkspaceStore } from '../stores/workspace-store'
import { getBlock, getAllBlocks, CATEGORY_LABELS, CATEGORY_ORDER, groupBlocksByCategory } from '../blocks/registry'
import WorkflowNode from './WorkflowNode'
import ConfirmModal from '../components/ConfirmModal'
import ContextMenu from '../sidenav/ContextMenu'

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
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)
  const activeWorkflow = useWorkspaceStore((s) => {
    const wf = s.workflows?.find((w) => w.id === s.activeWorkflowId)
    return wf || null
  })
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const [pendingDelete, setPendingDelete] = useState(null) // { id, title } | null
  const [edgeMenu, setEdgeMenu] = useState(null) // { x, y, edgeId } | null
  const [paneMenu, setPaneMenu] = useState(null) // { x, y } | null
  const edgeUpdateSuccessful = useRef(true)

  // Edge update (drag an edge endpoint to a different handle)
  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false
  }, [])
  const onEdgeUpdate = useCallback(
    (oldEdge, newConnection) => {
      edgeUpdateSuccessful.current = true
      onEdgesChange(
        edges
          .map((e) => {
            if (e.id === oldEdge.id) {
              return {
                ...e,
                source: newConnection.source,
                sourceHandle: newConnection.sourceHandle,
                target: newConnection.target,
                targetHandle: newConnection.targetHandle,
              }
            }
            return e
          })
          .map((e) => ({ id: e.id, type: 'reset', item: e }))
      )
    },
    [edges, onEdgesChange]
  )
  const onEdgeUpdateEnd = useCallback(
    (_, edge) => {
      if (!edgeUpdateSuccessful.current) removeEdge(edge.id)
      edgeUpdateSuccessful.current = true
    },
    [removeEdge]
  )

  // Right-click or click on an edge → show "Remove connection" menu
  const onEdgeContextMenu = useCallback((e, edge) => {
    e.preventDefault()
    window.dispatchEvent(new Event('bs:close-context-menus'))
    const sourceNode = nodesById[edge.source]
    const targetNode = nodesById[edge.target]
    const sourceName = sourceNode?.data?.title || edge.source
    const targetName = targetNode?.data?.title || edge.target
    setEdgeMenu({
      x: e.clientX,
      y: e.clientY,
      edgeId: edge.id,
      label: `${sourceName} → ${targetName}`,
    })
  }, [nodesById])

  // ── Pane right-click: "Add Block" menu with groups ──

  /* Add-block icon (plus in circle) */
  function AddBlockIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v8m-4-4h8" />
      </svg>
    )
  }

  /* Action icons for context menu */
  function ActionsIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    )
  }
  function RunIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    )
  }
  function SaveIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
      </svg>
    )
  }
  function ExportIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    )
  }
  const existingTypes = useMemo(() => new Set(nodes.map((n) => n.data?.blockType)), [nodes])

  const buildBlockMenuItems = useCallback((clientX, clientY) => {
    const all = getAllBlocks().filter((b) => !b.hideFromToolbar && !(b.singleton && existingTypes.has(b.type)))
    const grouped = { blocks: [], tools: [], triggers: [], custom: [] }
    for (const b of all) {
      const cat = grouped[b.category] ? b.category : 'custom'
      grouped[cat].push(b)
    }

    const makeItem = (b) => ({
      id: `add-${b.type}`,
      label: b.name,
      icon: b.icon || null,
      onSelect: () => {
        const cfg = getBlock(b.type)
        if (!cfg) return
        const position = screenToFlowPosition({ x: clientX, y: clientY })
        addNode(b.type, position, cfg)
      },
    })

    // Generic sub-group builder for any category
    const buildCategoryChildren = (blocks, cat) => {
      const { topItems, groups } = groupBlocksByCategory(blocks, cat)
      const result = []
      topItems.forEach((b) => result.push(makeItem(b)))
      for (const sg of groups) {
        if (sg.items.length === 1) {
          result.push(makeItem(sg.items[0]))
        } else {
          result.push({ id: sg.id, label: sg.label, children: sg.items.map(makeItem) })
        }
      }
      return result
    }

    const children = []
    for (const cat of CATEGORY_ORDER) {
      const items = grouped[cat]
      if (!items || items.length === 0) continue
      children.push({
        id: cat,
        label: CATEGORY_LABELS[cat],
        searchable: cat === 'blocks',
        children: buildCategoryChildren(items, cat),
      })
    }
    return {
      searchable: true,
      items: [
        { id: 'add-block-header', label: 'Add Block', icon: AddBlockIcon, isHeader: true },
        { separator: true },
        ...children,
        { separator: true },
        { id: 'actions-header', label: 'Actions', icon: ActionsIcon, isHeader: true },
        { separator: true },
        {
          id: 'action-run', label: 'Run', icon: RunIcon,
          onSelect: () => window.dispatchEvent(new CustomEvent('bs:action', { detail: 'run' })),
        },
        {
          id: 'action-save', label: 'Save', icon: SaveIcon,
          onSelect: () => {
            if (!activeWorkflow) return
            const ws = useWorkspaceStore.getState()
            ws.saveWorkflow(activeWorkflow.id, { nodes, edges, subBlockValues })
            ws.syncToServer()
          },
        },
        {
          id: 'action-export', label: 'Export JSON', icon: ExportIcon,
          onSelect: () => {
            if (!activeWorkflow) return
            const json = JSON.stringify({ nodes, edges, subBlockValues }, null, 2)
            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = (activeWorkflow.name || activeWorkflow.id || 'workflow').replace(/\s+/g, '_') + '.json'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          },
        },
        {
          id: 'action-deploy', label: 'Deploy', icon: DeployIcon,
          onSelect: () => window.dispatchEvent(new CustomEvent('bs:action', { detail: 'deploy' })),
        },
      ],
    }
  }, [addNode, screenToFlowPosition, existingTypes, activeWorkflow, nodes, edges, subBlockValues])

  // Capture-phase contextmenu listener on document.
  // ReactFlow + selectionOnDrag swallows contextmenu in its Pane component
  // (the Li wrapper checks e.target === paneRef, which fails when Background
  // SVG or selection overlay intercepts). Using the capture phase on document
  // guarantees we intercept before any React handler or d3 code can interfere.
  // stopPropagation prevents the ContextMenu's own document-level contextmenu
  // listener from immediately closing the menu we just opened.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handler = (e) => {
      // Only handle events inside our canvas wrapper
      if (!el.contains(e.target)) return
      // Skip nodes, edges, controls, minimap, existing menus
      if (e.target.closest('.react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__controls, .react-flow__minimap, .bs-ctxmenu')) return
      e.preventDefault()
      e.stopPropagation()
      window.dispatchEvent(new Event('bs:close-context-menus'))
      setPaneMenu({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener('contextmenu', handler, true) // capture phase
    return () => document.removeEventListener('contextmenu', handler, true)
  }, [])

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

  return (
    <div ref={wrapperRef} className="bs-canvas" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={displayedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeUpdateStart={onEdgeUpdateStart}
        onEdgeUpdate={onEdgeUpdate}
        onEdgeUpdateEnd={onEdgeUpdateEnd}
        onPaneClick={() => { selectNode(null); setPaneMenu(null); window.dispatchEvent(new Event('bs:close-context-menus')) }}
        onNodeClick={(_, node) => selectNode(node.id)}
        nodeTypes={nodeTypes}
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        edgesUpdatable
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1.2} color="var(--ce-border)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(0,0,0,0.35)"
          style={{ background: 'var(--bg-primary, #0b1020)' }}
          nodeColor="var(--ce-border, #1f2937)"
          nodeStrokeColor="var(--ce-border, #1f2937)"
        />
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

      {edgeMenu && (
        <ContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          onClose={() => setEdgeMenu(null)}
          items={[
            { id: 'info', label: edgeMenu.label, disabled: true },
            { separator: true },
            { id: 'remove', label: 'Remove connection', danger: true, onSelect: () => removeEdge(edgeMenu.edgeId) },
          ]}
        />
      )}

      {paneMenu && (() => {
        const menu = buildBlockMenuItems(paneMenu.x, paneMenu.y)
        return (
          <ContextMenu
            x={paneMenu.x}
            y={paneMenu.y}
            onClose={() => setPaneMenu(null)}
            items={menu.items}
            searchable={menu.searchable}
          />
        )
      })()}
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
