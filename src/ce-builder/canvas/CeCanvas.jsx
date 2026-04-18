import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useCeBuilderStore } from "../store/ceBuilderStore.js";
import { getBlockConfig } from "../blocks/registry.js";
import CeWorkflowBlock from "./CeWorkflowBlock.jsx";

// Ported from apps/sim/app/workspace/[workspaceId]/w/[workflowId]/workflow.tsx
// The canvas keeps Sim's key configuration:
//   - snap grid [10, 10]
//   - SmoothStep connection line
//   - Partial selection mode for multi-select
//   - minZoom 0.2 / maxZoom 4
//   - attribution hidden via proOptions

// Intentionally NOT named "default" — ReactFlow ships default styling for
// nodeTypes.default (`.react-flow__node-default`) that paints a dark
// #1a192b border around any node matching the type name "default". Using a
// custom key sidesteps that collision.
const nodeTypes = { ceBlock: CeWorkflowBlock };

function toNodes(blocks) {
  return Object.values(blocks).map((b) => ({
    id: b.id,
    type: "ceBlock",
    position: b.position,
    data: { type: b.type },
    selectable: true,
  }));
}

function toEdges(edges) {
  return edges.map((e) => ({
    ...e,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  }));
}

export default function CeCanvas({ onDropBlock }) {
  const storeBlocks = useCeBuilderStore((s) => s.blocks);
  const storeEdges = useCeBuilderStore((s) => s.edges);
  const updateBlockPosition = useCeBuilderStore((s) => s.updateBlockPosition);
  const addEdge = useCeBuilderStore((s) => s.addEdge);
  const removeEdge = useCeBuilderStore((s) => s.removeEdge);
  const removeBlock = useCeBuilderStore((s) => s.removeBlock);
  const setSelectedBlock = useCeBuilderStore((s) => s.setSelectedBlock);
  const selectedBlockId = useCeBuilderStore((s) => s.selectedBlockId);

  const nodesFromStore = useMemo(() => toNodes(storeBlocks), [storeBlocks]);
  const edgesFromStore = useMemo(() => toEdges(storeEdges), [storeEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(nodesFromStore);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesFromStore);

  useEffect(() => {
    setNodes((prev) => {
      // preserve selection state while rebuilding
      const selectedIds = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return nodesFromStore.map((n) => ({ ...n, selected: selectedIds.has(n.id) }));
    });
  }, [nodesFromStore, setNodes]);

  useEffect(() => {
    setEdges(edgesFromStore);
  }, [edgesFromStore, setEdges]);

  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/ce-block-type");
      if (!type) return;
      const config = getBlockConfig(type);
      if (!config) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onDropBlock?.(config, position);
    },
    [screenToFlowPosition, onDropBlock]
  );

  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      for (const c of changes) {
        if (c.type === "position" && c.position && !c.dragging) {
          updateBlockPosition(c.id, c.position);
        }
        if (c.type === "remove") {
          removeBlock(c.id);
        }
        if (c.type === "select") {
          if (c.selected) setSelectedBlock(c.id);
          else if (selectedBlockId === c.id) setSelectedBlock(null);
        }
      }
    },
    [onNodesChange, updateBlockPosition, removeBlock, setSelectedBlock, selectedBlockId]
  );

  const handleEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      for (const c of changes) {
        if (c.type === "remove") removeEdge(c.id);
      }
    },
    [onEdgesChange, removeEdge]
  );

  const handleConnect = useCallback(
    (conn) => {
      addEdge({
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle || null,
        targetHandle: conn.targetHandle || null,
      });
    },
    [addEdge]
  );

  return (
    <div ref={wrapperRef} className="ce-canvas-root" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        }}
        selectionMode={SelectionMode.Partial}
        snapToGrid
        snapGrid={[10, 10]}
        minZoom={0.2}
        maxZoom={4}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap pannable zoomable position="bottom-left" />
      </ReactFlow>
    </div>
  );
}
