import  { useMemo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import ReactFlow, { Background, Controls, Handle, Position, MarkerType, useNodesState, useEdgesState } from "reactflow";
import "reactflow/dist/style.css";

const COLORS = [
    { bg: "#f3e8ff", color: "#6b21a8", border: "#e9d5ff" }, // purple
    { bg: "#fce7f3", color: "#be185d", border: "#fbcfe8" }, // pink
    { bg: "#e0e7ff", color: "#4338ca", border: "#c7d2fe" }, // indigo
    { bg: "#dcfce7", color: '#15803d', border: '#bbf7d0' }, // green
    { bg: "#fef3c7", color: '#b45309', border: '#fde68a' }, // amber
    { bg: "#e0f2fe", color: '#0369a1', border: '#bae6fd' }, // sky
];

const DARK_COLORS = [
    { bg: "rgba(99,102,241,0.14)", color: "#c4b5fd", border: "rgba(99,102,241,0.28)" },   // indigo
    { bg: "rgba(236,72,153,0.12)", color: "#f9a8d4", border: "rgba(236,72,153,0.26)" },   // pink
    { bg: "rgba(56,189,248,0.12)", color: "#7dd3fc", border: "rgba(56,189,248,0.26)" },   // sky
    { bg: "rgba(16,185,129,0.12)", color: "#6ee7b7", border: "rgba(16,185,129,0.26)" },   // emerald
    { bg: "rgba(251,191,36,0.12)", color: "#fde68a", border: "rgba(251,191,36,0.24)" },   // amber
    { bg: "rgba(167,139,250,0.12)", color: "#c4b5fd", border: "rgba(167,139,250,0.26)" }, // violet
];

function useIsDarkTheme() {
    const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
    useEffect(() => {
        const el = document.documentElement;
        const cb = () => setIsDark(el.getAttribute('data-theme') === 'dark');
        const observer = new MutationObserver(cb);
        observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
}

const YamlNode = ({ data, id }) => {
    const dark = data.isDark;
    return (
        <div className={`yaml-node ${data.focus ? 'focus' : ''}`} style={{
            background: dark ? 'linear-gradient(165deg, #0d1117, #131a24)' : '#fff',
            border: `2px solid ${data.focus ? (dark ? '#38bdf8' : '#3b82f6') : data.headerTheme.border || (dark ? 'rgba(56,189,248,0.18)' : '#e2e8f0')}`,
            borderRadius: '8px',
            minWidth: '220px',
            fontSize: '12px',
            boxShadow: data.focus
                ? (dark ? '0 0 0 4px rgba(56,189,248,0.2)' : '0 0 0 4px rgba(59, 130, 246, 0.2)')
                : (dark ? '0 8px 24px rgba(0,0,0,0.55), 0 0 48px rgba(56,189,248,0.04)' : '0 2px 5px -1px rgb(0 0 0 / 0.1)'),
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        }}>
            {!data.isRoot && (
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{ width: '10px', height: '10px', background: dark ? '#1e293b' : '#cbd5e1', border: `2px solid ${dark ? 'rgba(56,189,248,0.5)' : '#fff'}`, left: '-6px', boxShadow: dark ? '0 0 6px rgba(56,189,248,0.15)' : 'none' }}
                />
            )}

            <div className="yaml-node-header" style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${data.headerTheme.border || (dark ? 'rgba(56,189,248,0.12)' : '#e2e8f0')}`,
                fontWeight: '600',
                background: data.headerTheme.bg || (dark ? 'rgba(99,102,241,0.12)' : '#f3e8ff'),
                borderTopLeftRadius: '6px',
                borderTopRightRadius: '6px',
                color: data.headerTheme.color || (dark ? '#c4b5fd' : '#6b21a8'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {data.title}
                </div>
                {data.hasObjectChildren && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (data.onToggleAllChildren) {
                                data.onToggleAllChildren(data.pointer);
                            }
                        }}
                        style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            border: `1px solid ${data.headerTheme.border || (dark ? 'rgba(56,189,248,0.3)' : '#cbd5e1')}`,
                            background: dark ? 'rgba(15,23,42,0.5)' : 'rgba(255, 255, 255, 0.4)',
                            color: data.headerTheme.color || (dark ? '#c4b5fd' : '#6b21a8'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '14px',
                            transition: 'all 0.2s',
                            boxShadow: dark ? '0 0 8px rgba(56,189,248,0.1)' : '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                        className="nodrag nopan sbuilder-node-expand-all"
                        title="Toggle all children"
                    >
                        {data.anyDirectExpanded ? '−' : '+'}
                    </button>
                )}
            </div>

            <div className="yaml-node-body" style={{ padding: '0', position: 'relative' }}>
                {data.items && data.items.length > 0 ? data.items.map((item, index) => (
                    <div
                        key={item.key}
                        className={`yaml-node-row ${data.activeContextPointer === item.pointer ? "is-active" : ""} ${data.selectedPointer === item.pointer ? "is-linked" : ""}`}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            data.onRowContextMenu?.(e, item.pointer);
                        }}
                        style={{
                        display: 'flex',
                        padding: '8px 24px 8px 12px', /* extra right padding for toggle button */
                        borderBottom: index < data.items.length - 1 ? `1px solid ${dark ? 'rgba(148,163,184,0.08)' : '#f1f5f9'}` : 'none',
                        position: 'relative',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: dark ? 'transparent' : '#ffffff'
                    }}>
                        <span style={{ color: dark ? '#67e8f9' : '#3b82f6', fontWeight: '500' }}>{item.key}:</span>

                        {item.isPrimitive ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {item.type === 'color' && (
                                    <span style={{
                                        display: 'inline-block',
                                        width: '12px',
                                        height: '12px',
                                        backgroundColor: String(item.value),
                                        borderRadius: '2px',
                                        border: `1px solid ${dark ? 'rgba(148,163,184,0.2)' : '#e2e8f0'}`
                                    }}></span>
                                )}
                                <span style={{ color: dark ? '#e2e8f0' : '#475569', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }} title={String(item.value)}>
                                    {typeof item.value === 'string' && !item.type === 'color' && item.value.startsWith('#')
                                        ? item.value
                                        : (String(item.value).length > 25 ? String(item.value).substring(0, 25) + '...' : String(item.value))}
                                </span>
                            </div>
                        ) : (
                            <span style={{ color: dark ? '#94a3b8' : '#64748b', fontSize: '11px' }}>
                                {item.type === 'array' ? `[${item.length} items]` : `{${item.length} keys}`}
                            </span>
                        )}

                        {!item.isPrimitive && (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (data.onToggleChild) {
                                            data.onToggleChild(item.pointer);
                                        }
                                    }}
                                    style={{
                                        position: 'absolute',
                                        right: '-10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        border: `1px solid ${dark ? 'rgba(56,189,248,0.35)' : '#cbd5e1'}`,
                                        background: dark ? 'linear-gradient(135deg, #1e293b, #0f172a)' : '#f8fafc',
                                        color: dark ? '#67e8f9' : '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        lineHeight: '1',
                                        padding: '0 0 2px 0',
                                        zIndex: 10,
                                        boxShadow: dark ? '0 0 8px rgba(56,189,248,0.1)' : '0 1px 2px rgba(0,0,0,0.05)'
                                    }}
                                    className="nodrag nopan"
                                    title={item.expanded ? "Collapse" : "Expand"}
                                >
                                    {item.expanded ? '−' : '+'}
                                </button>
                                <Handle
                                    type="source"
                                    position={Position.Right}
                                    id={item.key}
                                    style={{
                                        width: '10px',
                                        height: '10px',
                                        background: dark ? '#1e293b' : '#cbd5e1',
                                        border: `2px solid ${dark ? 'rgba(56,189,248,0.5)' : '#fff'}`,
                                        right: '-6px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        opacity: item.expanded ? 1 : 0
                                    }}
                                />
                            </>
                        )}
                    </div>
                )) : (
                    <div style={{ padding: '8px 12px', color: dark ? '#64748b' : '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>Empty</div>
                )}
            </div>
        </div>
    );
};

// Layout configurations
const X_OFFSET = 450;
const Y_OFFSET = 180;

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function encodePointerSegment(segment) {
    return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

function joinPointer(parentPointer, segment) {
    if (!parentPointer || parentPointer === "/") {
        return `/${encodePointerSegment(segment)}`;
    }
    return `${parentPointer}/${encodePointerSegment(segment)}`;
}


export default function SemanticYamlReactFlow({
    semanticTree,
    expandedPointers,
    onTogglePointer,
    onToggleNodeChildren,
    selectedPointer,
    activeContextPointer,
    onRowContextMenu,
    onNodeContextMenu,
    onNodeClick,
    onPaneClick,
    onPaneContextMenu,
    viewport,
    onViewportChange,
    onNodeDoubleClick
}) {
    const [nodes, setNodes, onNodesChangeCore] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const isDark = useIsDarkTheme();
    const nodePositionsRef = useRef(new Map());
    const reactFlowInstanceRef = useRef(null);
    const lastAutoPanPointerRef = useRef("");

    const onNodesChange = useCallback((changes) => {
        changes.forEach((change) => {
            if ((change.type === "position" || change.type === "dimensions") && change.position) {
                nodePositionsRef.current.set(change.id, change.position);
            }
        });
        onNodesChangeCore(changes);
    }, [onNodesChangeCore]);

    const nodeTypes = useMemo(() => ({ yamlNode: YamlNode }), []);

    const generateGraph = useCallback((rootValue) => {
        if (!rootValue || typeof rootValue !== 'object') {
            setNodes([]);
            setEdges([]);
            return;
        }

        const newNodes = [];
        const newEdges = [];

        const buildLayoutTree = (obj, title, pointer, depth, parentId, sourceHandleId, colorIndex) => {
            const kind = Array.isArray(obj) ? "array" : isPlainObject(obj) ? "object" : "value";
            if (kind === "value") return null;

            const id = pointer || "/";
            const keys = Object.keys(obj);
            const items = [];
            const childrenToProcess = [];

            keys.forEach((key) => {
                const val = obj[key];
                const isObj = val !== null && typeof val === 'object';
                const childPointer = joinPointer(id, key);

                if (isObj) {
                    const isArr = Array.isArray(val);
                    const numItems = isArr ? val.length : Object.keys(val).length;
                    items.push({
                        key: String(key),
                        isPrimitive: false,
                        type: isArr ? 'array' : 'object',
                        length: numItems,
                        pointer: childPointer,
                        expanded: expandedPointers.has(childPointer)
                    });
                    childrenToProcess.push({ childObj: val, childKey: String(key), childPointer });
                } else {
                    const valStr = String(val);
                    const isColor = valStr.startsWith('#') && (valStr.length === 4 || valStr.length === 7);
                    items.push({
                        key: String(key),
                        isPrimitive: true,
                        value: val,
                        type: isColor ? 'color' : typeof val,
                        pointer: childPointer
                    });
                }
            });

            const ownHeight = items.length === 0 ? 80 : 40 + (items.length * 35) + 20;
            const hasObjectChildren = childrenToProcess.length > 0;
            let allDirectExpanded = hasObjectChildren;
            let anyDirectExpanded = false;
            const childrenList = [];
            let childrenSubtreeHeight = 0;

            childrenToProcess.forEach(({ childObj, childKey, childPointer }, i) => {
                if (expandedPointers.has(childPointer)) {
                    anyDirectExpanded = true;
                    const childNode = buildLayoutTree(
                        childObj,
                        kind === "array" ? `${title}[${childKey}]` : childKey,
                        childPointer,
                        depth + 1,
                        id,
                        childKey,
                        colorIndex + i + 1
                    );
                    if (childNode) {
                        childrenList.push(childNode);
                        childrenSubtreeHeight += childNode.subtreeHeight;
                    }
                } else {
                    allDirectExpanded = false;
                }
            });

            if (childrenList.length > 0) {
                childrenSubtreeHeight += (childrenList.length - 1) * 60; // 60px gap
            }

            const subtreeHeight = Math.max(ownHeight, childrenSubtreeHeight);

            return {
                id, title, pointer, depth, parentId, sourceHandleId, colorIndex,
                items, hasObjectChildren, allDirectExpanded, anyDirectExpanded, ownHeight, subtreeHeight, childrenList
            };
        };

        const assignCoordinates = (node, nodeCenterY) => {
            const yOffset = nodeCenterY - (node.ownHeight / 2);
            const palette = isDark ? DARK_COLORS : COLORS;
            const theme = palette[node.colorIndex % palette.length];

            const position = { x: node.depth * X_OFFSET, y: yOffset };
            const persisted = nodePositionsRef.current.get(node.id);

            newNodes.push({
                id: node.id,
                type: 'yamlNode',
                position: persisted || position,
                data: {
                    title: node.title,
                    items: node.items,
                    isRoot: node.depth === 0,
                    headerTheme: theme,
                    pointer: node.pointer,
                    hasObjectChildren: node.hasObjectChildren,
                    allDirectExpanded: node.allDirectExpanded,
                    anyDirectExpanded: node.anyDirectExpanded,
                    onToggleChild: onTogglePointer,
                    onToggleAllChildren: (pointer) => onToggleNodeChildren?.(pointer),
                    onRowContextMenu: (event, pointer) => onRowContextMenu?.(event, pointer),
                    focus: selectedPointer === node.id,
                    selectedPointer,
                    activeContextPointer,
                    isDark
                },
                depth: node.depth
            });

            if (node.parentId) {
                newEdges.push({
                    id: `e-${node.parentId}-${node.id}`,
                    source: node.parentId,
                    target: node.id,
                    sourceHandle: node.sourceHandleId,
                    type: 'smoothstep',
                    animated: false,
                    style: { stroke: isDark ? 'rgba(56,189,248,0.3)' : '#cbd5e1', strokeWidth: 1.5, borderRadius: 0 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#38bdf8' : '#ca8a04', width: 12, height: 12 }
                });
            }

            const totalChildrenHeight = node.childrenList.reduce((acc, c) => acc + c.subtreeHeight, 0) +
                (node.childrenList.length > 0 ? (node.childrenList.length - 1) * 60 : 0);

            let currentChildTop = nodeCenterY - (totalChildrenHeight / 2);

            node.childrenList.forEach((child) => {
                const childCenterY = currentChildTop + (child.subtreeHeight / 2);
                assignCoordinates(child, childCenterY);
                currentChildTop += child.subtreeHeight + 60;
            });
        };

        const layoutTree = buildLayoutTree(rootValue, 'semantic-layer.yaml', "/", 0, null, null, 0);
        if (layoutTree) {
            assignCoordinates(layoutTree, 0);
        }

        setNodes(newNodes);
        setEdges(newEdges);

    }, [semanticTree, expandedPointers, onTogglePointer, onToggleNodeChildren, onRowContextMenu, activeContextPointer, isDark]);

    useEffect(() => {
        generateGraph(semanticTree);
    }, [semanticTree, expandedPointers, generateGraph]);

    useEffect(() => {
        setNodes((prev) => prev.map((n) => ({
            ...n,
            data: { ...n.data, focus: selectedPointer === n.id },
        })));
    }, [selectedPointer, setNodes]);

    useEffect(() => {
        if (!selectedPointer || selectedPointer === "/") {
            return;
        }
        if (lastAutoPanPointerRef.current === selectedPointer) {
            return;
        }
        const instance = reactFlowInstanceRef.current;
        if (!instance) {
            return;
        }
        const node = nodes.find((n) => n.id === selectedPointer);
        if (!node) {
            return;
        }

        const width = Number(node?.measured?.width || node?.width || 240);
        const height = Number(node?.measured?.height || node?.height || 120);
        const centerX = Number(node.position?.x || 0) + width / 2;
        const centerY = Number(node.position?.y || 0) + height / 2;

        instance.setCenter(centerX, centerY, {
            duration: 260,
            zoom: Number(viewport?.zoom || 1),
        });
        lastAutoPanPointerRef.current = selectedPointer;
    }, [selectedPointer, nodes, viewport?.zoom]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={(instance) => {
                reactFlowInstanceRef.current = instance;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeContextMenu={onNodeContextMenu}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onMove={(e, v) => onViewportChange?.(v)}
            minZoom={0.01}
            maxZoom={100}
            translateExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
            nodeExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
        >
            <Background gap={22} size={1} />
            <Controls showInteractive />
        </ReactFlow>
    );
}
