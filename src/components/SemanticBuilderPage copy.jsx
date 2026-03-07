import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, applyNodeChanges, useEdgesState, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import {
  fetchCurrentSemanticModelYaml,
  generateSemanticModelDraft,
  inspectDbSchema,
  saveSemanticModel,
  validateSemanticModel,
} from "../api/convengine.api.js";
import CodeBlockToggle from "./convengine/CodeBlockToggle";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const SEMANTIC_PALETTE_TYPES = [
  "settings",
  "entities",
  "tables",
  "relationships",
  "metrics",
  "value_patterns",
  "intent_rules",
  "join_hints",
  "allowed_tables",
];
const SEMANTIC_SAFE_RENDER = false;

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

function filterInspectedSchemaByTables(schemaPayload, allowedTables) {
  const source = schemaPayload || {};
  const selected = new Set((allowedTables || []).filter(Boolean));
  if (!selected.size) return source;

  const filterByTableName = (items) => (Array.isArray(items)
    ? items.filter((x) => selected.has(String(x?.table_name || "")))
    : []);

  const joins = Array.isArray(source.joins)
    ? source.joins.filter((j) => selected.has(String(j?.source_table || "")) || selected.has(String(j?.target_table || "")))
    : [];

  const tables = Array.isArray(source.tables)
    ? source.tables.filter((t) => selected.has(String(t?.table_name || "")))
    : [];

  return {
    ...source,
    tableCount: tables.length,
    tables,
    columns: filterByTableName(source.columns),
    joins,
    indexes: filterByTableName(source.indexes),
    sequences: filterByTableName(source.sequences),
    triggers: filterByTableName(source.triggers),
  };
}

function inferRole(row) {
  const isPk = boolValue(row.is_primary_key);
  const isFk = boolValue(row.is_foreign_key);
  if (isPk) return "pk";
  if (isFk) return "fk";
  return "column";
}

function SemanticYamlCodeBlock({ yaml }) {
  if (!yaml) return null;
  return (
    <CodeBlockToggle
      title="Generated Semantic YAML"
      language="yaml"
      packagePath="model: semantic-query"
      filePath="semantic-layer.yaml"
      defaultOpen
    >
      {String(yaml || "")}
    </CodeBlockToggle>
  );
}

function parseAllowedTablesFromYaml(yamlText) {
  const text = String(yamlText || "");
  const rulesMatch = text.match(/^rules:\n([\s\S]*?)(?=^[A-Za-z0-9_-]+:\s*|\Z)/m);
  if (!rulesMatch) return [];
  const allowedBlock = rulesMatch[1].match(/^\s{2}allowed_tables:\n((?:\s{4}- .*\n?)*)/m);
  if (!allowedBlock) return [];
  return Array.from(new Set(
    allowedBlock[1]
      .split("\n")
      .map((line) => line.match(/^\s{4}-\s+(.+?)\s*$/)?.[1] || "")
      .filter(Boolean)
  ));
}

function parseJoinHintsFromYaml(yamlText) {
  const text = String(yamlText || "");
  const rootMatch = text.match(/^join_hints:\n([\s\S]*?)(?=^[A-Za-z0-9_-]+:\s*|\Z)/m);
  if (!rootMatch) return [];
  const lines = rootMatch[1].split("\n");
  const out = [];
  let current = null;
  for (const raw of lines) {
    const line = raw || "";
    const tableMatch = line.match(/^\s{2}([A-Za-z0-9_]+):\s*$/);
    if (tableMatch) {
      if (current) out.push(current);
      current = { table: tableMatch[1], commonlyJoinedWith: [] };
      continue;
    }
    const joinMatch = line.match(/^\s{6}-\s+(.+?)\s*$/);
    if (joinMatch && current) {
      current.commonlyJoinedWith.push(joinMatch[1]);
    }
  }
  if (current) out.push(current);
  return out;
}

function extractRulesDefaults(yamlText) {
  const text = String(yamlText || "");
  const rulesMatch = text.match(/^rules:\n([\s\S]*?)(?=^[A-Za-z0-9_-]+:\s*|\Z)/m);
  const fallback = { denyOps: ["DELETE", "UPDATE", "DROP"], maxResultLimit: 500 };
  if (!rulesMatch) return fallback;
  const rulesBody = rulesMatch[1];
  const denyBlock = rulesBody.match(/^\s{2}deny_operations:\n((?:\s{4}- .*\n?)*)/m);
  const denyOps = denyBlock
    ? denyBlock[1]
      .split("\n")
      .map((line) => line.match(/^\s{4}-\s+(.+?)\s*$/)?.[1] || "")
      .filter(Boolean)
    : fallback.denyOps;
  const maxMatch = rulesBody.match(/^\s{2}max_result_limit:\s*(\d+)\s*$/m);
  const maxResultLimit = maxMatch ? Number(maxMatch[1]) : fallback.maxResultLimit;
  return {
    denyOps: denyOps.length ? denyOps : fallback.denyOps,
    maxResultLimit: Number.isFinite(maxResultLimit) ? maxResultLimit : fallback.maxResultLimit,
  };
}

function renderJoinHintsSection(joinHints) {
  if (!joinHints.length) {
    return "join_hints: {}";
  }
  const lines = ["join_hints:"];
  joinHints.forEach((hint) => {
    lines.push(`  ${hint.table}:`);
    lines.push("    commonly_joined_with:");
    (hint.commonlyJoinedWith || []).forEach((table) => lines.push(`      - ${table}`));
  });
  return lines.join("\n");
}

function renderRulesSection(allowedTables, denyOps, maxResultLimit) {
  const lines = ["rules:", "  allowed_tables:"];
  allowedTables.forEach((table) => lines.push(`    - ${table}`));
  lines.push("  deny_operations:");
  (denyOps || []).forEach((op) => lines.push(`    - ${op}`));
  lines.push(`  max_result_limit: ${maxResultLimit}`);
  return lines.join("\n");
}

function replaceTopLevelSection(yamlText, sectionName, sectionBody) {
  const text = String(yamlText || "");
  const block = `${sectionBody}\n`;
  const regex = new RegExp(`^${sectionName}:\\n[\\s\\S]*?(?=^[A-Za-z0-9_-]+:\\s*|\\Z)`, "m");
  if (regex.test(text)) {
    return text.replace(regex, block.trimEnd());
  }
  const base = text.trimEnd();
  return base ? `${base}\n\n${block}` : `${block}`;
}

