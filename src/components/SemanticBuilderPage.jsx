import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, applyNodeChanges, useEdgesState, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import {
  fetchCurrentSemanticModelYaml,
  fetchSemanticModelStudioConfig,
  generateSemanticModelDraft,
  inspectDbSchema,
  saveSemanticModel,
  validateSemanticModel,
} from "../api/convengine.api.js";
import CodeBlockToggle from "./convengine/CodeBlockToggle";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import SemanticYamlReactFlow from "./SemanticYamlReactFlow";

const DEFAULT_SEMANTIC_PALETTE_TYPES = [
  "settings",
  "entities",
  "tables",
  "relationships",
  "synonyms",
  "rules",
  "allowed_tables",
];
const DB_MANAGED_SEMANTIC_SECTIONS = ["metrics", "intent_rules", "join_hints", "value_patterns"];

const INITIAL_FLOW_VIEWPORT = {
  x: 600,
  y: 341,
  zoom: 1,
};

const PALETTE_ICONS = {
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  entities: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"></path><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="7" r="4"></circle></svg>,
  tables: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>,
  relationships: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="16" y1="12" x2="21" y2="12"></line></svg>,
  synonyms: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h10"></path><path d="M7 12h10"></path><path d="M7 17h6"></path><path d="M17 15l2 2-2 2"></path></svg>,
  rules: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M7 12h10"></path><path d="M10 18h4"></path></svg>,
  metrics: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>,
  value_patterns: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>,
  intent_rules: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  join_hints: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><path d="M6 9v6"></path><path d="M18 9v6"></path><path d="M9 18h6"></path><path d="M9 6h6"></path></svg>,
  allowed_tables: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
};
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

