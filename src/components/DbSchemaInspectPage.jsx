import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, useEdgesState, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import { generateDbSchemaSeed, inspectDbSchema } from "../api/convengine.api.js";
import CodeBlockToggle from "./convengine/CodeBlockToggle";

function boolValue(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  const normalized = String(value).toLowerCase();
  return normalized === "true" || normalized === "t" || normalized === "1";
}

function toTagAuto(tableName, columnName) {
  return `${tableName || ""},${columnName || ""}`
    .split(/[_\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 8)
    .join(", ");
}

function groupColumnsByTable(columns = []) {
  const grouped = new Map();
  for (const c of columns) {
    const table = String(c.table_name || "");
    if (!table) continue;
    if (!grouped.has(table)) grouped.set(table, []);
    grouped.get(table).push(c);
  }
  return grouped;
}

function inferRole(row) {
  const isPk = boolValue(row.is_primary_key);
  const isFk = boolValue(row.is_foreign_key);
  if (isPk) return "pk";
  if (isFk) return "fk";
  return "column";
}

function SqlCodeBlock({ code }) {
  if (!code) return null;
  return (
    <CodeBlockToggle
      title="Schema & Rules SQL"
      language="sql"
      packagePath="seed: ce_mcp_schema_knowledge"
      filePath="CONNECTION_TRANSFER dml entries style"
      defaultOpen
    >
      {String(code || "")}
    </CodeBlockToggle>
  );
}

function TableNode({ data }) {
  const stats = data?.stats || { columns: 0, indexes: 0, sequences: 0, triggers: 0, out: 0, incoming: 0 };
  const pkFk = data?.pkFk || { pk: [], fk: [] };
  const tableName = data?.tableName || "";
  return (
    <div className={`db-schema-table-tile ${data?.active ? "active" : ""} ${data?.focus ? "focus" : ""}`} onClick={() => data?.onSelect?.(tableName)} role="button" tabIndex={0}>
      <Handle type="target" position={Position.Left} className="db-schema-handle" />
      <Handle type="source" position={Position.Right} className="db-schema-handle" />
      <div className="db-schema-table-tile-head">
        <span className="db-schema-table-tile-dot" />
        <div className="db-schema-table-tile-title">{tableName}</div>
      </div>
      <div className="db-schema-table-tile-body">
        <div className="db-schema-table-tile-chips">
          <span className="db-schema-tile-chip">cols {stats.columns}</span>
          <span className="db-schema-tile-chip">idx {stats.indexes}</span>
          <span className="db-schema-tile-chip">seq {stats.sequences}</span>
          <span className="db-schema-tile-chip">trg {stats.triggers}</span>
        </div>
        <div className="db-schema-table-pkfk-wrap">
          {pkFk.pk.map((col) => <span key={`pk:${tableName}:${col}`} className="db-schema-col-chip pk">PK: {col}</span>)}
          {pkFk.fk.map((col) => <span key={`fk:${tableName}:${col}`} className="db-schema-col-chip fk">FK: {col}</span>)}
          {!pkFk.pk.length && !pkFk.fk.length ? <span className="db-schema-col-chip none">No PK/FK columns</span> : null}
        </div>
        <div className="db-schema-table-tile-sub">outgoing {stats.out} | incoming {stats.incoming}</div>
      </div>
    </div>
  );
}

export default function DbSchemaInspectPage({ query, onOpenRunDialog }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [stablePayload, setStablePayload] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [rowScope, setRowScope] = useState("TABLE"); // TABLE | ALL | FLOW
  const [generating, setGenerating] = useState(false);
  const [generatedSql, setGeneratedSql] = useState("");
  const [generateWarnings, setGenerateWarnings] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState([]);

  const matchMode = String(query?.matchMode || "REGEX").toUpperCase();
  const matchText = String(query?.prefix || "").trim();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const fetchPrefix = matchText;

    inspectDbSchema(fetchPrefix, query?.schema || "", matchMode)
      .then((data) => {
        if (!active) return;
        setPayload(data);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Schema inspection failed");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [matchMode, matchText, query?.schema]);

  const filteredPayload = useMemo(() => {
    if (!payload) return null;

    const allTables = payload.tables || [];
    const allColumns = payload.columns || [];
    const allJoins = payload.joins || [];
    const allIndexes = payload.indexes || [];
    const allSequences = payload.sequences || [];
    const allTriggers = payload.triggers || [];

    if (!matchText) {
      return {
        ...payload,
        tableCount: allTables.length,
        tables: allTables,
        columns: allColumns,
        joins: allJoins,
        indexes: allIndexes,
        sequences: allSequences,
        triggers: allTriggers,
      };
    }

    // REGEX mode now uses backend-filtered result as-is to avoid UI-side false negatives.
    if (matchMode !== "EXACT") {
      return {
        ...payload,
        tableCount: allTables.length,
        tables: allTables,
        columns: allColumns,
        joins: allJoins,
        indexes: allIndexes,
        sequences: allSequences,
        triggers: allTriggers,
      };
    }

    const exact = matchText.toLowerCase();
    const tables = allTables.filter((t) => String(t.table_name || "").toLowerCase() === exact);
    const selected = new Set(tables.map((t) => String(t.table_name)));
    return {
      ...payload,
      tableCount: tables.length,
      tables,
      columns: allColumns.filter((c) => selected.has(String(c.table_name || ""))),
      joins: allJoins.filter((j) => selected.has(String(j.source_table || "")) || selected.has(String(j.target_table || ""))),
      indexes: allIndexes.filter((i) => selected.has(String(i.table_name || ""))),
      sequences: allSequences.filter((s) => selected.has(String(s.table_name || ""))),
      triggers: allTriggers.filter((t) => selected.has(String(t.table_name || ""))),
    };
  }, [payload, matchMode, matchText]);

  useEffect(() => {
    if ((filteredPayload?.tableCount || 0) > 0) {
      setStablePayload(filteredPayload);
    }
  }, [filteredPayload]);

  const effectivePayload = useMemo(() => {
    if ((filteredPayload?.tableCount || 0) > 0) return filteredPayload;
    return stablePayload || filteredPayload;
  }, [filteredPayload, stablePayload]);

  const columnsByTable = useMemo(() => groupColumnsByTable(effectivePayload?.columns || []), [effectivePayload]);
  const tableNames = useMemo(() => {
    const fromTables = (effectivePayload?.tables || []).map((t) => String(t.table_name || "")).filter(Boolean);
    const fromColumns = Array.from(columnsByTable.keys());
    return Array.from(new Set([...fromTables, ...fromColumns]));
  }, [effectivePayload, columnsByTable]);

  const effectiveSelectedTable = useMemo(() => {
    if (selectedTable) return selectedTable;
    if (tableNames.length) return tableNames[0];
    const firstFromRows = String(allRows[0]?.tableName || "");
    return firstFromRows || "";
  }, [selectedTable, tableNames, allRows]);

  useEffect(() => {
    if (!tableNames.length) return;
    if (!selectedTable || !tableNames.includes(selectedTable)) {
      setSelectedTable(tableNames[0]);
    }
  }, [tableNames, selectedTable]);

  useEffect(() => {
    if (!selectedTable && effectiveSelectedTable) {
      setSelectedTable(effectiveSelectedTable);
    }
  }, [selectedTable, effectiveSelectedTable]);

  // Keep edits in session for current inspected dataset.
  useEffect(() => {
    const next = (effectivePayload?.columns || []).map((c, i) => {
      const tableName = String(c.table_name || "");
      const columnName = String(c.column_name || "");
      return {
        id: `${tableName}.${columnName}.${i}`,
        tableName,
        columnName,
        role: inferRole(c),
        description: `${columnName} in ${tableName}`,
        tags: toTagAuto(tableName, columnName),
      };
    });
    setAllRows(next);
    setGeneratedSql("");
    setGenerateWarnings([]);
  }, [effectivePayload]);

  const selectedMeta = useMemo(() => {
    if (!effectiveSelectedTable || !effectivePayload) {
      return { outgoing: [], incoming: [], indexes: [], sequences: [], triggers: [] };
    }
    const joins = effectivePayload.joins || [];
    const indexes = effectivePayload.indexes || [];
    const sequences = effectivePayload.sequences || [];
    const triggers = effectivePayload.triggers || [];

    return {
      outgoing: joins.filter((j) => String(j.source_table || "") === effectiveSelectedTable),
      incoming: joins.filter((j) => String(j.target_table || "") === effectiveSelectedTable),
      indexes: indexes.filter((i) => String(i.table_name || "") === effectiveSelectedTable),
      sequences: sequences.filter((s) => String(s.table_name || "") === effectiveSelectedTable),
      triggers: triggers.filter((t) => String(t.table_name || "") === effectiveSelectedTable),
    };
  }, [effectivePayload, effectiveSelectedTable]);

  const tableStats = useMemo(() => {
    const map = new Map();
    const joins = effectivePayload?.joins || [];
    const indexes = effectivePayload?.indexes || [];
    const sequences = effectivePayload?.sequences || [];
    const triggers = effectivePayload?.triggers || [];

    tableNames.forEach((tableName) => {
      const cols = columnsByTable.get(tableName) || [];
      const pk = cols.filter((c) => boolValue(c.is_primary_key)).length;
      const fk = cols.filter((c) => boolValue(c.is_foreign_key)).length;
      const out = joins.filter((j) => String(j.source_table || "") === tableName).length;
      const incoming = joins.filter((j) => String(j.target_table || "") === tableName).length;
      map.set(tableName, {
        table: tableName,
        columns: cols.length,
        pk,
        fk,
        out,
        incoming,
        indexes: indexes.filter((i) => String(i.table_name || "") === tableName).length,
        sequences: sequences.filter((s) => String(s.table_name || "") === tableName).length,
        triggers: triggers.filter((t) => String(t.table_name || "") === tableName).length,
      });
    });
    return map;
  }, [effectivePayload, tableNames, columnsByTable]);

  const showTiles = rowScope !== "FLOW";
  const showFlow = rowScope !== "TABLE";
  const showRuntimeShell = rowScope !== "TABLE";

  const visibleTableTiles = useMemo(() => {
    if (rowScope === "TABLE") {
      return effectiveSelectedTable ? [effectiveSelectedTable] : [];
    }
    if (rowScope === "ALL") {
      return tableNames;
    }
    return [];
  }, [rowScope, effectiveSelectedTable, tableNames]);

  const tablePkFk = useMemo(() => {
    const byTable = new Map();
    tableNames.forEach((tableName) => {
      const cols = columnsByTable.get(tableName) || [];
      byTable.set(tableName, {
        pk: cols.filter((c) => boolValue(c.is_primary_key)).map((c) => String(c.column_name || "")).filter(Boolean),
        fk: cols.filter((c) => boolValue(c.is_foreign_key)).map((c) => String(c.column_name || "")).filter(Boolean),
      });
    });
    return byTable;
  }, [tableNames, columnsByTable]);

  const incomingTables = useMemo(() => Array.from(new Set(
    selectedMeta.incoming
      .map((j) => String(j.source_table || ""))
      .filter((t) => t && t !== effectiveSelectedTable)
  )), [selectedMeta.incoming, effectiveSelectedTable]);

  const outgoingTables = useMemo(() => Array.from(new Set(
    selectedMeta.outgoing
      .map((j) => String(j.target_table || ""))
      .filter((t) => t && t !== effectiveSelectedTable)
  )), [selectedMeta.outgoing, effectiveSelectedTable]);

  const graphTableCount = showFlow
    ? (effectiveSelectedTable ? 1 : 0) + incomingTables.length + outgoingTables.length
    : visibleTableTiles.length;

  const nodeTypes = useMemo(() => ({ tableNode: TableNode }), []);

  const relationFlow = useMemo(() => {
    if (!effectiveSelectedTable) return { nodes: [], edges: [] };

    const inCount = incomingTables.length;
    const outCount = outgoingTables.length;
    const maxCount = Math.max(inCount, outCount, 1);
    const gapY = 220;
    const topY = 40;
    const centerY = topY + Math.floor((maxCount - 1) * gapY * 0.5);

    const makeNode = (tableName, x, y, focus = false) => ({
      id: `tbl:${tableName}`,
      type: "tableNode",
      position: { x, y },
      data: {
        tableName,
        stats: tableStats.get(tableName) || { columns: 0, indexes: 0, sequences: 0, triggers: 0, out: 0, incoming: 0 },
        pkFk: tablePkFk.get(tableName) || { pk: [], fk: [] },
        active: tableName === effectiveSelectedTable,
        focus,
        onSelect: setSelectedTable,
      },
      draggable: true,
    });

    const nodes = [];
    nodes.push(makeNode(effectiveSelectedTable, 520, centerY, true));
    incomingTables.forEach((tableName, idx) => nodes.push(makeNode(tableName, 40, topY + idx * gapY)));
    outgoingTables.forEach((tableName, idx) => nodes.push(makeNode(tableName, 1020, topY + idx * gapY)));

    const edges = [];
    incomingTables.forEach((tableName) => {
      const joins = selectedMeta.incoming.filter((j) => String(j.source_table || "") === tableName);
      const label = joins.slice(0, 2).map((j) => `${String(j.source_column || "?")} -> ${String(j.target_column || "?")}`).join(" | ");
      edges.push({
        id: `in:${tableName}->${effectiveSelectedTable}`,
        source: `tbl:${tableName}`,
        target: `tbl:${effectiveSelectedTable}`,
        type: "smoothstep",
        animated: true,
        label,
        style: { stroke: "#60a5fa", strokeWidth: 2, strokeDasharray: "7 7" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#93c5fd", width: 28, height: 28 },
        labelStyle: { fill: "#dbeafe", fontWeight: 700, fontSize: 11 },
        labelBgStyle: { fill: "rgba(37, 99, 235, 0.92)", stroke: "#93c5fd", strokeWidth: 1 },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 12,
      });
    });

    outgoingTables.forEach((tableName) => {
      const joins = selectedMeta.outgoing.filter((j) => String(j.target_table || "") === tableName);
      const label = joins.slice(0, 2).map((j) => `${String(j.source_column || "?")} -> ${String(j.target_column || "?")}`).join(" | ");
      edges.push({
        id: `out:${effectiveSelectedTable}->${tableName}`,
        source: `tbl:${effectiveSelectedTable}`,
        target: `tbl:${tableName}`,
        type: "smoothstep",
        animated: true,
        label,
        style: { stroke: "#60a5fa", strokeWidth: 2, strokeDasharray: "7 7" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#93c5fd", width: 28, height: 28 },
        labelStyle: { fill: "#dbeafe", fontWeight: 700, fontSize: 11 },
        labelBgStyle: { fill: "rgba(37, 99, 235, 0.92)", stroke: "#93c5fd", strokeWidth: 1 },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 12,
      });
    });

    return { nodes, edges };
  }, [effectiveSelectedTable, incomingTables, outgoingTables, selectedMeta.incoming, selectedMeta.outgoing, tablePkFk, tableStats]);

  const relationGraphSignature = useMemo(
    () => `${effectiveSelectedTable}|in:${incomingTables.join(",")}|out:${outgoingTables.join(",")}`,
    [effectiveSelectedTable, incomingTables, outgoingTables]
  );

  useEffect(() => {
    setFlowNodes((prev) => {
      const prevPosById = new Map(prev.map((n) => [n.id, n.position]));
      return relationFlow.nodes.map((n) => ({
        ...n,
        position: prevPosById.get(n.id) || n.position,
      }));
    });
    setFlowEdges(relationFlow.edges);
  }, [relationGraphSignature, relationFlow.nodes, relationFlow.edges, setFlowNodes, setFlowEdges]);

  const bringNodeToFront = useCallback((nodeId) => {
    setFlowNodes((prev) => prev.map((n) => ({ ...n, zIndex: n.id === nodeId ? 999 : 1 })));
  }, [setFlowNodes]);

  const renderTableCard = (tableName, mode = "normal") => {
    const stats = tableStats.get(tableName) || { columns: 0, pk: 0, fk: 0, indexes: 0, sequences: 0, triggers: 0, out: 0, incoming: 0 };
    const active = tableName === effectiveSelectedTable;
    const pkFk = tablePkFk.get(tableName) || { pk: [], fk: [] };

    return (
      <button key={`${mode}:${tableName}`} type="button" className={`db-schema-table-tile ${active ? "active" : ""} ${mode === "focus" ? "focus" : ""}`} onClick={() => setSelectedTable(tableName)}>
        <div className="db-schema-table-tile-head">
          <span className="db-schema-table-tile-dot" />
          <div className="db-schema-table-tile-title">{tableName}</div>
        </div>
        <div className="db-schema-table-tile-body">
          <div className="db-schema-table-tile-chips">
            <span className="db-schema-tile-chip">cols {stats.columns}</span>
            <span className="db-schema-tile-chip">idx {stats.indexes}</span>
            <span className="db-schema-tile-chip">seq {stats.sequences}</span>
            <span className="db-schema-tile-chip">trg {stats.triggers}</span>
          </div>
          <div className="db-schema-table-pkfk-wrap">
            {pkFk.pk.map((col) => <span key={`pk:${tableName}:${col}`} className="db-schema-col-chip pk">PK: {col}</span>)}
            {pkFk.fk.map((col) => <span key={`fk:${tableName}:${col}`} className="db-schema-col-chip fk">FK: {col}</span>)}
            {!pkFk.pk.length && !pkFk.fk.length ? <span className="db-schema-col-chip none">No PK/FK columns</span> : null}
          </div>
          <div className="db-schema-table-tile-sub">outgoing {stats.out} | incoming {stats.incoming}</div>
        </div>
      </button>
    );
  };

  const visibleRows = useMemo(() => {
    const base = rowScope === "ALL"
      ? allRows
      : allRows.filter((r) => r.tableName === effectiveSelectedTable);

    const roleRank = (role) => {
      const v = String(role || "").trim().toLowerCase();
      if (v === "pk") return 0;
      if (v === "fk") return 1;
      return 2;
    };

    return [...base].sort((a, b) => {
      const rankDiff = roleRank(a.role) - roleRank(b.role);
      if (rankDiff !== 0) return rankDiff;
      const tableDiff = String(a.tableName || "").localeCompare(String(b.tableName || ""));
      if (tableDiff !== 0) return tableDiff;
      return String(a.columnName || "").localeCompare(String(b.columnName || ""));
    });
  }, [allRows, rowScope, effectiveSelectedTable]);

  const onEditRow = (rowId, key, value) => {
    setAllRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (key === "tableName") {
          const cols = columnsByTable.get(value) || [];
          const nextColumn = cols[0]?.column_name ? String(cols[0].column_name) : "";
          return { ...r, tableName: value, columnName: nextColumn, tags: toTagAuto(value, nextColumn) };
        }
        if (key === "columnName") {
          return { ...r, columnName: value, tags: toTagAuto(r.tableName, value) };
        }
        return { ...r, [key]: value };
      })
    );
  };

  const onDeleteRow = (rowId) => {
    setAllRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const onAddRowAfter = (afterRowId) => {
    setAllRows((prev) => {
      const index = prev.findIndex((r) => r.id === afterRowId);
      const base = index >= 0 ? prev[index] : null;
      const tableName = base?.tableName || effectiveSelectedTable || tableNames[0] || "";
      const cols = columnsByTable.get(tableName) || [];
      const columnName = cols[0]?.column_name ? String(cols[0].column_name) : "";
      const nextRow = {
        id: `manual.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
        tableName,
        columnName,
        role: "column",
        description: columnName ? `${columnName} in ${tableName}` : `column in ${tableName}`,
        tags: toTagAuto(tableName, columnName),
      };
      if (index < 0) return [...prev, nextRow];
      return [...prev.slice(0, index + 1), nextRow, ...prev.slice(index + 1)];
    });
  };

  const onGenerate = async () => {
    setGenerating(true);
    setError("");
    setGenerateWarnings([]);
    try {
      const scopedRows = (rowScope === "ALL"
        ? allRows
        : allRows.filter((r) => r.tableName === effectiveSelectedTable)
      ).filter((r) => String(r.tableName || "").trim() && String(r.columnName || "").trim());

      const requestPayload = {
        prefix: query?.prefix || "",
        upsert: true,
        rows: scopedRows.map((r) => ({
          tableName: r.tableName,
          columnName: r.columnName,
          role: r.role,
          description: r.description,
          tags: r.tags,
        })),
      };
      if (query?.schema && String(query.schema).trim()) {
        requestPayload.schema = String(query.schema).trim();
      }
      const res = await generateDbSchemaSeed(requestPayload);
      setGeneratedSql(String(res?.sql || ""));
      setGenerateWarnings(Array.isArray(res?.warnings) ? res.warnings : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate SQL");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="db-schema-page">
      <div className="db-schema-toolbar">
        <div className="db-schema-toolbar-left">
          <div>
            <div className="db-schema-title-row">
              <h2>DB Schema Inspect</h2>
              <div className="db-schema-row-scope db-schema-row-scope-top">
                <button type="button" className={`db-schema-scope-btn ${rowScope === "TABLE" ? "active" : ""}`} onClick={() => setRowScope("TABLE")}>TABLE</button>
                <button type="button" className={`db-schema-scope-btn ${rowScope === "ALL" ? "active" : ""}`} onClick={() => setRowScope("ALL")}>ALL</button>
                <button type="button" className={`db-schema-scope-btn ${rowScope === "FLOW" ? "active" : ""}`} onClick={() => setRowScope("FLOW")}>FLOW</button>
              </div>
            </div>
            <p>
              schema: <b>{effectivePayload?.schema || query?.schema || "(from convengine.schema.active)"}</b> | mode: <b>{matchMode}</b> | filter: <b>{matchText || "(none)"}</b> | tables: <b>{effectivePayload?.tableCount ?? 0}</b>
            </p>
          </div>
        </div>
        <div className="db-schema-toolbar-actions">
          <button type="button" className="cache-analyze-load" onClick={onOpenRunDialog}>Run Again</button>
          <button type="button" className="cache-analyze-load" onClick={onGenerate} disabled={generating || loading || allRows.length === 0}>{generating ? "Generating..." : "Generate"}</button>
        </div>
      </div>

      {loading ? <div className="cache-analyze-error">Inspecting schema...</div> : null}
      {error ? <div className="cache-analyze-error">{error}</div> : null}
      {generateWarnings.length ? <div className="cache-analyze-error">{generateWarnings.join(" | ")}</div> : null}
      {!loading && !error && (effectivePayload?.tableCount || 0) === 0 ? (
        <div className="cache-analyze-error">
          No tables matched for filter <b>{matchText || "(empty)"}</b> in schema <b>{effectivePayload?.schema || query?.schema || "(default)"}</b> using mode <b>{matchMode}</b>.
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="db-schema-single-flow-card">
            <div className="db-schema-single-flow-head">
              <label>
                Table
                <select value={effectiveSelectedTable} onChange={(e) => setSelectedTable(e.target.value)}>
                  {tableNames.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {showRuntimeShell ? (
                <div className="db-schema-flow-meta">
                  <span className="db-schema-badge">tables {graphTableCount}</span>
                  <span className="db-schema-badge">fk out {selectedMeta.outgoing.length}</span>
                  <span className="db-schema-badge">fk in {selectedMeta.incoming.length}</span>
                </div>
              ) : null}
            </div>

            {showRuntimeShell ? (
            <div className="db-schema-runtime-shell">
              <div className="db-schema-runtime-left">
                <div className={`db-schema-runtime-canvas ${showFlow ? "flow-on" : "flow-off"}`}>
                  {showTiles ? (
                    <div className="db-schema-table-grid">
                      {visibleTableTiles.map((tableName) => renderTableCard(tableName, "normal"))}
                      {!visibleTableTiles.length ? <div className="db-schema-flow-empty">No table tiles to show.</div> : null}
                    </div>
                  ) : null}

                  {showFlow ? (
                    <div className="db-schema-relation-flow">
                      <ReactFlow
                        nodes={flowNodes}
                        edges={flowEdges}
                        onNodesChange={onFlowNodesChange}
                        onEdgesChange={onFlowEdgesChange}
                        onNodeClick={(_, node) => bringNodeToFront(node.id)}
                        onNodeDragStart={(_, node) => bringNodeToFront(node.id)}
                        nodeTypes={nodeTypes}
                        nodesDraggable
                        nodesConnectable={false}
                        elementsSelectable
                        fitView
                        fitViewOptions={{ padding: 0.2, includeHiddenNodes: false }}
                        minZoom={0.45}
                        maxZoom={1.3}
                        panOnDrag
                        zoomOnScroll
                        zoomOnPinch
                        proOptions={{ hideAttribution: true }}
                      >
                        <Background gap={24} size={1} />
                        <Controls showInteractive />
                      </ReactFlow>
                    </div>
                  ) : null}
                </div>
              </div>

              <aside className="db-schema-runtime-right">
                <h3>Table Detail</h3>
                <div className="db-schema-runtime-detail-card">
                  <div className="db-schema-runtime-detail-title">{effectiveSelectedTable || "(none)"}</div>
                  <div className="db-schema-runtime-detail-chips">
                    <span className="db-schema-badge">columns {(columnsByTable.get(effectiveSelectedTable) || []).length}</span>
                    <span className="db-schema-badge">indexes {selectedMeta.indexes.length}</span>
                    <span className="db-schema-badge">sequences {selectedMeta.sequences.length}</span>
                    <span className="db-schema-badge">triggers {selectedMeta.triggers.length}</span>
                  </div>
                </div>

                <div className="db-schema-runtime-detail-card">
                  <h4>Foreign Keys</h4>
                  <div className="db-schema-meta-list">
                    {selectedMeta.outgoing.map((j, i) => <div key={`out-${i}`} className="db-schema-meta-row">OUT: {j.source_column} {" -> "} {j.target_table}.{j.target_column}</div>)}
                    {selectedMeta.incoming.map((j, i) => <div key={`in-${i}`} className="db-schema-meta-row">IN: {j.source_table}.{j.source_column} {" -> "} {j.target_column}</div>)}
                    {!selectedMeta.outgoing.length && !selectedMeta.incoming.length ? <div className="db-schema-meta-empty">No foreign-key relations</div> : null}
                  </div>
                </div>

                <div className="db-schema-runtime-detail-card">
                  <h4>Indexes</h4>
                  <div className="db-schema-meta-list">
                    {selectedMeta.indexes.map((x, i) => <div key={`idx-${i}`} className="db-schema-meta-row">{x.index_name}</div>)}
                    {!selectedMeta.indexes.length ? <div className="db-schema-meta-empty">No indexes</div> : null}
                  </div>
                </div>

                <div className="db-schema-runtime-detail-card">
                  <h4>Sequences / Triggers</h4>
                  <div className="db-schema-meta-list">
                    {selectedMeta.sequences.map((x, i) => <div key={`seq-${i}`} className="db-schema-meta-row">SEQ: {x.sequence_name} ({x.column_name})</div>)}
                    {selectedMeta.triggers.map((x, i) => <div key={`trg-${i}`} className="db-schema-meta-row">TRG: {x.trigger_name} [{x.action_timing} {x.event_manipulation}]</div>)}
                    {!selectedMeta.sequences.length && !selectedMeta.triggers.length ? <div className="db-schema-meta-empty">No sequences or triggers</div> : null}
                  </div>
                </div>
              </aside>
            </div>
            ) : null}
          </div>

          <div className="db-schema-editor">
            <div className="db-schema-editor-head">
              <h3>Schema Knowledge Draft (Editable)</h3>
            </div>
            <div className="db-schema-grid db-schema-grid-actions">
              <div className="db-schema-grid-head">table_name</div>
              <div className="db-schema-grid-head">column_name</div>
              <div className="db-schema-grid-head">role</div>
              <div className="db-schema-grid-head">description</div>
              <div className="db-schema-grid-head">tags</div>
              <div className="db-schema-grid-head">action</div>
              {visibleRows.map((r) => {
                const colOptions = columnsByTable.get(r.tableName) || [];
                return (
                  <div className="db-schema-grid-row" key={r.id}>
                    <select value={r.tableName} onChange={(e) => onEditRow(r.id, "tableName", e.target.value)}>
                      {tableNames.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={r.columnName} onChange={(e) => onEditRow(r.id, "columnName", e.target.value)}>
                      {colOptions.map((c) => {
                        const n = String(c.column_name || "");
                        return <option key={`${r.tableName}-${n}`} value={n}>{n}</option>;
                      })}
                    </select>
                    <input value={r.role} onChange={(e) => onEditRow(r.id, "role", e.target.value)} />
                    <input value={r.description} onChange={(e) => onEditRow(r.id, "description", e.target.value)} />
                    <input value={r.tags} onChange={(e) => onEditRow(r.id, "tags", e.target.value)} />
                    <div className="db-schema-action-cell">
                      <button type="button" className="db-schema-add-btn" onClick={() => onAddRowAfter(r.id)} aria-label="Add row below" title="Add row below">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                      <button type="button" className="db-schema-delete-btn" onClick={() => onDeleteRow(r.id)} aria-label="Delete row" title="Delete row">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M9 7V5.8c0-.7.5-1.3 1.3-1.3h3.4c.8 0 1.3.6 1.3 1.3V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M7.4 7l.8 11.1c.1 1 1 1.8 2 1.8h3.6c1 0 1.9-.8 2-1.8L16.6 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M10 10.4v6.2M14 10.4v6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {generatedSql ? <div className="db-schema-generated-wrap"><h3>Generated SQL</h3><SqlCodeBlock code={generatedSql} /></div> : null}
        </>
      ) : null}
    </section>
  );
}