function applyBuilderSectionsToYaml(yamlText, allowedTables, joinHints) {
  const base = String(yamlText || "").trim();
  const seed = base || "version: 1\ndatabase: v2\n";
  const defaults = extractRulesDefaults(seed);
  const rulesSection = renderRulesSection(allowedTables, defaults.denyOps, defaults.maxResultLimit);
  const joinHintsSection = renderJoinHintsSection(joinHints);
  const withJoinHints = replaceTopLevelSection(seed, "join_hints", joinHintsSection);
  return replaceTopLevelSection(withJoinHints, "rules", rulesSection);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function encodePointerSegment(segment) {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

function decodePointerSegment(segment) {
  return String(segment).replace(/~1/g, "/").replace(/~0/g, "~");
}

function joinPointer(parentPointer, segment) {
  if (!parentPointer || parentPointer === "/") {
    return `/${encodePointerSegment(segment)}`;
  }
  return `${parentPointer}/${encodePointerSegment(segment)}`;
}

function pointerToSegments(pointer) {
  if (!pointer || pointer === "/") return [];
  return pointer
    .split("/")
    .slice(1)
    .map((p) => decodePointerSegment(p))
    .map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

function getAtPointer(root, pointer) {
  const segments = pointerToSegments(pointer);
  let cur = root;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function setAtPointer(root, pointer, value) {
  const clone = structuredClone(root);
  const segments = pointerToSegments(pointer);
  if (!segments.length) return value;
  let cur = clone;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    if (cur[seg] === undefined || cur[seg] === null || typeof cur[seg] !== "object") {
      cur[seg] = typeof segments[i + 1] === "number" ? [] : {};
    }
    cur = cur[seg];
  }
  cur[segments[segments.length - 1]] = value;
  return clone;
}

function deleteAtPointer(root, pointer) {
  const clone = structuredClone(root);
  const segments = pointerToSegments(pointer);
  if (!segments.length) return clone;
  let cur = clone;
  for (let i = 0; i < segments.length - 1; i += 1) {
    cur = cur?.[segments[i]];
    if (cur === undefined || cur === null) return clone;
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(cur) && typeof last === "number") {
    cur.splice(last, 1);
  } else if (isPlainObject(cur)) {
    delete cur[last];
  }
  return clone;
}

function parentPointer(pointer) {
  if (!pointer || pointer === "/") return "/";
  const idx = String(pointer).lastIndexOf("/");
  if (idx <= 0) return "/";
  return pointer.slice(0, idx) || "/";
}

function lastPointerSegment(pointer) {
  const segments = pointerToSegments(pointer);
  if (!segments.length) return null;
  return segments[segments.length - 1];
}

function insertSiblingAtPointer(root, pointer, place = "after", kind = "value", keyName = "newKey", valueText = "") {
  const parentPtr = parentPointer(pointer);
  const parent = getAtPointer(root, parentPtr);
  const segment = lastPointerSegment(pointer);
  const value = kind === "object" ? {} : kind === "array" ? [] : String(valueText || "");

  if (Array.isArray(parent)) {
    const idx = typeof segment === "number" ? segment : parent.length - 1;
    const insertIdx = place === "before" ? idx : idx + 1;
    const clone = structuredClone(root);
    const arr = getAtPointer(clone, parentPtr);
    arr.splice(Math.max(0, insertIdx), 0, value);
    return clone;
  }

  if (isPlainObject(parent)) {
    const keys = Object.keys(parent);
    const seg = String(segment ?? "");
    const at = keys.indexOf(seg);
    let nextKey = String(keyName || "newKey").trim() || "newKey";
    let i = 1;
    while (Object.prototype.hasOwnProperty.call(parent, nextKey)) {
      nextKey = `${keyName}${i}`;
      i += 1;
    }
    const ordered = [];
    keys.forEach((k, kIndex) => {
      if (place === "before" && kIndex === at) ordered.push([nextKey, value]);
      ordered.push([k, parent[k]]);
      if (place === "after" && kIndex === at) ordered.push([nextKey, value]);
    });
    if (at < 0) ordered.push([nextKey, value]);
    const rebuilt = Object.fromEntries(ordered);
    return setAtPointer(root, parentPtr, rebuilt);
  }

  return root;
}

function addChildAtPointer(root, pointer, kind = "value", keyName = "newKey") {
  const current = getAtPointer(root, pointer);
  if (Array.isArray(current)) {
    const value = kind === "object" ? {} : kind === "array" ? [] : "";
    return setAtPointer(root, joinPointer(pointer, current.length), value);
  }
  if (isPlainObject(current)) {
    let key = keyName;
    let i = 1;
    while (Object.prototype.hasOwnProperty.call(current, key)) {
      key = `${keyName}${i}`;
      i += 1;
    }
    const value = kind === "object" ? {} : kind === "array" ? [] : "";
    return setAtPointer(root, joinPointer(pointer, key), value);
  }
  return root;
}

function typeOfNode(value) {
  if (Array.isArray(value)) return "array";
  if (isPlainObject(value)) return "object";
  return "value";
}

function colorFromKeyLabel(label) {
  const seed = String(label || "node");
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette = [
    { bg: "#d8c7e3", fg: "#6b3f7f", border: "#c9b2d7" },
    { bg: "#ddd2bf", fg: "#8a612c", border: "#ccbda5" },
    { bg: "#c8ddbe", fg: "#427b2c", border: "#b3d1a8" },
    { bg: "#d8c3cb", fg: "#88465a", border: "#caaeb7" },
    { bg: "#c8d6ea", fg: "#3f608d", border: "#b5c7e0" },
  ];
  return palette[hash % palette.length];
}

function buildTreeGraph(rootValue, expandedSet) {
  const nodes = [];
  const edges = [];
  let cursorY = 0;
  const pointerToNodeIdMap = new Map();
  let nodeSeq = 0;

  function pointerToNodeId(pointer) {
    if (pointerToNodeIdMap.has(pointer)) return pointerToNodeIdMap.get(pointer);
    const id = `n_${nodeSeq++}`;
    pointerToNodeIdMap.set(pointer, id);
    return id;
  }

  function walk(value, pointer, keyLabel, depth, parentPointer) {
    const kind = typeOfNode(value);
    const isContainer = kind !== "value";
    const id = pointerToNodeId(pointer || "/");
    const parentId = parentPointer ? pointerToNodeId(parentPointer) : "";
    const expanded = expandedSet.has(pointer || "/");
    const count = kind === "array" ? value.length : kind === "object" ? Object.keys(value).length : null;
    const headerTheme = colorFromKeyLabel(keyLabel);
    const rows = kind === "object"
      ? Object.entries(value).slice(0, 4).map(([k, v]) => ({
        key: k,
        type: typeOfNode(v),
          pointer: joinPointer(pointer || "/", k),
          expandable: typeOfNode(v) !== "value",
          expanded: expandedSet.has(joinPointer(pointer || "/", k)),
        preview: typeOfNode(v) === "value"
          ? String(v ?? "")
          : (typeOfNode(v) === "array"
              ? `[${v.length} items]`
              : `{${Object.keys(v || {}).length} keys}`),
      }))
      : kind === "array"
        ? value.slice(0, 4).map((v, idx) => ({
          key: `[${idx}]`,
          type: typeOfNode(v),
          pointer: joinPointer(pointer || "/", idx),
          expandable: typeOfNode(v) !== "value",
          expanded: expandedSet.has(joinPointer(pointer || "/", idx)),
          preview: typeOfNode(v) === "value"
            ? String(v ?? "")
            : (typeOfNode(v) === "array"
                ? `[${v.length} items]`
                : `{${Object.keys(v || {}).length} keys}`),
        }))
        : [];
    nodes.push({
      id,
      type: "semanticTreeNode",
      position: { x: 32 + depth * 260, y: 28 + cursorY * 70 },
      data: {
        keyLabel,
        pointer: pointer || "/",
        kind,
        count,
        expanded: expandedSet.has(pointer || "/"),
        preview: kind === "value" ? String(value ?? "") : "",
        rows,
        headerTheme,
      },
      draggable: true,
    });
    if (parentId) {
      edges.push({
        id: `e:${parentId}->${id}`,
        source: parentId,
        target: id,
        type: "smoothstep",
        animated: false,
      });
    }
    cursorY += 1;
    if (!isContainer || !expanded) return;
    if (kind === "object") {
      Object.entries(value).forEach(([k, v]) => {
        walk(v, joinPointer(pointer || "/", k), k, depth + 1, pointer || "/");
      });
    } else {
      value.forEach((v, idx) => {
        walk(v, joinPointer(pointer || "/", idx), `[${idx}]`, depth + 1, pointer || "/");
      });
    }
  }

  walk(rootValue, "/", "semantic-layer.yaml", 0, "");
  if (!nodes.length) {
    nodes.push({
      id: "n_root_fallback",
      type: "semanticTreeNode",
      position: { x: 32, y: 28 },
      data: {
        keyLabel: "semantic-layer.yaml",
        pointer: "/",
        kind: "object",
        count: 0,
        expanded: true,
        preview: "",
        rows: [],
        headerTheme: colorFromKeyLabel("semantic-layer.yaml"),
      },
      draggable: true,
    });
  }
  return { nodes, edges };
}

function ensureExpandedDefaults(value) {
  const out = new Set(["/"]);
  if (isPlainObject(value)) {
    Object.keys(value).forEach((k) => out.add(`/${encodePointerSegment(k)}`));
  }
  return out;
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

function SemanticTreeNode({ data }) {
  const kind = String(data?.kind || "value");
  const isObject = kind === "object";
  const isArray = kind === "array";
  const isValue = kind === "value";
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return (
    <div className={`sb-tree-node ${isObject ? "object" : isArray ? "array" : "value"}`}>
      <Handle type="target" position={Position.Left} className="sb-tree-handle" />
      <Handle type="source" position={Position.Right} className="sb-tree-handle" />
      <div className="sb-tree-node-head" style={{ background: data?.headerTheme?.bg, borderColor: data?.headerTheme?.border }}>
        <div className="sb-tree-node-title" style={{ color: data?.headerTheme?.fg }}>{data?.keyLabel}</div>
        {!isValue ? (
          <div className="sb-tree-node-expand" aria-hidden="true">
            {data?.expanded ? "−" : "+"}
          </div>
        ) : null}
      </div>
      {isValue ? (
        <div className="sb-tree-node-row">
          <span className="sb-tree-node-row-key">value</span>
          <span className="sb-tree-node-row-value">{String(data?.preview || "(empty)")}</span>
        </div>
      ) : (
        <>
          {rows.map((row, idx) => (
            <div key={`${data?.pointer || "p"}-${idx}`} className="sb-tree-node-row">
              <span className="sb-tree-node-row-key">{row.key}</span>
              <span className={`sb-tree-node-row-value ${row.type}`}>{row.preview}</span>
              {row.expandable ? (
                <button
                  type="button"
                  className="sb-tree-row-toggle"
                  title={row.expanded ? "Collapse" : "Expand"}
                  onClick={(e) => {
                    e.stopPropagation();
                    data?.onToggleChild?.(row.pointer);
                  }}
                >
                  {row.expanded ? "−" : "+"}
                </button>
              ) : null}
            </div>
          ))}
          <div className="sb-tree-node-meta">
            {kind} {typeof data?.count === "number" ? `${data.count} items` : ""}
          </div>
        </>
      )}
    </div>
  );
}

export default function SemanticBuilderPage({ query, onOpenRunDialog }) {
  const semanticOnly = true;
  const [studioMode, setStudioMode] = useState("yaml"); // yaml | builder
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [stablePayload, setStablePayload] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [rowScope, setRowScope] = useState("TABLE"); // TABLE | ALL | FLOW
  const [generating, setGenerating] = useState(false);
  const [editorMode, setEditorMode] = useState(semanticOnly ? "SEMANTIC_YAML" : "SCHEMA_KNOWLEDGE"); // SCHEMA_KNOWLEDGE | SEMANTIC_YAML
  const [semanticYaml, setSemanticYaml] = useState("");
  const [yamlName, setYamlName] = useState("default");
  const [yamlVersion, setYamlVersion] = useState(1);
  const [yamlValid, setYamlValid] = useState(null);
  const [yamlDiagnostics, setYamlDiagnostics] = useState([]);
  const [yamlBusy, setYamlBusy] = useState(false);
  const [yamlMessage, setYamlMessage] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [allowedTablesBuilder, setAllowedTablesBuilder] = useState([]);
  const [allowedTablePick, setAllowedTablePick] = useState("");
  const [joinHintsBuilder, setJoinHintsBuilder] = useState([]);
  const [joinHintTablePick, setJoinHintTablePick] = useState("");
  const [joinHintJoinPick, setJoinHintJoinPick] = useState({});
  const [semanticTree, setSemanticTree] = useState({});
  const [expandedPointers, setExpandedPointers] = useState(new Set(["/"]));
  const [semanticTreePositions, setSemanticTreePositions] = useState({});
  const [semanticTreeGraph, setSemanticTreeGraph] = useState({ nodes: [], edges: [] });
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState([]);
  const [selectedSemanticNodeId, setSelectedSemanticNodeId] = useState("/");
  const [nodeEntryDraft, setNodeEntryDraft] = useState("");
  const [nodeNewKeyDraft, setNodeNewKeyDraft] = useState("newKey");
  const [nodeAddKindDraft, setNodeAddKindDraft] = useState("value");
  const [builderMenu, setBuilderMenu] = useState({ open: false, x: 0, y: 0 });
  const [nodeMenu, setNodeMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    pointer: "/",
    subMenu: "",
  });
  const [builderViewport, setBuilderViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const matchMode = String(query?.matchMode || "REGEX").toUpperCase();
  const matchText = String(query?.prefix || "").trim();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const fetchPrefix = matchText;

    inspectDbSchema(fetchPrefix, query?.schema || "")
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

  useEffect(() => {
    if (semanticOnly) {
      setEditorMode("SEMANTIC_YAML");
    }
  }, [semanticOnly]);

  useEffect(() => {
    if (studioMode === "builder") {
      setBuilderViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [studioMode]);

  useEffect(() => {
    let active = true;
    if (semanticYaml.trim()) return () => { active = false; };
    fetchCurrentSemanticModelYaml()
      .then((res) => {
        if (!active) return;
        const yaml = String(res?.yaml || "").trim();
        if (yaml) {
          setSemanticYaml(yaml);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [semanticYaml]);

  const columnsByTable = useMemo(() => groupColumnsByTable(effectivePayload?.columns || []), [effectivePayload]);
  const tableNames = useMemo(() => {
    const fromTables = (effectivePayload?.tables || []).map((t) => String(t.table_name || "")).filter(Boolean);
    const fromColumns = Array.from(columnsByTable.keys());
    return Array.from(new Set([...fromTables, ...fromColumns]));
  }, [effectivePayload, columnsByTable]);

  useEffect(() => {
    const parsedAllowed = parseAllowedTablesFromYaml(semanticYaml);
    if (parsedAllowed.length) {
      setAllowedTablesBuilder(parsedAllowed);
    } else if (tableNames.length && allowedTablesBuilder.length === 0) {
      setAllowedTablesBuilder([]);
    }
    const parsedHints = parseJoinHintsFromYaml(semanticYaml);
    if (parsedHints.length) {
      setJoinHintsBuilder(parsedHints);
    }
    try {
      const parsedTree = parseYaml(semanticYaml || "{}") || {};
      const normalizedTree = typeof parsedTree === "object" && parsedTree !== null ? parsedTree : { value: parsedTree };
      setSemanticTree(normalizedTree);
      const defaults = ensureExpandedDefaults(normalizedTree);
      setExpandedPointers((prev) => (prev.size <= 1 ? defaults : prev));
    } catch {
      setSemanticTree({});
      setExpandedPointers(new Set(["/"]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticYaml, tableNames.length]);

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

  const onAddAllowedTable = () => {
    const value = String(allowedTablePick || "").trim();
    if (!value) return;
    setAllowedTablesBuilder((prev) => Array.from(new Set([...prev, value])));
  };

  const onRemoveAllowedTable = (table) => {
    setAllowedTablesBuilder((prev) => prev.filter((x) => x !== table));
  };

  const onAddJoinHintTable = () => {
    const value = String(joinHintTablePick || "").trim();
    if (!value) return;
    setJoinHintsBuilder((prev) => {
      if (prev.some((p) => p.table === value)) return prev;
      return [...prev, { table: value, commonlyJoinedWith: [] }];
    });
  };

  const onRemoveJoinHintTable = (table) => {
    setJoinHintsBuilder((prev) => prev.filter((h) => h.table !== table));
    setJoinHintJoinPick((prev) => {
      const next = { ...prev };
      delete next[table];
      return next;
    });
  };

  const onAddJoinHintTarget = (table) => {
    const picked = String(joinHintJoinPick[table] || "").trim();
    if (!picked) return;
    setJoinHintsBuilder((prev) => prev.map((h) => {
      if (h.table !== table) return h;
      const next = Array.from(new Set([...(h.commonlyJoinedWith || []), picked]));
      return { ...h, commonlyJoinedWith: next };
    }));
  };

  const onRemoveJoinHintTarget = (table, target) => {
    setJoinHintsBuilder((prev) => prev.map((h) => {
      if (h.table !== table) return h;
      return { ...h, commonlyJoinedWith: (h.commonlyJoinedWith || []).filter((x) => x !== target) };
    }));
  };

  const onApplyBuildersToYaml = () => {
    const allowed = allowedTablesBuilder.filter(Boolean);
    const hints = joinHintsBuilder
      .filter((h) => String(h?.table || "").trim())
      .map((h) => ({
        table: String(h.table).trim(),
        commonlyJoinedWith: Array.from(new Set((h.commonlyJoinedWith || []).filter(Boolean))),
      }));
    const nextYaml = applyBuilderSectionsToYaml(semanticYaml, allowed, hints);
    setSemanticYaml(nextYaml);
    setYamlMessage("Applied join_hints and rules.allowed_tables into YAML editor.");
  };

  const semanticNodeTypes = useMemo(() => ({ semanticTreeNode: SemanticTreeNode }), []);

  useEffect(() => {
    const graph = buildTreeGraph(semanticTree, expandedPointers);
    const nodes = graph.nodes.map((n) => ({
      ...n,
      position: semanticTreePositions[n.id] || n.position,
      data: {
        ...n.data,
        onToggleChild: (childPointer) => {
          setExpandedPointers((prev) => {
            const next = new Set(prev);
            if (next.has(childPointer)) next.delete(childPointer);
            else next.add(childPointer);
            return next;
          });
          setSelectedSemanticNodeId(childPointer);
        },
      },
    }));
    if (SEMANTIC_SAFE_RENDER) {
      const safeNodes = nodes.map((n) => {
        const rows = Array.isArray(n?.data?.rows) ? n.data.rows : [];
        const sub = rows
          .slice(0, 3)
          .map((r) => `${r.key}: ${r.preview}`)
          .join(" | ");
        return {
          ...n,
          type: "input",
          targetPosition: Position.Left,
          sourcePosition: Position.Right,
          data: {
            label: `${n?.data?.keyLabel || "node"}${sub ? `\n${sub}` : ""}`,
            pointer: n?.data?.pointer || "/",
          },
          style: {
            width: 280,
            borderRadius: 12,
            border: "1px solid rgba(190, 170, 206, 0.85)",
            background: "#f8f5fb",
            color: "#4c1d95",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 11,
            lineHeight: 1.35,
            whiteSpace: "pre-wrap",
            boxShadow: "0 8px 16px rgba(15,23,42,0.18)",
          },
        };
      });
      const debugNode = {
        id: "__debug_visible_node__",
        type: "input",
        position: { x: 48, y: 52 },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: { label: "semantic-layer.yaml (debug visible node)", pointer: "/" },
        style: {
          width: 260,
          borderRadius: 12,
          border: "1px solid rgba(253, 230, 138, 0.95)",
          background: "rgba(245, 158, 11, 0.2)",
          color: "#fef3c7",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: 11,
          lineHeight: 1.35,
          boxShadow: "0 8px 16px rgba(15,23,42,0.18)",
        },
        draggable: true,
      };
      const safeEdges = (graph.edges || []).map((e) => ({
        ...e,
        style: { stroke: "rgba(125, 211, 252, 0.78)", strokeWidth: 1.5 },
      }));
      setSemanticTreeGraph({ nodes: [debugNode, ...safeNodes], edges: safeEdges });
      return;
    }
    setSemanticTreeGraph({ nodes, edges: graph.edges });
  }, [semanticTree, expandedPointers, semanticTreePositions]);

  useEffect(() => {
    if (!semanticTree || (isPlainObject(semanticTree) && Object.keys(semanticTree).length === 0)) return;
    const nextYaml = stringifyYaml(semanticTree);
    if (String(nextYaml || "").trim() !== String(semanticYaml || "").trim()) {
      setSemanticYaml(nextYaml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticTree]);

  const onSemanticTreeNodesChange = useCallback((changes) => {
    setSemanticTreeGraph((prev) => ({ ...prev, nodes: applyNodeChanges(changes, prev.nodes) }));
    setSemanticTreePositions((prev) => {
      const next = { ...prev };
      changes.forEach((change) => {
        if ((change.type === "position" || change.type === "dimensions") && change.position) {
          next[change.id] = change.position;
        }
      });
      return next;
    });
  }, []);

  const onAddPaletteNode = (label) => {
    const defaults = {
      settings: {},
      entities: {},
      tables: {},
      relationships: [],
      synonyms: {},
      join_hints: {},
      metrics: {},
      value_patterns: [],
      intent_rules: {},
      allowed_tables: [],
    };
    setSemanticTree((prev) => {
      const root = isPlainObject(prev) ? structuredClone(prev) : {};
      if (!Object.prototype.hasOwnProperty.call(root, label)) {
        root[label] = Object.prototype.hasOwnProperty.call(defaults, label) ? defaults[label] : {};
      }
      return root;
    });
    const pointer = `/${encodePointerSegment(label)}`;
    setExpandedPointers((prev) => new Set([...prev, "/", pointer]));
    setSelectedSemanticNodeId(pointer);
    setBuilderMenu({ open: false, x: 0, y: 0 });
  };

  const onInsertInside = (pointer, kind) => {
    if (!pointer) return;
    setSemanticTree((prev) => addChildAtPointer(prev, pointer, kind, nodeNewKeyDraft || "newKey"));
    setExpandedPointers((prev) => new Set([...prev, pointer]));
    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
  };

  const onInsertSibling = (pointer, place, kind) => {
    if (!pointer || pointer === "/") return;
    const parent = parentPointer(pointer);
    if (!parent) return;
    setSemanticTree((prev) => insertSiblingAtPointer(
      prev,
      pointer,
      place,
      kind,
      nodeNewKeyDraft || "newKey",
      nodeEntryDraft || ""
    ));
    setExpandedPointers((prev) => new Set([...prev, parent]));
    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
  };

  const onCopyNode = (pointer) => {
    if (!pointer || pointer === "/") return;
    const value = getAtPointer(semanticTree, pointer);
    const copyKind = typeOfNode(value);
    const copyValue = copyKind === "value" ? String(value ?? "") : structuredClone(value);
    setSemanticTree((prev) => {
      const next = insertSiblingAtPointer(prev, pointer, "after", copyKind, "copyNode", String(copyValue || ""));
      if (copyKind !== "value") {
        // replace fallback empty object/array with actual copied subtree
        const parent = getAtPointer(next, parentPointer(pointer));
        if (Array.isArray(parent)) {
          const index = (typeof lastPointerSegment(pointer) === "number" ? lastPointerSegment(pointer) : parent.length - 1) + 1;
          parent[index] = copyValue;
        } else if (isPlainObject(parent)) {
          const keys = Object.keys(parent);
          const copiedKey = keys.find((k) => String(k).startsWith("copyNode"));
          if (copiedKey) parent[copiedKey] = copyValue;
        }
      }
      return next;
    });
    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
  };

  const onFocusParent = (pointer) => {
    const parent = parentPointer(pointer);
    setSelectedSemanticNodeId(parent || "/");
    if (parent) {
      setExpandedPointers((prev) => new Set([...prev, parent]));
    }
    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
  };

  const onOpenNodeInTab = (pointer) => {
    const value = getAtPointer(semanticTree, pointer);
    const yaml = stringifyYaml(value ?? {});
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.45; padding: 16px;">${String(yaml)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`);
      w.document.close();
    }
    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
  };

  const onDeleteSelectedSemanticNode = () => {
    if (!selectedSemanticNodeId || selectedSemanticNodeId === "/") return;
    setSemanticTree((prev) => deleteAtPointer(prev, selectedSemanticNodeId));
    setSelectedSemanticNodeId("/");
    setNodeEntryDraft("");
  };

  const selectedSemanticNodeValue = useMemo(
    () => getAtPointer(semanticTree, selectedSemanticNodeId),
    [semanticTree, selectedSemanticNodeId]
  );
  const selectedSemanticNodeKind = typeOfNode(selectedSemanticNodeValue);
  const semanticCanvasNodes = useMemo(() => {
    if (semanticTreeGraph.nodes?.length) return semanticTreeGraph.nodes;
    return [{
      id: "n_canvas_fallback",
      type: "semanticTreeNode",
      position: { x: 40, y: 40 },
      data: {
        keyLabel: "semantic-layer.yaml",
        pointer: "/",
        kind: typeOfNode(semanticTree),
        count: isPlainObject(semanticTree) ? Object.keys(semanticTree).length : Array.isArray(semanticTree) ? semanticTree.length : 1,
        expanded: true,
        preview: "",
        rows: isPlainObject(semanticTree)
          ? Object.entries(semanticTree).slice(0, 4).map(([k, v]) => ({
            key: k,
            type: typeOfNode(v),
            pointer: joinPointer("/", k),
            expandable: typeOfNode(v) !== "value",
            expanded: expandedPointers.has(joinPointer("/", k)),
            preview: typeOfNode(v) === "value"
              ? String(v ?? "")
              : (typeOfNode(v) === "array" ? `[${v.length} items]` : `{${Object.keys(v || {}).length} keys}`),
          }))
          : [],
        headerTheme: colorFromKeyLabel("semantic-layer.yaml"),
        onToggleChild: (childPointer) => {
          setExpandedPointers((prev) => {
            const next = new Set(prev);
            if (next.has(childPointer)) next.delete(childPointer);
            else next.add(childPointer);
            return next;
          });
          setSelectedSemanticNodeId(childPointer);
        },
      },
      draggable: true,
    }];
  }, [semanticTreeGraph.nodes, semanticTree, expandedPointers]);

  const onAddSelectedNodeEntry = () => {
    const value = String(nodeEntryDraft || "").trim();
    if (!value || !selectedSemanticNodeId) return;
    if (selectedSemanticNodeKind === "array") {
      setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, "value"));
      const arr = getAtPointer(semanticTree, selectedSemanticNodeId);
      const idx = Array.isArray(arr) ? arr.length : 0;
      const ptr = joinPointer(selectedSemanticNodeId, idx);
      setSemanticTree((prev) => setAtPointer(prev, ptr, value));
      setSelectedSemanticNodeId(ptr);
    } else if (selectedSemanticNodeKind === "object") {
      const key = String(nodeNewKeyDraft || "newKey").trim() || "newKey";
      setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, "value", key));
    }
    setNodeEntryDraft("");
  };

  const onUpdateNodeValue = (pointer, value) => {
    setSemanticTree((prev) => setAtPointer(prev, pointer, value));
  };

  const onDeleteNodeAtPointer = (pointer) => {
    if (!pointer || pointer === "/") return;
    setSemanticTree((prev) => deleteAtPointer(prev, pointer));
    if (selectedSemanticNodeId === pointer) {
      setSelectedSemanticNodeId("/");
    }
  };

  const scopedRows = useMemo(() => {
    const base = rowScope === "ALL"
      ? allRows
      : allRows.filter((r) => r.tableName === effectiveSelectedTable);
    return base.filter((r) => String(r.tableName || "").trim() && String(r.columnName || "").trim());
  }, [allRows, rowScope, effectiveSelectedTable]);

  const semanticInspectedSchema = useMemo(() => {
    if (rowScope === "ALL") {
      return effectivePayload || {};
    }
    if (!effectiveSelectedTable) {
      return effectivePayload || {};
    }
    return filterInspectedSchemaByTables(effectivePayload || {}, [effectiveSelectedTable]);
  }, [rowScope, effectivePayload, effectiveSelectedTable]);

  const buildSemanticPayload = useCallback(() => ({
    prefix: query?.prefix || "",
    schema: query?.schema || "",
    businessHints: "",
    existingYaml: semanticYaml || "",
    inspectedSchema: semanticInspectedSchema,
    rows: scopedRows.map((r) => ({
      tableName: r.tableName,
      columnName: r.columnName,
      role: r.role,
      description: r.description,
      tags: r.tags,
      validValues: "",
    })),
  }), [query?.prefix, query?.schema, semanticYaml, semanticInspectedSchema, scopedRows]);

  const onGenerate = async () => {
    setGenerating(true);
    setError("");
    setYamlMessage("");
    try {
      const semanticRes = await generateSemanticModelDraft(buildSemanticPayload());
      const nextYaml = String(semanticRes?.yaml || "");
      if (nextYaml) {
        setSemanticYaml(nextYaml);
      }
      const diagnostics = Array.isArray(semanticRes?.diagnostics) ? semanticRes.diagnostics : [];
      setYamlDiagnostics(diagnostics);
      setYamlValid(diagnostics.filter((d) => String(d?.severity || "").toUpperCase() === "ERROR").length === 0);
      setYamlMessage(String(semanticRes?.note || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate drafts");
    } finally {
      setGenerating(false);
    }
  };

  const onValidateYaml = async () => {
    if (!semanticYaml.trim()) {
      setYamlMessage("YAML is empty.");
      return;
    }
    setYamlBusy(true);
    setYamlMessage("");
    try {
      const res = await validateSemanticModel({ yaml: semanticYaml });
      const errors = Array.isArray(res?.errors) ? res.errors : [];
      const warnings = Array.isArray(res?.warnings) ? res.warnings : [];
      setYamlDiagnostics([...errors, ...warnings]);
      setYamlValid(Boolean(res?.valid));
      setYamlMessage(Boolean(res?.valid) ? "YAML is valid." : "Validation returned errors.");
    } catch (e) {
      setYamlMessage(e instanceof Error ? e.message : "YAML validation failed");
    } finally {
      setYamlBusy(false);
    }
  };

  const onSaveYaml = async () => {
    if (!semanticYaml.trim()) {
      setYamlMessage("YAML is empty.");
      return;
    }
    setYamlBusy(true);
    setYamlMessage("");
    try {
      const res = await saveSemanticModel({
        yaml: semanticYaml,
        name: yamlName || "default",
        version: Number(yamlVersion) || 1,
        persistToDb: true,
      });
      setYamlMessage(String(res?.note || "Saved."));
    } catch (e) {
      setYamlMessage(e instanceof Error ? e.message : "YAML save failed");
    } finally {
      setYamlBusy(false);
    }
  };

  const onExportYaml = () => {
    if (!semanticYaml.trim()) {
      setYamlMessage("YAML is empty.");
      return;
    }
    const blob = new Blob([semanticYaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${yamlName || "semantic-query-model"}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="db-schema-page">
      <div className="db-schema-toolbar">
        <div className="db-schema-toolbar-left">
          <div>
            <div className="db-schema-title-row">
              <h2>{semanticOnly ? "Semantic Layer Builder" : "DB Schema Inspect"}</h2>
              <div className="db-schema-row-scope db-schema-row-scope-top">
                {!semanticOnly ? (
                  <button
                    type="button"
                    className={`db-schema-scope-btn ${editorMode === "SCHEMA_KNOWLEDGE" ? "active" : ""}`}
                    onClick={() => setEditorMode("SCHEMA_KNOWLEDGE")}
                  >
                    Schema Knowledge
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`db-schema-scope-btn ${editorMode === "SEMANTIC_YAML" ? "active" : ""}`}
                  onClick={() => setEditorMode("SEMANTIC_YAML")}
                >
                  Semantic YAML
                </button>
              </div>
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
          <button type="button" className="cache-analyze-load" onClick={onGenerate} disabled={generating || loading || allRows.length === 0}>{generating ? "Generating Drafts..." : "Generate Draft"}</button>
        </div>
      </div>

      {loading ? <div className="cache-analyze-error">Inspecting schema...</div> : null}
      {error ? <div className="cache-analyze-error">{error}</div> : null}
      {!loading && !error && (effectivePayload?.tableCount || 0) === 0 ? (
        <div className="cache-analyze-error">
          No tables matched for filter <b>{matchText || "(empty)"}</b> in schema <b>{effectivePayload?.schema || query?.schema || "(default)"}</b> using mode <b>{matchMode}</b>.
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {studioMode === "yaml" ? (
          <>
          <div className="db-schema-editor">
            <div className="db-schema-editor-head">
              <h3 className="db-schema-editor-title-muted">Semantic YAML Draft (Editable)</h3>
              <div className="db-schema-toolbar-actions db-schema-editor-actions-tight">
                <label className="db-schema-inline-field" title="Semantic model key used when saving to configuration">
                  Model Name
                  <input
                    className="db-schema-inline-field-input"
                    value={yamlName}
                    onChange={(e) => setYamlName(e.target.value)}
                    placeholder="default"
                    aria-label="Model Name"
                    style={{ width: 140 }}
                  />
                </label>
                <label className="db-schema-inline-field" title="Model version number for this YAML draft">
                  Version
                  <input
                    className="db-schema-inline-field-input"
                    value={yamlVersion}
                    onChange={(e) => setYamlVersion(e.target.value)}
                    placeholder="1"
                    aria-label="Model Version"
                    style={{ width: 90 }}
                  />
                </label>
                <button type="button" className="cache-analyze-load" onClick={onValidateYaml} disabled={yamlBusy || !semanticYaml.trim()}>
                  {yamlBusy ? "Validating..." : "Validate YAML"}
                </button>
                <button type="button" className="cache-analyze-load" onClick={onSaveYaml} disabled={yamlBusy || !semanticYaml.trim()}>
                  {yamlBusy ? "Saving..." : "Save YAML"}
                </button>
                <button type="button" className="cache-analyze-load" onClick={onExportYaml} disabled={!semanticYaml.trim()}>
                  Export YAML
                </button>
              </div>
            </div>
            <textarea
              value={semanticYaml}
              onChange={(e) => setSemanticYaml(e.target.value)}
              placeholder="Generated semantic-query model YAML will appear here..."
              style={{
                width: "100%",
                minHeight: 260,
                borderRadius: 12,
                border: "1px solid rgba(125, 211, 252, 0.35)",
                background: "rgba(2, 6, 23, 0.45)",
                color: "#dbeafe",
                padding: "12px 14px",
                fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                lineHeight: 1.5
              }}
            />
            <div className="db-schema-runtime-detail-chips" style={{ marginTop: 10 }}>
              <span className="db-schema-badge">yaml {semanticYaml.trim() ? "present" : "empty"}</span>
              <span className="db-schema-badge">valid {yamlValid === null ? "unknown" : String(yamlValid)}</span>
              <span className="db-schema-badge">diagnostics {yamlDiagnostics.length}</span>
            </div>
            {yamlMessage ? <div className="cache-analyze-error" style={{ marginTop: 8 }}>{yamlMessage}</div> : null}
            {yamlDiagnostics.length ? (
              <div className="db-schema-meta-list" style={{ marginTop: 8 }}>
                {yamlDiagnostics.map((d, i) => (
                  <div key={`yaml-diag-${i}`} className="db-schema-meta-row">
                    [{String(d?.severity || "").toUpperCase()}]
                    {d?.line ? ` line ${d.line}` : ""} {d?.message || ""}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

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
                <h3>Schema Knowledge Rows (Editable)</h3>
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
          </>
          ) : (
            <div className="sbuilder-layout sbuilder-layout-fullpage">
              <aside className="sbuilder-palette">
                <div className="sbuilder-panel-title">Palette</div>
                {SEMANTIC_PALETTE_TYPES.map((nodeType) => (
                  <button key={nodeType} type="button" className="sbuilder-chip-btn" onClick={() => onAddPaletteNode(nodeType)}>
                    + {nodeType}
                  </button>
                ))}
              </aside>

              <div className="sbuilder-fullscreen">
                <ReactFlow
                  nodes={semanticCanvasNodes}
                  edges={semanticTreeGraph.edges}
                  nodeTypes={SEMANTIC_SAFE_RENDER ? undefined : semanticNodeTypes}
                  onNodesChange={onSemanticTreeNodesChange}
                  onNodeContextMenu={(event, node) => {
                    event.preventDefault();
                    const hostRect = event.currentTarget.getBoundingClientRect();
                    const pointer = node?.data?.pointer || "/";
                    setSelectedSemanticNodeId(pointer);
                    setNodeMenu({
                      open: true,
                      x: event.clientX - hostRect.left,
                      y: event.clientY - hostRect.top,
                      pointer,
                      subMenu: "",
                    });
                  }}
                  onNodeClick={(_, node) => {
                    const pointer = node?.data?.pointer || "/";
                    const value = getAtPointer(semanticTree, pointer);
                    const kind = typeOfNode(value);
                    if (kind === "object" || kind === "array") {
                      setExpandedPointers((prev) => {
                        const next = new Set(prev);
                        if (next.has(pointer)) next.delete(pointer);
                        else next.add(pointer);
                        return next;
                      });
                    }
                    setSelectedSemanticNodeId(pointer);
                    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                  }}
                  onPaneClick={() => {
                    setBuilderMenu({ open: false, x: 0, y: 0 });
                    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                  }}
                  onPaneContextMenu={(event) => {
                    event.preventDefault();
                    const hostRect = event.currentTarget.getBoundingClientRect();
                    setBuilderMenu({
                      open: true,
                      x: event.clientX - hostRect.left,
                      y: event.clientY - hostRect.top,
                    });
                    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                  }}
                  viewport={builderViewport}
                  onViewportChange={(vp) => setBuilderViewport(vp)}
                  minZoom={0.3}
                  maxZoom={1.5}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={22} size={1} />
                  <Controls showInteractive />
                </ReactFlow>
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    top: 10,
                    zIndex: 6,
                    fontSize: 11,
                    borderRadius: 8,
                    padding: "4px 8px",
                    background: "rgba(15,23,42,0.75)",
                    color: "#dbeafe",
                    border: "1px solid rgba(148,163,184,0.35)",
                  }}
                >
                  nodes: {semanticTreeGraph.nodes?.length || 0} | edges: {semanticTreeGraph.edges?.length || 0}
                </div>
                {builderMenu.open ? (
                  <div className="sbuilder-context-menu" style={{ left: builderMenu.x, top: builderMenu.y }}>
                    <div className="sbuilder-context-title">Add Node</div>
                    {SEMANTIC_PALETTE_TYPES.map((nodeType) => (
                      <button
                        key={`ctx-${nodeType}`}
                        type="button"
                        onClick={() => onAddPaletteNode(nodeType)}
                      >
                        {nodeType}
                      </button>
                    ))}
                  </div>
                ) : null}
                {nodeMenu.open ? (
                  <div className="sbuilder-context-menu sbuilder-node-menu" style={{ left: nodeMenu.x, top: nodeMenu.y }}>
                    <div className="sbuilder-context-title">{String(nodeMenu.pointer || "/").replace(/^\//, "") || "root"}</div>
                    <button type="button" onClick={() => onFocusParent(nodeMenu.pointer)}>
                      Focus Parent Node
                    </button>
                    <button type="button" onClick={() => setSelectedSemanticNodeId(nodeMenu.pointer)}>
                      Edit Object
                    </button>
                    <button type="button" onClick={() => onCopyNode(nodeMenu.pointer)}>
                      Copy Node
                    </button>
                    <button type="button" onClick={() => onOpenNodeInTab(nodeMenu.pointer)}>
                      Open in New Tab
                    </button>
                    <button
                      type="button"
                      onMouseEnter={() => setNodeMenu((prev) => ({ ...prev, subMenu: "inside" }))}
                    >
                      + Insert Inside
                    </button>
                    <button
                      type="button"
                      onMouseEnter={() => setNodeMenu((prev) => ({ ...prev, subMenu: "before" }))}
                    >
                      + Insert Before
                    </button>
                    <button
                      type="button"
                      onMouseEnter={() => setNodeMenu((prev) => ({ ...prev, subMenu: "after" }))}
                    >
                      + Insert After
                    </button>
                    {nodeMenu.pointer !== "/" ? (
                      <button type="button" className="danger" onClick={() => onDeleteNodeAtPointer(nodeMenu.pointer)}>
                        Delete
                      </button>
                    ) : null}
                    {nodeMenu.subMenu ? (
                      <div className="sbuilder-context-menu sbuilder-submenu" onMouseLeave={() => setNodeMenu((prev) => ({ ...prev, subMenu: "" }))}>
                        <button type="button" onClick={() => nodeMenu.subMenu === "inside" ? onInsertInside(nodeMenu.pointer, "object") : onInsertSibling(nodeMenu.pointer, nodeMenu.subMenu, "object")}>
                          Object
                        </button>
                        <button type="button" onClick={() => nodeMenu.subMenu === "inside" ? onInsertInside(nodeMenu.pointer, "array") : onInsertSibling(nodeMenu.pointer, nodeMenu.subMenu, "array")}>
                          Array
                        </button>
                        <button type="button" onClick={() => nodeMenu.subMenu === "inside" ? onInsertInside(nodeMenu.pointer, "value") : onInsertSibling(nodeMenu.pointer, nodeMenu.subMenu, "value")}>
                          Value
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <aside className="sbuilder-inspector">
                <div className="sbuilder-panel-title">Inspector</div>
                {selectedSemanticNodeId ? (
                  <>
                    <label className="sbuilder-label">Path</label>
                    <input value={selectedSemanticNodeId} disabled />
                    <label className="sbuilder-label">Type</label>
                    <input value={selectedSemanticNodeKind} disabled />

                    {selectedSemanticNodeKind === "value" ? (
                      <>
                        <label className="sbuilder-label">Value</label>
                        <input
                          value={String(selectedSemanticNodeValue ?? "")}
                          onChange={(e) => onUpdateNodeValue(selectedSemanticNodeId, e.target.value)}
                        />
                      </>
                    ) : null}

                    {selectedSemanticNodeKind === "object" ? (
                      <>
                        <label className="sbuilder-label">Properties</label>
                        <div className="sbuilder-join-list">
                          {Object.entries(selectedSemanticNodeValue || {}).map(([k, v]) => {
                            const childPtr = joinPointer(selectedSemanticNodeId, k);
                            const childKind = typeOfNode(v);
                            return (
                              <div key={`obj-${childPtr}`} className="sbuilder-join-row">
                                <div className="sbuilder-join-head">
                                  <b>{k}</b>
                                  <button type="button" onClick={() => onDeleteNodeAtPointer(childPtr)}>Delete</button>
                                </div>
                                {childKind === "value" ? (
                                  <input value={String(v ?? "")} onChange={(e) => onUpdateNodeValue(childPtr, e.target.value)} />
                                ) : (
                                  <button type="button" className="cache-analyze-load" onClick={() => {
                                    setExpandedPointers((prev) => new Set([...prev, selectedSemanticNodeId, childPtr]));
                                    setSelectedSemanticNodeId(childPtr);
                                  }}>
                                    Open {childKind}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="sbuilder-inline">
                          <input value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} placeholder="new key" />
                          <select value={nodeAddKindDraft} onChange={(e) => setNodeAddKindDraft(e.target.value)}>
                            <option value="value">value</option>
                            <option value="object">object</option>
                            <option value="array">array</option>
                          </select>
                          <button type="button" className="cache-analyze-load" onClick={() => {
                            setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, nodeAddKindDraft, nodeNewKeyDraft || "newKey"));
                          }}>Add</button>
                        </div>
                      </>
                    ) : null}

                    {selectedSemanticNodeKind === "array" ? (
                      <>
                        <label className="sbuilder-label">Items</label>
                        <div className="sbuilder-join-list">
                          {(selectedSemanticNodeValue || []).map((item, idx) => {
                            const childPtr = joinPointer(selectedSemanticNodeId, idx);
                            const childKind = typeOfNode(item);
                            return (
                              <div key={`arr-${childPtr}`} className="sbuilder-join-row">
                                <div className="sbuilder-join-head">
                                  <b>[{idx}]</b>
                                  <button type="button" onClick={() => onDeleteNodeAtPointer(childPtr)}>Delete</button>
                                </div>
                                {childKind === "value" ? (
                                  <input value={String(item ?? "")} onChange={(e) => onUpdateNodeValue(childPtr, e.target.value)} />
                                ) : (
                                  <button type="button" className="cache-analyze-load" onClick={() => {
                                    setExpandedPointers((prev) => new Set([...prev, selectedSemanticNodeId, childPtr]));
                                    setSelectedSemanticNodeId(childPtr);
                                  }}>
                                    Open {childKind}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="sbuilder-inline">
                          <select value={nodeAddKindDraft} onChange={(e) => setNodeAddKindDraft(e.target.value)}>
                            <option value="value">value</option>
                            <option value="object">object</option>
                            <option value="array">array</option>
                          </select>
                          <input
                            value={nodeEntryDraft}
                            onChange={(e) => setNodeEntryDraft(e.target.value)}
                            placeholder={nodeAddKindDraft === "value" ? "new item value" : "optional label"}
                          />
                          <button
                            type="button"
                            className="cache-analyze-load"
                            onClick={() => {
                              if (nodeAddKindDraft === "value") {
                                const cur = Array.isArray(selectedSemanticNodeValue) ? selectedSemanticNodeValue.length : 0;
                                const ptr = joinPointer(selectedSemanticNodeId, cur);
                                setSemanticTree((prev) => setAtPointer(prev, ptr, nodeEntryDraft || ""));
                              } else {
                                setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, nodeAddKindDraft));
                              }
                              setNodeEntryDraft("");
                            }}
                          >
                            Add
                          </button>
                        </div>
                      </>
                    ) : null}

                    {selectedSemanticNodeId !== "/" ? (
                      <button type="button" className="cache-analyze-load cache-analyze-secondary" onClick={onDeleteSelectedSemanticNode}>
                        Delete Node
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="db-schema-meta-empty">Select a node from canvas to edit content.</div>
                )}
              </aside>
            </div>
          )}

          {studioMode === "yaml" && semanticYaml.trim() ? (
            <div className="db-schema-generated-wrap">
              <h3>Generated Semantic YAML</h3>
              <SemanticYamlCodeBlock yaml={semanticYaml} />
            </div>
          ) : null}

          <div className="semantic-mode-fab-wrap">
            {studioMode === "yaml" ? (
              <button
                type="button"
                className="semantic-mode-fab"
                title="Switch to Builder Canvas"
                aria-label="Switch to Builder Canvas"
                onClick={() => setStudioMode("builder")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 20h4l10.6-10.6a1.8 1.8 0 0 0 0-2.6l-1.4-1.4a1.8 1.8 0 0 0-2.6 0L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  <path d="M13.8 6.2l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="semantic-mode-fab semantic-mode-fab-run"
                title="Switch to YAML Validate Mode"
                aria-label="Switch to YAML Validate Mode"
                onClick={() => setStudioMode("yaml")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 6.2v11.6a.8.8 0 0 0 1.2.7l8.8-5.8a.8.8 0 0 0 0-1.4L9.2 5.5a.8.8 0 0 0-1.2.7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
