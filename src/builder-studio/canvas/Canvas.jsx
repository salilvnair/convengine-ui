/**
 * ReactFlow canvas — mirrors sim/apps/sim/app/workspace/[workspaceId]/w/[workflowId]/workflow.tsx.
 *
 * Supports drag-drop from the BlockPalette (via HTML5 DnD), pan/zoom,
 * minimap, background, and click-to-select for the inspector.
 *
 * Keyboard:
 *   - Delete / Backspace  → remove selected node
 *   - ⌘D / Ctrl-D         → duplicate selected node
 *   - ⌘B / Ctrl-B         → toggle disable/enable (ComfyUI-style)
 * (Both are suppressed while typing inside inputs/textareas/contentEditable.)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow, updateEdge } from 'reactflow'
import 'reactflow/dist/style.css'
import { useWorkflowStore } from '../stores/workflow-store'
import { DeployIcon, PlayIcon } from '../components/icons'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useTabsStore } from '../stores/tabs-store'
import { getBlock, getAllBlocks, CATEGORY_LABELS, CATEGORY_ORDER, groupBlocksByCategory } from '../blocks/registry'
import { isTypeCompatible, resolvePortType, setBlockResolver, getTypeColor } from '../panel/io-registry'
import WorkflowNode from './WorkflowNode'
import GradientEdge from './GradientEdge'
import ConfirmModal from '../components/ConfirmModal'
import ContextMenu from '../sidenav/ContextMenu'
import ImportWorkflowModal from '../components/ImportWorkflowModal'
import { parseImportedWorkflowJSON } from '../utils/import-workflow'
import { EDGE as EDGE_CONFIG } from './canvas-visual.config'

const nodeTypes = { builderBlock: WorkflowNode }
const edgeTypes = { gradient: GradientEdge }

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
  const { screenToFlowPosition, fitView, zoomTo, setNodes: rfSetNodes } = useReactFlow()
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnect = useWorkflowStore((s) => s.onConnect)
  const addNode = useWorkflowStore((s) => s.addNode)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const removeNodes = useWorkflowStore((s) => s.removeNodes)
  const removeEdge = useWorkflowStore((s) => s.removeEdge)
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode)
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes)
  const beginRename = useWorkflowStore((s) => s.beginRename)
  const moveNodeBy = useWorkflowStore((s) => s.moveNodeBy)
  const moveNodesBy = useWorkflowStore((s) => s.moveNodesBy)
  const setSelectedNodeIds = useWorkflowStore((s) => s.setSelectedNodeIds)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds)
  const activeEdgeIds = useWorkflowStore((s) => s.activeEdgeIds)
  const completedNodeIds = useWorkflowStore((s) => s.completedNodeIds)
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)
  const activeWorkflow = useWorkspaceStore((s) => {
    const wf = s.workflows?.find((w) => w.id === s.activeWorkflowId)
    return wf || null
  })
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const [pendingDelete, setPendingDelete] = useState(null) // { ids[], titles[] } | null
  const [edgeMenu, setEdgeMenu] = useState(null) // { x, y, edgeId } | null
  const [paneMenu, setPaneMenu] = useState(null) // { x, y } | null
  const showMinimap = useWorkflowStore((s) => s.showMinimap)
  const canvasConfig = useWorkflowStore((s) => s.canvasConfig)
  const edgeUpdateSuccessful = useRef(true)

  // ── JSON drag-drop import state ──────────────────────────────────────────
  const teams = useWorkspaceStore((s) => s.teams)
  const importWorkflow = useWorkspaceStore((s) => s.importWorkflow)
  const openWorkflowTab = useTabsStore((s) => s.openWorkflowTab)
  const [jsonDropActive, setJsonDropActive] = useState(false) // overlay shown while dragging a JSON file
  const [jsonDropPending, setJsonDropPending] = useState(null) // parsed workflow waiting for team pick
  const [jsonDropError, setJsonDropError] = useState(null)
  const jsonDropDepth = useRef(0) // track nested dragenter/leave for overlay visibility

  // Wire up block resolver for io-registry (avoids circular imports)
  useEffect(() => { setBlockResolver(getBlock) }, [])

  // Listen for multi-delete requests fired from WorkflowNode context menu
  useEffect(() => {
    const handler = (e) => {
      const ids = e.detail?.ids
      if (!ids?.length) return
      setPendingDelete({ ids, titles: ids.map((id) => nodesById[id]?.data?.title || id) })
    }
    window.addEventListener('bs:multi-delete', handler)
    return () => window.removeEventListener('bs:multi-delete', handler)
  }, [nodesById])

  // ─── Strict type-compatible connections (ComfyUI-style) ────────────────
  const [connectingFrom, setConnectingFrom] = useState(null) // { nodeId, handleId, handleType }

  const isValidConnection = useCallback((connection) => {
    const { source, sourceHandle, target, targetHandle } = connection
    if (source === target) return false
    const store = useWorkflowStore.getState()
    const srcType = resolvePortType(source, sourceHandle, 'source', store.subBlockValues, store.nodes)
    const tgtType = resolvePortType(target, targetHandle, 'target', store.subBlockValues, store.nodes)
    return isTypeCompatible(srcType, tgtType)
  }, [])

  const onConnectStart = useCallback((_, params) => {
    setConnectingFrom({ nodeId: params.nodeId, handleId: params.handleId, handleType: params.handleType })
    // Broadcast so nodes can highlight compatible handles
    const store = useWorkflowStore.getState()
    const dragType = resolvePortType(
      params.nodeId, params.handleId,
      params.handleType === 'source' ? 'source' : 'target',
      store.subBlockValues, store.nodes
    )
    window.dispatchEvent(new CustomEvent('bs:connect-drag', {
      detail: { dragging: true, nodeId: params.nodeId, handleType: params.handleType, portType: dragType }
    }))
  }, [])

  const onConnectEnd = useCallback(() => {
    setConnectingFrom(null)
    window.dispatchEvent(new CustomEvent('bs:connect-drag', { detail: { dragging: false } }))
  }, [])

  // Stable onSelectionChange — bail out when the selected id set hasn't changed.
  // Without this guard every ReactFlow render produces a new array → Zustand
  // write → re-render → onSelectionChange → infinite update loop.
  const prevSelKey = useRef('')
  const onSelectionChange = useCallback(({ nodes: sel }) => {
    const ids = sel.map((n) => n.id)
    const key = [...ids].sort().join(',')
    if (key === prevSelKey.current) return
    prevSelKey.current = key
    setSelectedNodeIds(ids)
    if (ids.length === 1) selectNode(ids[0])
    else if (ids.length === 0) selectNode(null)
  }, [setSelectedNodeIds, selectNode])

  // Edge update (drag an edge endpoint to a different handle)
  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false
  }, [])
  const onEdgeUpdate = useCallback(
    (oldEdge, newConnection) => {
      edgeUpdateSuccessful.current = true
      onEdgesChange([
        { id: oldEdge.id, type: 'reset', item: {
          ...oldEdge,
          source: newConnection.source,
          sourceHandle: newConnection.sourceHandle,
          target: newConnection.target,
          targetHandle: newConnection.targetHandle,
          animated: false,
        }},
      ])
    },
    [onEdgesChange]
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

  // ── Canvas interaction mode (pan vs rubber-band select) ──
  const canvasMode = useWorkflowStore((s) => s.canvasConfig?.mode ?? 'pan')
  const setCanvasMode = useCallback(
    (m) => useWorkflowStore.getState().setCanvasConfigValue('mode', m),
    []
  )

  // ── Pane right-click: "Add Block" menu with groups ──

  /* Add-block icon (plus in circle) — teal */
  function AddBlockIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" stroke="#22d3ee" /><path d="M12 8v8m-4-4h8" stroke="#5eead4" />
      </svg>
    )
  }

  /* Pan / Select mode icons */
  function HandIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 11V6a2 2 0 0 0-4 0v5"/>
        <path d="M14 10V4a2 2 0 0 0-4 0v6"/>
        <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
        <path d="M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-1.1 0-2-.9-2-2v-4"/>
        <path d="M6 14a2 2 0 0 1 2-2h.5"/>
      </svg>
    )
  }
  function SelectCursorIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        <path d="m13 13 6 6"/>
      </svg>
    )
  }

  /* Action icons for context menu — indigo layers */
  function ActionsIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#818cf8"/><path d="M2 17l10 5 10-5" stroke="#c084fc"/><path d="M2 12l10 5 10-5" stroke="#a78bfa"/>
      </svg>
    )
  }
  const RunIcon = PlayIcon
  function SaveIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#818cf8" fill="#818cf8" fillOpacity="0.1"/>
        <polyline points="17 21 17 13 7 13 7 21" stroke="#818cf8"/><polyline points="7 3 7 8 15 8" stroke="#a5b4fc"/>
      </svg>
    )
  }
  function ExportIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#f59e0b"/>
        <polyline points="7 10 12 15 17 10" stroke="#fbbf24"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fbbf24"/>
      </svg>
    )
  }
  function DisconnectAllIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18" stroke="#f87171"/><path d="m6 6 12 12" stroke="#f87171"/>
      </svg>
    )
  }
  function FitViewIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" stroke="currentColor"/><path d="M21 8V5a2 2 0 0 0-2-2h-3" stroke="currentColor"/>
        <path d="M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor"/><path d="M16 21h3a2 2 0 0 0 2-2v-3" stroke="currentColor"/>
      </svg>
    )
  }
  function ZoomResetIcon({ className }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" stroke="currentColor"/><path d="m21 21-4.3-4.3" stroke="currentColor"/>
        <path d="M8 11h6" stroke="currentColor"/><path d="M11 8v6" stroke="currentColor"/>
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
      iconColor: b.bgColor || null,
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
        {
          id: 'mode-toggle',
          label: canvasMode === 'pan' ? 'Switch to Select mode (V)' : 'Switch to Pan mode (H)',
          icon: canvasMode === 'pan' ? SelectCursorIcon : HandIcon,
          shortcut: canvasMode === 'pan' ? 'V' : 'H',
          onSelect: () => setCanvasMode(canvasMode === 'pan' ? 'select' : 'pan'),
        },
        { separator: true },
        { id: 'add-block-header', label: 'Add Block', icon: AddBlockIcon, isHeader: true },
        { separator: true },
        ...children,
        { separator: true },
        { id: 'actions-header', label: 'Actions', icon: ActionsIcon, isHeader: true },
        { separator: true },
        {
          compactRow: true,
          id: 'actions-row',
          items: [
            {
              id: 'action-run', label: 'Run', icon: RunIcon, iconColor: '#22c55e', disabled: nodes.length < 2 || !activeWorkflow,
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
              disabled: nodes.length < 2,
              onSelect: () => {
                if (!activeWorkflow) return
                // Strip ReactFlow runtime props from nodes/edges before export
                // so the file matches demo-workflow.json shape exactly.
                const cleanNodes = nodes.map(({ width, height, dragging, selected, positionAbsolute, ...n }) => n)
                const cleanEdges = edges.map(({ selected, ...e }) => e)
                const exportData = {
                  _comment: `Exported from ConvEngine Agent Builder Studio — ${new Date().toISOString()}`,
                  workflow: {
                    id:             activeWorkflow.id,
                    name:           activeWorkflow.name,
                    teamId:         activeWorkflow.teamId || null,
                    nodes:          cleanNodes,
                    edges:          cleanEdges,
                    subBlockValues,
                    createdAt:      activeWorkflow.createdAt || new Date().toISOString(),
                  },
                }
                const json = JSON.stringify(exportData, null, 2)
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
            {
              id: 'action-fit', label: 'Fit View', icon: FitViewIcon, shortcut: '⌘F',
              onSelect: () => fitView({ padding: 0.15, duration: 200 }),
            },
            {
              id: 'action-zoom-reset', label: 'Reset Zoom', icon: ZoomResetIcon, shortcut: '⌘R',
              onSelect: () => zoomTo(1, { duration: 200 }),
            },
            {
              id: 'action-disconnect-all', label: 'Disconnect All Edges', icon: DisconnectAllIcon,
              iconColor: '#f87171', danger: true,
              disabled: edges.length === 0,
              onSelect: () => useWorkflowStore.getState().disconnectAll(),
            },
          ],
        },
      ],
    }
  }, [addNode, screenToFlowPosition, existingTypes, activeWorkflow, nodes, edges, subBlockValues, canvasMode, setCanvasMode])

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
      const isActive = activeSet.has(e.id)
      const isDone = !isActive && doneSet.has(e.source) && doneSet.has(e.target)
      if (isActive) cls.push('bs-edge-flowing')
      else if (isDone) cls.push('bs-edge-done')
      // Branch-semantic classes (their CSS !important stroke overrides inline)
      const hasBranchClass = e.sourceHandle === 'true' || e.sourceHandle === 'false'
        || e.sourceHandle === 'else' || e.sourceHandle === 'default'
        || e.sourceHandle?.startsWith('case_') || e.sourceHandle?.startsWith('branch_')
      if (e.sourceHandle === 'true') cls.push('bs-edge-true')
      else if (e.sourceHandle === 'false') cls.push('bs-edge-false')
      else if (e.sourceHandle === 'else' || e.sourceHandle === 'default') cls.push('bs-edge-else')
      else if (e.sourceHandle?.startsWith('case_')) cls.push('bs-edge-case')
      else if (e.sourceHandle?.startsWith('branch_')) cls.push('bs-edge-case')
      const className = [e.className, ...cls].filter(Boolean).join(' ')
      // Port-type colored stroke (skipped for branch/active/done edges — CSS handles those)
      let edgeStyle = e.style || {}
      if (!hasBranchClass && !isActive && !isDone) {
        const srcType = resolvePortType(e.source, e.sourceHandle, 'source', subBlockValues, nodes)
        const tgtType = resolvePortType(e.target, e.targetHandle, 'target', subBlockValues, nodes)
        const srcColor = EDGE_CONFIG.colorByPortType
          ? (getTypeColor(srcType)?.solid || EDGE_CONFIG.defaultColor)
          : EDGE_CONFIG.defaultColor
        const tgtColor = EDGE_CONFIG.colorByPortType
          ? (getTypeColor(tgtType)?.solid || EDGE_CONFIG.defaultColor)
          : EDGE_CONFIG.defaultColor
        const useGradient = srcColor !== tgtColor
        edgeStyle = {
          ...edgeStyle,
          ...(useGradient ? {} : { stroke: srcColor }),
          strokeWidth: EDGE_CONFIG.strokeWidth,
          opacity: EDGE_CONFIG.opacity,
        }
        return {
          ...e,
          type: useGradient ? 'gradient' : (e.type === 'gradient' ? undefined : e.type),
          data: useGradient ? { ...e.data, srcColor, tgtColor } : e.data,
          className,
          animated: false,
          style: edgeStyle,
        }
      } else if (isActive) {
        edgeStyle = { ...edgeStyle, strokeWidth: EDGE_CONFIG.strokeWidthActive, opacity: EDGE_CONFIG.opacityActive }
      }
      return {
        ...e,
        className,
        animated: isActive,
        style: edgeStyle,
      }
    })
  }, [edges, activeEdgeIds, completedNodeIds, subBlockValues, nodes])

  // ── Detect whether the drag contains a JSON file (not a block palette item) ──
  function isJsonFileDrag(e) {
    const items = e.dataTransfer?.items
    if (!items) return false
    for (const item of items) {
      if (item.kind === 'file' && (item.type === 'application/json' || item.type === '')) return true
    }
    return false
  }

  const onDragEnter = useCallback((e) => {
    if (!isJsonFileDrag(e)) return
    e.preventDefault()
    jsonDropDepth.current += 1
    if (jsonDropDepth.current === 1) setJsonDropActive(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    if (!jsonDropActive) return
    e.preventDefault()
    jsonDropDepth.current -= 1
    if (jsonDropDepth.current <= 0) { jsonDropDepth.current = 0; setJsonDropActive(false) }
  }, [jsonDropActive])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = isJsonFileDrag(e) ? 'copy' : 'move'
  }, [])

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      jsonDropDepth.current = 0
      setJsonDropActive(false)

      // ── JSON file drop ──────────────────────────────────────────────────
      const jsonFile = Array.from(e.dataTransfer?.files || []).find(
        (f) => f.name.endsWith('.json') || f.type === 'application/json'
      )
      if (jsonFile) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const result = parseImportedWorkflowJSON(ev.target.result)
          if (result.ok) {
            setJsonDropPending(result.workflow)
          } else {
            setJsonDropError(result.error)
            setTimeout(() => setJsonDropError(null), 4000)
          }
        }
        reader.readAsText(jsonFile)
        return
      }

      // ── Block palette drop ──────────────────────────────────────────────
      const blockType = e.dataTransfer.getData('application/builder-studio-block')
      if (!blockType) return
      const cfg = getBlock(blockType)
      if (!cfg) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(blockType, position, cfg)
    },
    [addNode, screenToFlowPosition]
  )

  function handleJsonDropConfirm(name, teamId) {
    if (!jsonDropPending) return
    const wf = importWorkflow(name, teamId, {
      nodes: jsonDropPending.nodes,
      edges: jsonDropPending.edges,
      subBlockValues: jsonDropPending.subBlockValues,
    })
    openWorkflowTab(wf.id, wf.name)
    setJsonDropPending(null)
  }

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
      // Block all shortcuts while a confirm dialog is open
      if (pendingDelete) return
      const meta = e.metaKey || e.ctrlKey

      // ⌘Z — Undo
      if (meta && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && !e.altKey) {
        e.preventDefault()
        useWorkflowStore.getState().undo()
        return
      }
      // ⌘⇧Z or ⌘Y — Redo
      if ((meta && e.shiftKey && (e.key === 'z' || e.key === 'Z')) || (meta && (e.key === 'y' || e.key === 'Y'))) {
        e.preventDefault()
        useWorkflowStore.getState().redo()
        return
      }

      // ⌘D — Duplicate
      if (meta && (e.key === 'd' || e.key === 'D')) {
        const multiIds = selectedNodeIds.length > 1 ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : [])
        if (!multiIds.length) return
        e.preventDefault()
        if (multiIds.length === 1) duplicateNode(multiIds[0])
        else duplicateNodes(multiIds)
        return
      }

      // ⌘B — Toggle Disable/Enable (ComfyUI-style)
      if (meta && (e.key === 'b' || e.key === 'B') && !e.shiftKey) {
        if (!selectedNodeId) return
        e.preventDefault()
        useWorkflowStore.getState().toggleDisabled(selectedNodeId)
        return
      }

      // ⌘I — Inspect selected node
      if (meta && (e.key === 'i' || e.key === 'I') && !e.shiftKey) {
        if (!selectedNodeId) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('bs:inspect-node', { detail: { nodeId: selectedNodeId } }))
        return
      }

      // ⌘C — Copy node ID
      if (meta && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
        if (!selectedNodeId) return
        e.preventDefault()
        navigator.clipboard.writeText(selectedNodeId)
        return
      }

      // ⌘R — Reset zoom to 1:1
      if (meta && (e.key === 'r' || e.key === 'R') && !e.shiftKey) {
        e.preventDefault()
        zoomTo(1, { duration: 200 })
        return
      }

      // ⌘F — Fit view
      if (meta && (e.key === 'f' || e.key === 'F') && !e.shiftKey) {
        e.preventDefault()
        fitView({ padding: 0.15, duration: 200 })
        return
      }

      // H — Pan mode, V — Select mode (Figma-style; skip if typing)
      if (!meta && !e.shiftKey && !e.altKey && e.key === 'h') { e.preventDefault(); setCanvasMode('pan'); return }
      if (!meta && !e.shiftKey && !e.altKey && e.key === 'v') { e.preventDefault(); setCanvasMode('select'); return }

      // Delete / Backspace — prompt before removing selected node(s).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const multiIds = selectedNodeIds.length > 1 ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : [])
        if (!multiIds.length) return
        e.preventDefault()
        if (multiIds.length === 1) {
          const n = nodesById[multiIds[0]]
          setPendingDelete({ ids: multiIds, titles: [n?.data?.title || n?.data?.blockType || 'this block'] })
        } else {
          setPendingDelete({ ids: multiIds, titles: multiIds.map((id) => nodesById[id]?.data?.title || nodesById[id]?.data?.blockType || id) })
        }
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
        if (selectedNodeId || selectedNodeIds.length) {
          e.preventDefault()
          selectNode(null)
          setSelectedNodeIds([])
          rfSetNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
        }
        return
      }

      // Arrow keys — nudge position (10px; 50px with Shift)
      if (e.key.startsWith('Arrow')) {
        const multiIds = selectedNodeIds.length > 1 ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : [])
        if (!multiIds.length) return
        const step = e.shiftKey ? 50 : 10
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (dx || dy) {
          e.preventDefault()
          if (multiIds.length === 1) moveNodeBy(multiIds[0], dx, dy)
          else moveNodesBy(multiIds, dx, dy)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNodeId, selectedNodeIds, pendingDelete, removeNode, duplicateNode, duplicateNodes, beginRename, moveNodeBy, moveNodesBy, selectNode, fitView, zoomTo])

  // Fit view after zustand persist rehydrates nodes (async on refresh).
  // `fitView` as a static prop fires before rehydration completes, so we
  // watch the node count and call it imperatively once nodes are present.
  const hasFitOnLoad = useRef(false)
  useEffect(() => {
    if (hasFitOnLoad.current) return
    if (nodes.length === 0) return
    // Small delay lets ReactFlow measure node dimensions first
    const t = setTimeout(() => {
      fitView({ padding: 0.15, duration: 250 })
      hasFitOnLoad.current = true
    }, 80)
    return () => clearTimeout(t)
  }, [nodes.length, fitView])

  return (
    <div
      ref={wrapperRef}
      className={`bs-canvas${jsonDropActive ? ' bs-canvas-json-drag' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* ── JSON drop overlay ── */}
      {jsonDropActive && (
        <div className="bs-json-drop-overlay">
          <div className="bs-json-drop-target">
            <div className="bs-json-drop-icon">
              <svg viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" className="bs-json-drop-ring"/>
                <path d="M32 20v18M24 30l8 10 8-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 44h20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="bs-json-drop-label">Drop workflow JSON</div>
            <div className="bs-json-drop-sub">ConvEngine builder studio export</div>
          </div>
        </div>
      )}
      {/* ── JSON parse error toast ── */}
      {jsonDropError && (
        <div className="bs-json-drop-error" onClick={() => setJsonDropError(null)}>
          ⚠ {jsonDropError}
        </div>
      )}
      {/* ── Pan / Select mode toggle (top-left) ── */}
      <div
        className="bs-canvas-mode-toggle"
        style={{
          '--mode-btn-size': `${canvasConfig?.modeSwitcherBtnSize ?? 22}px`,
          '--mode-icon-size': `${canvasConfig?.modeSwitcherIconSize ?? 12}px`,
        }}
      >
        <button
          className={`bs-mode-btn ${canvasMode === 'select' ? 'is-active' : ''}`}
          title="Select mode — drag to rubber-band select (V)"
          onClick={() => setCanvasMode('select')}
        >
          <SelectCursorIcon />
        </button>
        <button
          className={`bs-mode-btn ${canvasMode === 'pan' ? 'is-active' : ''}`}
          title="Pan mode — drag to pan the canvas (H)"
          onClick={() => setCanvasMode('pan')}
        >
          <HandIcon />
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={displayedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgesDelete={onEdgesDelete}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeUpdateStart={onEdgeUpdateStart}
        onEdgeUpdate={onEdgeUpdate}
        onEdgeUpdateEnd={onEdgeUpdateEnd}
        onPaneClick={() => { selectNode(null); setPaneMenu(null); window.dispatchEvent(new Event('bs:close-context-menus')) }}
        onNodeClick={(_, node) => selectNode(node.id)}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        multiSelectionKeyCode={['Meta', 'Control']}
        selectionMode="partial"
        deleteKeyCode={null}
        panOnDrag={canvasMode === 'pan' ? true : [1, 2]}
        selectionOnDrag={canvasMode === 'select'}
        edgesUpdatable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1.2} color="var(--ce-border)" />
        <Controls showInteractive={false} />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(0,0,0,0.35)"
            style={{ background: 'var(--bg-primary, #0b1020)' }}
            nodeColor="var(--ce-border, #1f2937)"
            nodeStrokeColor="var(--ce-border, #1f2937)"
          />
        )}
      </ReactFlow>

      {pendingDelete && (() => {
        const multi = pendingDelete.ids.length > 1
        return (
          <ConfirmModal
            title={multi ? `Delete ${pendingDelete.ids.length} blocks?` : 'Delete block?'}
            message={
              multi
                ? `${pendingDelete.ids.length} selected blocks and all their connections will be removed. This cannot be undone.`
                : `"${pendingDelete.titles[0]}" and all its connections will be removed. This cannot be undone.`
            }
            confirmLabel={multi ? `Delete ${pendingDelete.ids.length} blocks` : 'Delete block'}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => {
              if (pendingDelete.ids.length === 1) removeNode(pendingDelete.ids[0])
              else removeNodes(pendingDelete.ids)
              setPendingDelete(null)
            }}
          />
        )
      })()}

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

      {/* ── Multi-select floating HUD ── */}
      {selectedNodeIds.length > 1 && (
        <div className="bs-multiselect-hud">
          <span className="bs-multiselect-hud-count">{selectedNodeIds.length} selected</span>
          <div className="bs-multiselect-hud-divider" />
          <button
            className="bs-multiselect-hud-btn"
            title="Duplicate selected (⌘D)"
            onClick={() => duplicateNodes(selectedNodeIds)}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Duplicate
          </button>
          <button
            className="bs-multiselect-hud-btn bs-multiselect-hud-btn-danger"
            title="Delete selected (⌫)"
            onClick={() => setPendingDelete({ ids: selectedNodeIds, titles: selectedNodeIds.map((id) => nodesById[id]?.data?.title || id) })}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Delete
          </button>
          <div className="bs-multiselect-hud-divider" />
          <button
            className="bs-multiselect-hud-btn bs-multiselect-hud-btn-muted"
            title="Deselect all (Esc)"
            onClick={() => {
              selectNode(null)
              setSelectedNodeIds([])
              rfSetNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
            }}
          >
            ✕ Deselect
          </button>
        </div>
      )}

      {/* ── Import workflow modal (triggered by JSON file drop) ── */}
      {jsonDropPending && (
        <ImportWorkflowModal
          teams={teams}
          defaultName={jsonDropPending.name}
          defaultTeamId={teams[0]?.id}
          onCancel={() => setJsonDropPending(null)}
          onImport={handleJsonDropConfirm}
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