function getAllPointers(obj, basePath) {
  let paths = [];
  if (!obj || typeof obj !== "object") return paths;

  Object.entries(obj).forEach(([k, v]) => {
    const childPath = joinPointer(basePath, k);
    paths.push(childPath);
    if (v && typeof v === "object") {
      paths = paths.concat(getAllPointers(v, childPath));
    }
  });
  return paths;
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

const COLUMN_SEMANTIC_PROPS = ["type", "description", "primary_key", "foreign_key"];
const RELATIONSHIP_PROPS = ["name", "description", "from", "to", "type"];
const RELATIONSHIP_DIRECTION_PROPS = ["table", "column"];
const ENTITY_PROPS = ["description", "synonyms", "tables", "fields"];
const ENTITY_TABLES_PROPS = ["primary", "related"];
const ENTITY_FIELD_PROPS = ["column", "description", "type", "filterable", "searchable", "key", "aliases"];

function buildDefaultEntityField(fieldName) {
  return {
    column: fieldName,
    description: "",
    type: "text",
    filterable: true,
    searchable: true,
    key: false,
    aliases: [],
  };
}

function buildRelationshipFromJoin(join) {
  const src = String(join.source_table || "");
  const srcCol = String(join.source_column || "");
  const tgt = String(join.target_table || "");
  const tgtCol = String(join.target_column || "");
  return {
    name: `${src}_to_${tgt}`,
    description: `${src} ${srcCol} to ${tgt} ${tgtCol}`,
    from: { table: src, column: srcCol },
    to: { table: tgt, column: tgtCol },
    type: "one_to_many",
  };
}

function buildColumnObjectFromSchema(columnName, tableName, columnsByTable, joins) {
  const cols = columnsByTable.get(tableName) || [];
  const col = cols.find(c => String(c.column_name || "") === columnName);
  const entry = {};
  if (col) {
    entry.type = String(col.udt_name || col.data_type || col.column_type || "text");
    entry.description = `${columnName} in ${tableName}`;
    entry.primary_key = boolValue(col.is_primary_key);
    if (boolValue(col.is_foreign_key)) {
      const fkJoin = (joins || []).find(j =>
        String(j.source_table || "") === tableName && String(j.source_column || "") === columnName
      );
      entry.foreign_key = fkJoin
        ? `${String(fkJoin.target_table || "")}.${String(fkJoin.target_column || "")}`
        : true;
    } else {
      entry.foreign_key = null;
    }
  } else {
    entry.type = "text";
    entry.description = `${columnName} in ${tableName}`;
    entry.primary_key = false;
    entry.foreign_key = null;
  }
  return entry;
}

function typeOfNode(value) {
  if (Array.isArray(value)) return "array";
  if (isPlainObject(value)) return "object";
  return "value";
}

function ensureExpandedDefaults(value) {
  return new Set();
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
  const [paletteTypes, setPaletteTypes] = useState(DEFAULT_SEMANTIC_PALETTE_TYPES);
  const [semanticTree, setSemanticTree] = useState({});
  const [expandedPointers, setExpandedPointers] = useState(new Set());
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState([]);
  const [selectedSemanticNodeId, setSelectedSemanticNodeId] = useState("/");
  const [activeContextPointer, setActiveContextPointer] = useState("");
  const [nodeEntryDraft, setNodeEntryDraft] = useState("");
  const [nodeNewKeyDraft, setNodeNewKeyDraft] = useState("newKey");
  const [nodeAddKindDraft, setNodeAddKindDraft] = useState("value");
  const [builderMenu, setBuilderMenu] = useState({ open: false, x: 0, y: 0, openUp: false, canvasHeight: 0 });
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(60);
  const [rightPanelWidth, setRightPanelWidth] = useState(340);
  const [nodeMenu, setNodeMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    pointer: "/",
    subMenu: "",
    subMenuTop: 0,
    openUp: false,
    canvasHeight: 0,
  });
  const [builderViewport, setBuilderViewport] = useState(INITIAL_FLOW_VIEWPORT);
  const builderCanvasRef = useRef(null);
  const flowFullscreenRef = useRef(null);
  const subMenuHideTimerRef = useRef(null);
  const [isFlowFullscreen, setIsFlowFullscreen] = useState(false);

  useEffect(() => {
    if (!nodeMenu.open) {
      setActiveContextPointer("");
    }
  }, [nodeMenu.open]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFlowFullscreen(document.fullscreenElement === flowFullscreenRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFlowFullscreen = useCallback(() => {
    const el = flowFullscreenRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen?.().catch(() => { });
      return;
    }
    setRightPanelOpen(true);
    el.requestFullscreen?.().catch(() => { });
  }, []);

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

  useEffect(() => {
    if (semanticOnly) {
      setEditorMode("SEMANTIC_YAML");
    }
  }, [semanticOnly]);

  useEffect(() => {
    if (studioMode === "builder") {
      setBuilderViewport(INITIAL_FLOW_VIEWPORT);
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
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [semanticYaml]);

  useEffect(() => {
    let active = true;
    fetchSemanticModelStudioConfig()
      .then((res) => {
        if (!active) return;
        const editable = Array.isArray(res?.editableSections) ? res.editableSections : DEFAULT_SEMANTIC_PALETTE_TYPES;
        const dbManaged = new Set(
          Array.isArray(res?.dbManagedSections) && res.dbManagedSections.length
            ? res.dbManagedSections
            : DB_MANAGED_SEMANTIC_SECTIONS
        );
        const filtered = editable
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .filter((x) => !dbManaged.has(x));
        setPaletteTypes(filtered.length ? filtered : DEFAULT_SEMANTIC_PALETTE_TYPES);
      })
      .catch(() => {
        if (!active) return;
        setPaletteTypes(DEFAULT_SEMANTIC_PALETTE_TYPES.filter((x) => !DB_MANAGED_SEMANTIC_SECTIONS.includes(x)));
      });
    return () => {
      active = false;
    };
  }, []);

  const columnsByTable = useMemo(() => groupColumnsByTable(effectivePayload?.columns || []), [effectivePayload]);
  const tableNames = useMemo(() => {
    const fromTables = (effectivePayload?.tables || []).map((t) => String(t.table_name || "")).filter(Boolean);
    const fromColumns = Array.from(columnsByTable.keys());
    return Array.from(new Set([...fromTables, ...fromColumns]));
  }, [effectivePayload, columnsByTable]);

  useEffect(() => {
    try {
      const parsedTree = parseYaml(semanticYaml || "{}") || {};
      const normalizedTree = typeof parsedTree === "object" && parsedTree !== null ? parsedTree : { value: parsedTree };
      // Flatten tables: if a table entry has a nested "columns" object, promote its keys directly onto the table
      if (isPlainObject(normalizedTree.tables)) {
        for (const tbl of Object.keys(normalizedTree.tables)) {
          const entry = normalizedTree.tables[tbl];
          if (isPlainObject(entry) && isPlainObject(entry.columns)) {
            const { columns, ...rest } = entry;
            normalizedTree.tables[tbl] = { ...rest, ...columns };
          }
        }
      }
      setSemanticTree(normalizedTree);
      const defaults = ensureExpandedDefaults(normalizedTree);
      setExpandedPointers((prev) => (prev.size <= 1 ? defaults : prev));
    } catch {
      setSemanticTree({});
      setExpandedPointers(new Set());
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

  const onAddPaletteNode = (label) => {
    const defaults = {
      settings: {},
      entities: {},
      tables: {},
      relationships: [],
      synonyms: {},
      rules: {},
      allowed_tables: [],
    };
    setSemanticTree((prev) => {
      const root = isPlainObject(prev) ? structuredClone(prev) : {};
      if (!Object.prototype.hasOwnProperty.call(root, label)) {
        if (label === "relationships") {
          const joins = effectivePayload?.joins || [];
          root[label] = joins.map(j => buildRelationshipFromJoin(j));
        } else {
          root[label] = Object.prototype.hasOwnProperty.call(defaults, label) ? defaults[label] : {};
        }
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
    // Special handling: inserting inside /relationships should add a relationship from the next available join
    if (pointer === "/relationships") {
      const joins = effectivePayload?.joins || [];
      const existingItems = Array.isArray(getAtPointer(semanticTree, pointer)) ? getAtPointer(semanticTree, pointer) : [];
      const existingNames = new Set(existingItems.map(r => String(r?.name || "")));
      const nextJoin = joins.find(j => {
        const name = `${String(j.source_table || "")}_to_${String(j.target_table || "")}`;
        return !existingNames.has(name);
      });
      const relObj = nextJoin
        ? buildRelationshipFromJoin(nextJoin)
        : { name: "", description: "", from: { table: "", column: "" }, to: { table: "", column: "" }, type: "one_to_many" };
      setSemanticTree((prev) => {
        const next = structuredClone(prev);
        const arr = getAtPointer(next, pointer);
        if (Array.isArray(arr)) arr.push(relObj);
        return next;
      });
      setExpandedPointers((prev) => new Set([...prev, pointer]));
      setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
      return;
    }
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
      const parts = String(parent).split("/").filter(Boolean);
      let chain = "";
      setExpandedPointers((prev) => {
        const next = new Set(prev);
        parts.forEach((p) => {
          chain = `${chain}/${p}`;
          next.add(chain);
        });
        return next;
      });
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

  const onCopyYamlToClipboard = (pointer) => {
    const value = getAtPointer(semanticTree, pointer);
    const yaml = stringifyYaml(value ?? {});
    navigator.clipboard.writeText(yaml).catch(() => { });
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
    const parts = String(pointer).split("/").slice(1);
    const parentParts = parts.slice(0, -1);
    const parentPointer = parentParts.length ? `/${parentParts.join("/")}` : "/";
    const encodedLast = parts[parts.length - 1] || "";
    const lastSegment = decodePointerSegment(encodedLast);

    let nextFocus = parentPointer;
    const parentValue = getAtPointer(semanticTree, parentPointer);

    if (Array.isArray(parentValue)) {
      const idx = Number(lastSegment);
      const remainingLength = Number.isInteger(idx) ? parentValue.length - 1 : parentValue.length;
      if (remainingLength > 0) {
        nextFocus = joinPointer(parentPointer, remainingLength - 1);
      }
    } else if (isPlainObject(parentValue)) {
      const keys = Object.keys(parentValue).filter((k) => k !== String(lastSegment));
      if (keys.length > 0) {
        nextFocus = joinPointer(parentPointer, keys[keys.length - 1]);
      }
    }

    setSemanticTree((prev) => deleteAtPointer(prev, pointer));
    if (selectedSemanticNodeId === pointer || String(selectedSemanticNodeId || "").startsWith(`${pointer}/`)) {
      setSelectedSemanticNodeId(nextFocus || "/");
    }
    setActiveContextPointer("");
    setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
  };

  const getCanvasRelativePoint = useCallback((event) => {
    const rect = builderCanvasRef.current?.getBoundingClientRect?.();
    if (!rect) {
      return { x: event.clientX, y: event.clientY, openUp: false, canvasHeight: 0 };
    }
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const clampedY = Math.max(0, Math.min(rect.height - 8, y));
    return {
      x: Math.max(0, Math.min(rect.width - 8, x)),
      y: clampedY,
      openUp: clampedY > rect.height * 0.62,
      canvasHeight: rect.height,
    };
  }, []);

  const clearSubMenuHideTimer = useCallback(() => {
    if (subMenuHideTimerRef.current) {
      clearTimeout(subMenuHideTimerRef.current);
      subMenuHideTimerRef.current = null;
    }
  }, []);

  const scheduleSubMenuHide = useCallback(() => {
    clearSubMenuHideTimer();
    subMenuHideTimerRef.current = setTimeout(() => {
      setNodeMenu((prev) => ({ ...prev, subMenu: "" }));
    }, 120);
  }, [clearSubMenuHideTimer]);

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
          <div style={{ width: "100%" }}>
            <div className="db-schema-title-row">
              <h2>{semanticOnly ? "Semantic Layer Builder" : "DB Schema Inspect"}</h2>
              {!semanticOnly && (
                <div className="db-schema-row-scope db-schema-row-scope-top">
                  <button
                    type="button"
                    className={`db-schema-scope-btn ${editorMode === "SCHEMA_KNOWLEDGE" ? "active" : ""}`}
                    onClick={() => setEditorMode("SCHEMA_KNOWLEDGE")}
                  >
                    Schema Knowledge
                  </button>
                </div>
              )}
              {studioMode === "yaml" && (
                <div className="db-schema-row-scope db-schema-row-scope-top">
                  <button type="button" className={`db-schema-scope-btn ${rowScope === "TABLE" ? "active" : ""}`} onClick={() => setRowScope("TABLE")}>TABLE</button>
                  <button type="button" className={`db-schema-scope-btn ${rowScope === "ALL" ? "active" : ""}`} onClick={() => setRowScope("ALL")}>ALL</button>
                  <button type="button" className={`db-schema-scope-btn ${rowScope === "FLOW" ? "active" : ""}`} onClick={() => setRowScope("FLOW")}>FLOW</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", width: "100%", alignItems: "center", marginTop: "12px", padding: 0 }}>
              <p className="db-schema-grid-head" style={{ background: "transparent", padding: 0, textTransform: "none", letterSpacing: "normal", margin: 0 }}>
                schema: <b style={{ color: "var(--text-primary)" }}>{effectivePayload?.schema || query?.schema || "(from convengine.schema.active)"}</b> | mode: <b style={{ color: "var(--text-primary)" }}>{matchMode}</b> | filter: <b style={{ color: "var(--text-primary)" }}>{matchText || "(none)"}</b> | tables: <b style={{ color: "var(--text-primary)" }}>{effectivePayload?.tableCount ?? 0}</b>
              </p>

              <div style={{ flex: 1 }}></div>

              {semanticOnly && editorMode === "SEMANTIC_YAML" ? (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {studioMode === "yaml" ? (
                    <button type="button" className="sbuilder-top-toggle" onClick={() => setStudioMode("builder")} title="Switch to Builder Canvas" style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 20h4l10.6-10.6a1.8 1.8 0 0 0 0-2.6l-1.4-1.4a1.8 1.8 0 0 0-2.6 0L4 16v4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M13.8 6.2l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Canvas
                    </button>
                  ) : (
                    <button type="button" className="sbuilder-top-toggle" onClick={() => setStudioMode("yaml")} title="Switch to YAML Validate Mode" style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M8 6.2v11.6a.8.8 0 0 0 1.2.7l8.8-5.8a.8.8 0 0 0 0-1.4L9.2 5.5a.8.8 0 0 0-1.2.7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                      Editor
                    </button>
                  )}

                  <div style={{ width: "1px", height: "14px", background: "rgba(148, 163, 184, 0.4)", margin: "0 2px" }} />

                  <button type="button" className="sbuilder-top-toggle" onClick={onOpenRunDialog} style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    Run Again
                  </button>

                  <button type="button" className="sbuilder-top-toggle" onClick={onGenerate} disabled={generating || loading || allRows.length === 0} style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px", opacity: (generating || loading || allRows.length === 0) ? 0.5 : 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {generating ? "Generating Drafts..." : "Generate Draft"}
                  </button>

                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {semanticOnly && editorMode === "SEMANTIC_YAML" ? (
        <div style={{ height: "1px", width: "100%", background: "linear-gradient(90deg, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.5) 40%, rgba(148, 163, 184, 0.5) 80%, rgba(148, 163, 184, 0.1))", marginBottom: "12px", opacity: 0.8 }} />
      ) : null}

      {semanticOnly && editorMode === "SEMANTIC_YAML" && studioMode === "builder" ? (
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", marginBottom: "8px", padding: "0 4px" }}>
          <button type="button" className="sbuilder-top-toggle" onClick={() => setLeftPanelOpen(!leftPanelOpen)} title="Toggle Palette Sidebar" style={{ padding: "4px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={leftPanelOpen ? "currentColor" : "none"} fillOpacity="0.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
          </button>
          <button type="button" className="sbuilder-top-toggle" onClick={() => setRightPanelOpen(!rightPanelOpen)} title="Toggle Inspector Sidebar" style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={rightPanelOpen ? "currentColor" : "none"} fillOpacity="0.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          </button>
        </div>
      ) : null}

      {loading ? <div className="cache-analyze-error">Inspecting schema...</div> : null}
      {error ? <div className="cache-analyze-error">{error}</div> : null}
      {
        !loading && !error && (effectivePayload?.tableCount || 0) === 0 ? (
          <div className="cache-analyze-error">
            No tables matched for filter <b>{matchText || "(empty)"}</b> in schema <b>{effectivePayload?.schema || query?.schema || "(default)"}</b> using mode <b>{matchMode}</b>.
          </div>
        ) : null
      }

      {
        !loading && !error ? (
          <>
            {studioMode === "yaml" ? (
              <>
                <fieldset className="db-schema-editor sbuilder-fieldset" style={{ marginTop: "24px" }}>
                  <legend className="sbuilder-legend" style={{ textAlign: "left", marginLeft: "12px", padding: "0 8px" }}>Semantic YAML Draft (Editable)</legend>
                  <div className="db-schema-editor-head" style={{ borderBottom: "none", padding: "0 0 12px 0" }}>
                    <div className="db-schema-toolbar-actions db-schema-editor-actions-tight" style={{ width: "100%", justifyContent: "flex-end", flexWrap: "wrap" }}>
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
                      <button type="button" className="sbuilder-top-toggle" onClick={onValidateYaml} disabled={yamlBusy || !semanticYaml.trim()} style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px", opacity: (yamlBusy || !semanticYaml.trim()) ? 0.5 : 1 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        {yamlBusy ? "Validating..." : "Validate YAML"}
                      </button>
                      <button type="button" className="sbuilder-top-toggle" onClick={onSaveYaml} disabled={yamlBusy || !semanticYaml.trim()} style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px", opacity: (yamlBusy || !semanticYaml.trim()) ? 0.5 : 1 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        {yamlBusy ? "Saving..." : "Save YAML"}
                      </button>
                      <button type="button" className="sbuilder-top-toggle" onClick={onExportYaml} disabled={!semanticYaml.trim()} style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px", opacity: !semanticYaml.trim() ? 0.5 : 1 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
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
                </fieldset>

                <fieldset className="db-schema-single-flow-card sbuilder-fieldset" style={{ marginTop: "24px" }}>
                  <legend className="sbuilder-legend" style={{ textAlign: "left", marginLeft: "12px", padding: "0 8px" }}>Table / Flow</legend>
                  <div className="db-schema-single-flow-head" style={{ borderBottom: "none", padding: "0 0 12px 0", paddingTop: 0 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", color: "var(--text-secondary)" }}>
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
                    <div className="db-schema-runtime-shell" style={{ borderTop: "1px solid rgba(148, 163, 184, 0.15)", paddingTop: "12px" }}>
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
                </fieldset>

                <fieldset className="sbuilder-fieldset" style={{ marginTop: "24px" }}>
                  <legend className="sbuilder-legend" style={{ textAlign: "left", marginLeft: "12px", padding: "0 8px" }}>Schema Knowledge Rows (Editable)</legend>
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
                                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                            <button type="button" className="db-schema-delete-btn" onClick={() => onDeleteRow(r.id)} aria-label="Delete row" title="Delete row">
                              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M9 7V5.8c0-.7.5-1.3 1.3-1.3h3.4c.8 0 1.3.6 1.3 1.3V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M7.4 7l.8 11.1c.1 1 1 1.8 2 1.8h3.6c1 0 1.9-.8 2-1.8L16.6 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M10 10.4v6.2M14 10.4v6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            ) : (
              <div className="sbuilder-layout sbuilder-layout-fullpage">
                {(() => {
                  const showRightPanel = rightPanelOpen || isFlowFullscreen;
                  const handleToggleDirectChildren = (pointer) => {
                    let targetObj = semanticTree;
                    if (pointer !== "/") {
                      const parts = pointer.split("/").filter(Boolean);
                      for (let p of parts) {
                        const key = p.replace(/~1/g, "/").replace(/~0/g, "~");
                        if (targetObj) targetObj = targetObj[key];
                      }
                    }

                    if (targetObj && (isPlainObject(targetObj) || Array.isArray(targetObj))) {
                      const directChildrenPointers = [];
                      Object.keys(targetObj).forEach(k => {
                        if (targetObj[k] !== null && typeof targetObj[k] === "object") {
                          directChildrenPointers.push(joinPointer(pointer, k));
                        }
                      });

                      setExpandedPointers((prev) => {
                        const next = new Set(prev);
                        const anyDirectExpanded = directChildrenPointers.some((p) => next.has(p));

                        if (directChildrenPointers.length === 0) return prev;

                        if (anyDirectExpanded) {
                          directChildrenPointers.forEach((p) => next.delete(p));
                        } else {
                          directChildrenPointers.forEach((p) => next.add(p));
                        }

                        return next;
                      });
                    }
                  };

                  return (
                    <>
                      {leftPanelOpen && (
                        <>
                          <aside className="sbuilder-palette sbuilder-palette-grid" style={{ width: leftPanelWidth }}>
                            <div className="sbuilder-panel-title">Tools</div>
                            <div className="sbuilder-palette-icons">
                              {paletteTypes.map((nodeType) => (
                                <button key={nodeType} type="button" className="sbuilder-glyph-btn" onClick={() => onAddPaletteNode(nodeType)} title={`Add ${nodeType}`}>
                                  {PALETTE_ICONS[nodeType] || <span className="sbuilder-fallback-icon">+</span>}
                                </button>
                              ))}
                            </div>
                          </aside>
                          <div
                            className="sbuilder-resizer sbuilder-resizer-vertical"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const startX = e.clientX;
                              const startWidth = leftPanelWidth;
                              const onMouseMove = (moveEvent) => {
                                requestAnimationFrame(() => {
                                  setLeftPanelWidth(Math.max(60, Math.min(400, startWidth + (moveEvent.clientX - startX))));
                                });
                              };
                              const onMouseUp = () => {
                                document.removeEventListener("mousemove", onMouseMove);
                                document.removeEventListener("mouseup", onMouseUp);
                              };
                              document.addEventListener("mousemove", onMouseMove);
                              document.addEventListener("mouseup", onMouseUp);
                            }}
                          />
                        </>
                      )}

                      <div ref={flowFullscreenRef} className={`sbuilder-flow-shell ${isFlowFullscreen ? "is-fullscreen" : ""}`}>
                        <div ref={builderCanvasRef} className="sbuilder-fullscreen">
                          <button
                            type="button"
                            className="sbuilder-flow-fs-btn"
                            onClick={toggleFlowFullscreen}
                            title={isFlowFullscreen ? "Exit Fullscreen (Esc)" : "Open Fullscreen"}
                            aria-label={isFlowFullscreen ? "Exit Fullscreen" : "Open Fullscreen"}
                          >
                            {isFlowFullscreen ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="9 3 3 3 3 9"></polyline>
                                <polyline points="15 21 21 21 21 15"></polyline>
                                <line x1="3" y1="3" x2="10" y2="10"></line>
                                <line x1="21" y1="21" x2="14" y2="14"></line>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <polyline points="9 21 3 21 3 15"></polyline>
                                <line x1="21" y1="3" x2="14" y2="10"></line>
                                <line x1="3" y1="21" x2="10" y2="14"></line>
                              </svg>
                            )}
                          </button>
                          <SemanticYamlReactFlow
                            semanticTree={semanticTree}
                            expandedPointers={expandedPointers}
                            onTogglePointer={(pointer) => {
                              setExpandedPointers((prev) => {
                                const next = new Set(prev);
                                if (next.has(pointer)) next.delete(pointer);
                                else next.add(pointer);
                                return next;
                              });
                            }}
                            onToggleNodeChildren={handleToggleDirectChildren}
                            selectedPointer={selectedSemanticNodeId}
                            activeContextPointer={activeContextPointer}
                            defaultViewport={INITIAL_FLOW_VIEWPORT}
                            viewport={builderViewport}
                            onViewportChange={(vp) => setBuilderViewport(vp)}
                            onRowContextMenu={(event, pointer) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const point = getCanvasRelativePoint(event);
                              setActiveContextPointer(pointer || "");
                              setBuilderMenu({ open: false, x: 0, y: 0 });
                              setNodeMenu({
                                open: true,
                                x: point.x,
                                y: point.y,
                                pointer: pointer || "/",
                                subMenu: "",
                                subMenuTop: 0,
                                openUp: point.openUp,
                                canvasHeight: point.canvasHeight,
                              });
                            }}
                            onNodeContextMenu={(event, node) => {
                              event.preventDefault();
                              const point = getCanvasRelativePoint(event);
                              const pointer = node?.data?.pointer || "/";
                              setActiveContextPointer(pointer);
                              setNodeMenu({
                                open: true,
                                x: point.x,
                                y: point.y,
                                pointer,
                                subMenu: "",
                                subMenuTop: 0,
                                openUp: point.openUp,
                                canvasHeight: point.canvasHeight,
                              });
                            }}
                            onNodeClick={(_, node) => {
                              const pointer = node?.data?.pointer || "/";
                              setSelectedSemanticNodeId(pointer);
                              setActiveContextPointer("");
                              setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                            }}
                            onNodeDoubleClick={(event, node) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const pointer = node?.data?.pointer || "/";
                              handleToggleDirectChildren(pointer);
                            }}
                            onPaneClick={() => {
                              setBuilderMenu({ open: false, x: 0, y: 0 });
                              setActiveContextPointer("");
                              setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                            }}
                            onPaneContextMenu={(event) => {
                              event.preventDefault();
                              const point = getCanvasRelativePoint(event);
                              setBuilderMenu({
                                open: true,
                                x: point.x,
                                y: point.y,
                                openUp: point.openUp,
                                canvasHeight: point.canvasHeight,
                              });
                              setActiveContextPointer("");
                              setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                            }}
                          />

                          {builderMenu.open ? (
                            <div className="sbuilder-context-menu" style={{
                              left: builderMenu.x,
                              top: builderMenu.openUp ? "auto" : builderMenu.y,
                              bottom: builderMenu.openUp ? Math.max(8, (builderMenu.canvasHeight || 0) - builderMenu.y) : "auto",
                            }}>
                              <div className="sbuilder-context-title">Add Node</div>
                              {paletteTypes.map((nodeType) => (
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
                            <div
                              className="sbuilder-ctx-wrapper"
                              onMouseLeave={() => {
                                setActiveContextPointer("");
                                setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                              }}
                            >
                              <div className="sbuilder-context-menu sbuilder-node-menu" style={{
                                left: nodeMenu.x,
                                top: nodeMenu.openUp ? "auto" : nodeMenu.y,
                                bottom: nodeMenu.openUp ? Math.max(8, (nodeMenu.canvasHeight || 0) - nodeMenu.y) : "auto",
                              }}>
                                <div className="sbuilder-context-title">{String(nodeMenu.pointer || "/").replace(/^\//, "") || "root"}</div>
                                <button type="button" onClick={() => onFocusParent(nodeMenu.pointer)}>
                                  Focus Parent Node
                                </button>
                                <button
                                  type="button"
                                  className="sbuilder-ctx-has-sub"
                                  onMouseEnter={(e) => {
                                    clearSubMenuHideTimer();
                                    const top = e.currentTarget?.offsetTop ?? 0;
                                    setNodeMenu((prev) => ({ ...prev, subMenu: "copy", subMenuTop: top }));
                                  }}
                                  onMouseLeave={scheduleSubMenuHide}
                                >
                                  Copy
                                  <svg className="sbuilder-ctx-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                                <div className="sbuilder-ctx-divider" />
                                <button type="button" onClick={() => onOpenNodeInTab(nodeMenu.pointer)}>
                                  Show Yaml in New Tab
                                </button>
                                <button type="button" onClick={() => onCopyYamlToClipboard(nodeMenu.pointer)}>
                                  Copy Yaml to Clipboard
                                </button>
                                <div className="sbuilder-ctx-divider" />
                                <button
                                  type="button"
                                  className="sbuilder-ctx-has-sub"
                                  onMouseEnter={(e) => {
                                    clearSubMenuHideTimer();
                                    const top = e.currentTarget?.offsetTop ?? 0;
                                    setNodeMenu((prev) => ({ ...prev, subMenu: "inside", subMenuTop: top }));
                                  }}
                                  onMouseLeave={scheduleSubMenuHide}
                                >
                                  Insert Inside
                                  <svg className="sbuilder-ctx-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                                <button
                                  type="button"
                                  className="sbuilder-ctx-has-sub"
                                  onMouseEnter={(e) => {
                                    clearSubMenuHideTimer();
                                    const top = e.currentTarget?.offsetTop ?? 0;
                                    setNodeMenu((prev) => ({ ...prev, subMenu: "before", subMenuTop: top }));
                                  }}
                                  onMouseLeave={scheduleSubMenuHide}
                                >
                                  Insert Before
                                  <svg className="sbuilder-ctx-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                                <button
                                  type="button"
                                  className="sbuilder-ctx-has-sub"
                                  onMouseEnter={(e) => {
                                    clearSubMenuHideTimer();
                                    const top = e.currentTarget?.offsetTop ?? 0;
                                    setNodeMenu((prev) => ({ ...prev, subMenu: "after", subMenuTop: top }));
                                  }}
                                  onMouseLeave={scheduleSubMenuHide}
                                >
                                  Insert After
                                  <svg className="sbuilder-ctx-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                                {nodeMenu.pointer !== "/" ? (
                                  <>
                                    <div className="sbuilder-ctx-divider" />
                                    <button type="button" className="danger" onClick={() => onDeleteNodeAtPointer(nodeMenu.pointer)}>
                                      Delete
                                    </button>
                                  </>
                                ) : null}
                                {nodeMenu.subMenu === "copy" ? (
                                  <div
                                    className="sbuilder-context-menu sbuilder-submenu"
                                    style={{ top: `${Math.max(0, Number(nodeMenu.subMenuTop || 0) - 4)}px` }}
                                    onMouseEnter={clearSubMenuHideTimer}
                                    onMouseLeave={scheduleSubMenuHide}
                                  >
                                    <button type="button" onClick={() => {
                                      navigator.clipboard.writeText(nodeMenu.pointer).catch(() => { });
                                      setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                                    }}>Copy JSON Path</button>
                                    <button type="button" onClick={() => {
                                      const seg = nodeMenu.pointer.split("/").filter(Boolean).pop() || "";
                                      navigator.clipboard.writeText(seg).catch(() => { });
                                      setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                                    }}>Copy Key</button>
                                    <button type="button" onClick={() => {
                                      const val = getAtPointer(semanticTree, nodeMenu.pointer);
                                      const str = typeof val === "object" ? JSON.stringify(val, null, 2) : String(val ?? "");
                                      navigator.clipboard.writeText(str).catch(() => { });
                                      setNodeMenu((prev) => ({ ...prev, open: false, subMenu: "" }));
                                    }}>Copy Value</button>
                                  </div>
                                ) : null}
                                {(nodeMenu.subMenu === "inside" || nodeMenu.subMenu === "before" || nodeMenu.subMenu === "after") ? (
                                  <div
                                    className="sbuilder-context-menu sbuilder-submenu"
                                    style={{ top: `${Math.max(0, Number(nodeMenu.subMenuTop || 0) - 4)}px` }}
                                    onMouseEnter={clearSubMenuHideTimer}
                                    onMouseLeave={scheduleSubMenuHide}
                                  >
                                    <button type="button" onClick={() => nodeMenu.subMenu === "inside" ? onInsertInside(nodeMenu.pointer, "object") : onInsertSibling(nodeMenu.pointer, nodeMenu.subMenu, "object")}>
                                      Object
                                    </button>
                                    {!(nodeMenu.subMenu === "inside" && nodeMenu.pointer === "/tables") && (
                                      <>
                                        <button type="button" onClick={() => nodeMenu.subMenu === "inside" ? onInsertInside(nodeMenu.pointer, "array") : onInsertSibling(nodeMenu.pointer, nodeMenu.subMenu, "array")}>
                                          Array
                                        </button>
                                        <button type="button" onClick={() => nodeMenu.subMenu === "inside" ? onInsertInside(nodeMenu.pointer, "value") : onInsertSibling(nodeMenu.pointer, nodeMenu.subMenu, "value")}>
                                          Value
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {showRightPanel && (
                          <>
                            <div
                              className="sbuilder-resizer sbuilder-resizer-vertical"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startWidth = rightPanelWidth;
                                const onMouseMove = (moveEvent) => {
                                  requestAnimationFrame(() => {
                                    setRightPanelWidth(Math.max(200, Math.min(600, startWidth - (moveEvent.clientX - startX))));
                                  });
                                };
                                const onMouseUp = () => {
                                  document.removeEventListener("mousemove", onMouseMove);
                                  document.removeEventListener("mouseup", onMouseUp);
                                };
                                document.addEventListener("mousemove", onMouseMove);
                                document.addEventListener("mouseup", onMouseUp);
                              }}
                            />
                            <aside className="sbuilder-inspector" style={{ width: rightPanelWidth }}>
                              {selectedSemanticNodeId ? (
                                <>
                                  <fieldset className="sbuilder-fieldset">
                                    <legend className="sbuilder-legend">Node Type</legend>
                                    <input value={selectedSemanticNodeId} disabled style={{ marginBottom: "8px" }} />
                                    <label className="sbuilder-label">Type</label>
                                    <input value={selectedSemanticNodeKind} disabled />

                                    {selectedSemanticNodeKind === "value" ? (
                                      <div style={{ marginTop: "12px" }}>
                                        <label className="sbuilder-label">Value</label>
                                        <input
                                          value={String(selectedSemanticNodeValue ?? "")}
                                          onChange={(e) => onUpdateNodeValue(selectedSemanticNodeId, e.target.value)}
                                        />
                                      </div>
                                    ) : null}
                                  </fieldset>

                                  {selectedSemanticNodeKind === "object" ? (
                                    <fieldset className="sbuilder-fieldset">
                                      <legend className="sbuilder-legend">Properties</legend>
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
                                              {childKind === "value" ? (() => {
                                                const parentParts = (selectedSemanticNodeId || "").split("/").filter(Boolean);
                                                const isEntityTablesPrimary = parentParts.length === 3 && parentParts[0] === "entities" && parentParts[2] === "tables" && k === "primary";
                                                if (isEntityTablesPrimary) {
                                                  return (
                                                    <select value={String(v ?? "")} onChange={(e) => onUpdateNodeValue(childPtr, e.target.value)} style={{ width: "100%" }}>
                                                      <option value="">-- select table --</option>
                                                      {tableNames.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                  );
                                                }
                                                return <input value={String(v ?? "")} onChange={(e) => onUpdateNodeValue(childPtr, e.target.value)} />;
                                              })() : (
                                                <button type="button" className={`sbuilder-neon-chip sbuilder-neon-${childKind}`} onClick={() => {
                                                  setExpandedPointers((prev) => new Set([...prev, selectedSemanticNodeId, childPtr]));
                                                  setSelectedSemanticNodeId(childPtr);
                                                }}>
                                                  {childKind === 'array' ? <span className="sbuilder-neon-icon">[ ]</span> : <span className="sbuilder-neon-icon">{"{ }"}</span>}
                                                  Open {childKind}
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "4px" }}><polyline points="9 18 15 12 9 6"></polyline></svg>
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {(() => {
                                        const ptrParts = (selectedSemanticNodeId || "").split("/").filter(Boolean);
                                        const isTablesRoot = selectedSemanticNodeId === "/tables";
                                        const isTableChild = ptrParts.length === 2 && ptrParts[0] === "tables";
                                        const isColumnChild = ptrParts.length === 3 && ptrParts[0] === "tables";
                                        const parentTableName = isTableChild ? ptrParts[1] : isColumnChild ? ptrParts[1] : null;

                                        if (isTablesRoot) {
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Property</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select table --</option>
                                                  {tableNames.filter(t => {
                                                    const existing = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                                    return !existing.includes(t);
                                                  }).map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  const tableName = nodeNewKeyDraft;
                                                  const cols = columnsByTable.get(tableName) || [];
                                                  const tableObj = {};
                                                  cols.forEach(c => {
                                                    const cn = String(c.column_name || "");
                                                    if (!cn) return;
                                                    tableObj[cn] = buildColumnObjectFromSchema(cn, tableName, columnsByTable, effectivePayload?.joins || []);
                                                  });
                                                  setSemanticTree((prev) => {
                                                    const next = structuredClone(prev);
                                                    const target = getAtPointer(next, selectedSemanticNodeId);
                                                    if (isPlainObject(target)) {
                                                      target[tableName] = tableObj;
                                                    }
                                                    return next;
                                                  });
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        if (isTableChild) {
                                          const tableCols = columnsByTable.get(parentTableName) || [];
                                          const existingKeys = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                          const availableCols = tableCols.filter(c => !existingKeys.includes(String(c.column_name || "")));
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Column</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select column --</option>
                                                  {availableCols.map(c => {
                                                    const cn = String(c.column_name || "");
                                                    return <option key={cn} value={cn}>{cn}</option>;
                                                  })}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  const colObj = buildColumnObjectFromSchema(
                                                    nodeNewKeyDraft,
                                                    parentTableName,
                                                    columnsByTable,
                                                    effectivePayload?.joins || []
                                                  );
                                                  setSemanticTree((prev) => {
                                                    const next = structuredClone(prev);
                                                    const target = getAtPointer(next, selectedSemanticNodeId);
                                                    if (isPlainObject(target)) {
                                                      target[nodeNewKeyDraft] = colObj;
                                                    }
                                                    return next;
                                                  });
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        if (isColumnChild) {
                                          const existingKeys = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                          const availableProps = COLUMN_SEMANTIC_PROPS.filter(p => !existingKeys.includes(p));
                                          if (availableProps.length === 0) return null;
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Property</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select property --</option>
                                                  {availableProps.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  let defaultVal = "";
                                                  if (nodeNewKeyDraft === "primary_key") defaultVal = "false";
                                                  if (nodeNewKeyDraft === "type") defaultVal = "text";
                                                  setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, "value", nodeNewKeyDraft));
                                                  if (defaultVal) {
                                                    setTimeout(() => {
                                                      onUpdateNodeValue(joinPointer(selectedSemanticNodeId, nodeNewKeyDraft), defaultVal);
                                                    }, 0);
                                                  }
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        // Relationship item: /relationships/0, /relationships/1 ...
                                        const isRelationshipItem = ptrParts[0] === "relationships" && ptrParts.length === 2 && /^\d+$/.test(ptrParts[1]);
                                        // Relationship from/to: /relationships/0/from, /relationships/0/to
                                        const isRelationshipDirection = ptrParts[0] === "relationships" && ptrParts.length === 3 && /^\d+$/.test(ptrParts[1]) && (ptrParts[2] === "from" || ptrParts[2] === "to");

                                        if (isRelationshipItem) {
                                          const existingKeys = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                          const availableProps = RELATIONSHIP_PROPS.filter(p => !existingKeys.includes(p));
                                          if (availableProps.length === 0) return null;
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Property</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select property --</option>
                                                  {availableProps.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  const kind = (nodeNewKeyDraft === "from" || nodeNewKeyDraft === "to") ? "object" : "value";
                                                  setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, kind, nodeNewKeyDraft));
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        if (isRelationshipDirection) {
                                          const existingKeys = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                          const availableProps = RELATIONSHIP_DIRECTION_PROPS.filter(p => !existingKeys.includes(p));
                                          if (availableProps.length === 0) return null;
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Property</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select property --</option>
                                                  {availableProps.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, "value", nodeNewKeyDraft));
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        // --- Entities hierarchy ---
                                        const isEntitiesRoot = selectedSemanticNodeId === "/entities";
                                        const isEntityChild = ptrParts[0] === "entities" && ptrParts.length === 2;
                                        const isEntityTables = ptrParts[0] === "entities" && ptrParts.length === 3 && ptrParts[2] === "tables";
                                        const isEntityFields = ptrParts[0] === "entities" && ptrParts.length === 3 && ptrParts[2] === "fields";
                                        const isEntityFieldChild = ptrParts[0] === "entities" && ptrParts.length === 4 && ptrParts[2] === "fields";

                                        if (isEntitiesRoot) {
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Entity</legend>
                                              <div className="sbuilder-inline">
                                                <input value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} placeholder="entity name" style={{ flex: 1 }} />
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, "object", nodeNewKeyDraft));
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        if (isEntityChild) {
                                          const existingKeys = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                          const availableProps = ENTITY_PROPS.filter(p => !existingKeys.includes(p));
                                          if (availableProps.length === 0) return null;
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Property</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select property --</option>
                                                  {availableProps.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  const kind = (nodeNewKeyDraft === "tables" || nodeNewKeyDraft === "fields") ? "object" : "value";
                                                  setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, kind, nodeNewKeyDraft));
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        if (isEntityTables) {
                                          const existingKeys = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                          const availableProps = ENTITY_TABLES_PROPS.filter(p => !existingKeys.includes(p));
                                          if (availableProps.length === 0) return null;
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Property</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select property --</option>
                                                  {availableProps.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  const kind = nodeNewKeyDraft === "related" ? "array" : "value";
                                                  setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, kind, nodeNewKeyDraft));
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        if (isEntityFields) {
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Field</legend>
                                              <div className="sbuilder-inline">
                                                <input value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} placeholder="field name" style={{ flex: 1 }} />
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  const fieldObj = buildDefaultEntityField(nodeNewKeyDraft);
                                                  setSemanticTree((prev) => {
                                                    const next = structuredClone(prev);
                                                    const target = getAtPointer(next, selectedSemanticNodeId);
                                                    if (isPlainObject(target)) {
                                                      target[nodeNewKeyDraft] = fieldObj;
                                                    }
                                                    return next;
                                                  });
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        if (isEntityFieldChild) {
                                          const existingKeys = selectedSemanticNodeValue ? Object.keys(selectedSemanticNodeValue) : [];
                                          const availableProps = ENTITY_FIELD_PROPS.filter(p => !existingKeys.includes(p));
                                          if (availableProps.length === 0) return null;
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Property</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select property --</option>
                                                  {availableProps.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  const kind = nodeNewKeyDraft === "aliases" ? "array" : "value";
                                                  setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, kind, nodeNewKeyDraft));
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }

                                        return (
                                          <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                            <legend className="sbuilder-legend">Add Property</legend>
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
                                          </fieldset>
                                        );
                                      })()}
                                    </fieldset>
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
                                              {childKind === "value" ? (() => {
                                                const arrParts = (selectedSemanticNodeId || "").split("/").filter(Boolean);
                                                const isEntityRelated = arrParts.length === 4 && arrParts[0] === "entities" && arrParts[2] === "tables" && arrParts[3] === "related";
                                                if (isEntityRelated) {
                                                  return (
                                                    <select value={String(item ?? "")} onChange={(e) => onUpdateNodeValue(childPtr, e.target.value)} style={{ width: "100%" }}>
                                                      <option value="">-- select table --</option>
                                                      {tableNames.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                  );
                                                }
                                                return <input value={String(item ?? "")} onChange={(e) => onUpdateNodeValue(childPtr, e.target.value)} />;
                                              })() : (
                                                <button type="button" className={`sbuilder-neon-chip sbuilder-neon-${childKind}`} onClick={() => {
                                                  setExpandedPointers((prev) => new Set([...prev, selectedSemanticNodeId, childPtr]));
                                                  setSelectedSemanticNodeId(childPtr);
                                                }}>
                                                  {childKind === 'array' ? <span className="sbuilder-neon-icon">[ ]</span> : <span className="sbuilder-neon-icon">{"{ }"}</span>}
                                                  Open {childKind}
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "4px" }}><polyline points="9 18 15 12 9 6"></polyline></svg>
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {/* Add Item Panel */}
                                      {(() => {
                                        const isRelationshipsArray = selectedSemanticNodeId === "/relationships";
                                        if (isRelationshipsArray) {
                                          const joins = effectivePayload?.joins || [];
                                          const existingItems = Array.isArray(selectedSemanticNodeValue) ? selectedSemanticNodeValue : [];
                                          const existingNames = new Set(existingItems.map(r => String(r?.name || "")));
                                          const availableJoins = joins.filter(j => {
                                            const name = `${String(j.source_table || "")}_to_${String(j.target_table || "")}`;
                                            return !existingNames.has(name);
                                          });
                                          if (availableJoins.length === 0) return null;
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Relationship</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select join --</option>
                                                  {availableJoins.map((j, i) => {
                                                    const label = `${j.source_table}.${j.source_column} → ${j.target_table}.${j.target_column}`;
                                                    return <option key={i} value={i}>{label}</option>;
                                                  })}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={nodeNewKeyDraft === ""} onClick={() => {
                                                  if (nodeNewKeyDraft === "") return;
                                                  const join = availableJoins[Number(nodeNewKeyDraft)];
                                                  if (!join) return;
                                                  const relObj = buildRelationshipFromJoin(join);
                                                  setSemanticTree((prev) => {
                                                    const next = structuredClone(prev);
                                                    const arr = getAtPointer(next, selectedSemanticNodeId);
                                                    if (Array.isArray(arr)) {
                                                      arr.push(relObj);
                                                    }
                                                    return next;
                                                  });
                                                  setNodeNewKeyDraft("");
                                                }}>Add</button>
                                                <button type="button" className="cache-analyze-load" style={{ marginLeft: "4px" }} onClick={() => {
                                                  setSemanticTree((prev) => {
                                                    const next = structuredClone(prev);
                                                    const arr = getAtPointer(next, selectedSemanticNodeId);
                                                    if (Array.isArray(arr)) {
                                                      availableJoins.forEach(j => arr.push(buildRelationshipFromJoin(j)));
                                                    }
                                                    return next;
                                                  });
                                                  setNodeNewKeyDraft("");
                                                }}>Add All ({availableJoins.length})</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }
                                        // Entity tables/related array: /entities/<name>/tables/related
                                        const relatedParts = (selectedSemanticNodeId || "").split("/").filter(Boolean);
                                        const isEntityRelatedArray = relatedParts.length === 4 && relatedParts[0] === "entities" && relatedParts[2] === "tables" && relatedParts[3] === "related";
                                        if (isEntityRelatedArray) {
                                          return (
                                            <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                              <legend className="sbuilder-legend">Add Related Table</legend>
                                              <div className="sbuilder-inline">
                                                <select value={nodeNewKeyDraft} onChange={(e) => setNodeNewKeyDraft(e.target.value)} style={{ flex: 1 }}>
                                                  <option value="">-- select table --</option>
                                                  {tableNames.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                <button type="button" className="cache-analyze-load" disabled={!nodeNewKeyDraft} onClick={() => {
                                                  if (!nodeNewKeyDraft) return;
                                                  setSemanticTree((prev) => {
                                                    const next = structuredClone(prev);
                                                    const arr = getAtPointer(next, selectedSemanticNodeId);
                                                    if (Array.isArray(arr)) {
                                                      arr.push(nodeNewKeyDraft);
                                                    }
                                                    return next;
                                                  });
                                                  setNodeNewKeyDraft("");
                                                }}>Add</button>
                                              </div>
                                            </fieldset>
                                          );
                                        }
                                        return (
                                          <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                            <legend className="sbuilder-legend">Add Item</legend>
                                            <div className="sbuilder-inline">
                                              <select value={nodeAddKindDraft} onChange={(e) => setNodeAddKindDraft(e.target.value)}>
                                                <option value="value">value</option>
                                                <option value="object">object</option>
                                                <option value="array">array</option>
                                              </select>
                                              <button type="button" className="cache-analyze-load" onClick={() => {
                                                setSemanticTree((prev) => addChildAtPointer(prev, selectedSemanticNodeId, nodeAddKindDraft));
                                              }}>Add</button>
                                            </div>
                                          </fieldset>
                                        );
                                      })()}
                                    </>
                                  ) : null}

                                  {selectedSemanticNodeId !== "/" ? (
                                    <fieldset className="sbuilder-fieldset" style={{ marginTop: "12px" }}>
                                      <legend className="sbuilder-legend">Actions</legend>
                                      <button
                                        type="button"
                                        className="sbuilder-neon-chip"
                                        style={{ width: "100%", justifyContent: "center", color: "#fca5a5", borderColor: "rgba(239, 68, 68, 0.5)", boxShadow: "0 0 8px rgba(239, 68, 68, 0.2)", background: "#3f1c1c" }}
                                        onClick={() => {
                                          onDeleteNodeAtPointer(selectedSemanticNodeId);
                                          setSelectedSemanticNodeId("/");
                                        }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                        Delete Node
                                      </button>
                                    </fieldset>
                                  ) : null}
                                </>
                              ) : (
                                <div className="db-schema-meta-empty">Select a node from canvas to edit content.</div>
                              )}
                            </aside>
                          </>
                        )}
                      </div>

                    </>
                  );
                })()}
              </div>
            )}

            {studioMode === "yaml" && semanticYaml.trim() ? (
              <fieldset className="sbuilder-fieldset db-schema-generated-wrap" style={{ marginTop: "24px", marginBottom: "32px", width: "calc(100% - 32px)", marginLeft: "16px" }}>
                <legend className="sbuilder-legend" style={{ textAlign: "left", marginLeft: "12px", padding: "0 8px" }}>Generated Semantic YAML</legend>
                <SemanticYamlCodeBlock yaml={semanticYaml} />
              </fieldset>
            ) : null}

          </>
        ) : null
      }
    </section >
  );
}
