import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeSemanticQueryDebug,
  analyzeSemanticQueryDebugStream,
  getConvEngineRuntimeConfig,
} from "../api/convengine.api.js";
import { DbTable } from "./convengine/DbTable.jsx";

function stageClass(stage) {
  const normalized = String(stage || "").toUpperCase();
  if (normalized.includes("ERROR")) {
    return "error";
  }
  if (normalized.includes("RESOLUTION")) {
    return "resolution";
  }
  if (normalized.includes("FINAL")) {
    return "final";
  }
  if (normalized.includes("DONE")) {
    return "done";
  }
  if (normalized.includes("START")) {
    return "start";
  }
  return "default";
}

function colorizeJson(value) {
  let json = "{}";
  try {
    json = JSON.stringify(value ?? {}, null, 2);
  } catch {
    json = "{}";
  }
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (match.endsWith(":")) {
        return `<span class="sqd-json-key">${match}</span>`;
      }
      if (match.startsWith("\"")) {
        return `<span class="sqd-json-string">${match}</span>`;
      }
      if (match === "true" || match === "false") {
        return `<span class="sqd-json-boolean">${match}</span>`;
      }
      if (match === "null") {
        return `<span class="sqd-json-null">${match}</span>`;
      }
      return `<span class="sqd-json-number">${match}</span>`;
    },
  );
}

function colorizeSql(sqlText) {
  const sql = String(sqlText || "--");
  const escaped = sql
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withStrings = escaped.replace(/'(?:''|[^'])*'/g, (match) => `<span class="sqd-sql-string">${match}</span>`);
  const withParams = withStrings.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => `<span class="sqd-sql-param">${match}</span>`);
  const withNumbers = withParams.replace(/\b\d+(?:\.\d+)?\b/g, (match) => `<span class="sqd-sql-number">${match}</span>`);
  const keywordRegex = /\b(SELECT|FROM|WHERE|LEFT|RIGHT|INNER|OUTER|JOIN|ON|AS|AND|OR|NOT|IN|IS|NULL|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|DISTINCT|CASE|WHEN|THEN|ELSE|END|ASC|DESC|LIKE|ILIKE|BETWEEN|EXISTS)\b/gi;
  return withNumbers.replace(keywordRegex, (match) => `<span class="sqd-sql-keyword">${match.toUpperCase()}</span>`);
}

function splitTopLevelByComma(text) {
  const out = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" && text[i - 1] !== "\\") {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }
    if (!inSingleQuote) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        if (current.trim()) out.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function extractSegment(sqlLower, source, startKeyword, endKeywords) {
  const start = sqlLower.indexOf(startKeyword);
  if (start < 0) return "";
  let end = source.length;
  for (const k of endKeywords) {
    const idx = sqlLower.indexOf(k, start + startKeyword.length);
    if (idx >= 0 && idx < end) end = idx;
  }
  return source.slice(start + startKeyword.length, end).trim();
}

function formatSql(sqlText) {
  const raw = String(sqlText || "").replace(/\s+/g, " ").trim();
  if (!raw) return "--";

  const lower = raw.toLowerCase();
  if (!lower.startsWith("select ")) {
    return raw;
  }

  const selectPart = extractSegment(lower, raw, "select ", [" from "]);
  const fromPart = extractSegment(lower, raw, " from ", [" where ", " group by ", " order by ", " having ", " limit ", " offset "]);
  const wherePart = extractSegment(lower, raw, " where ", [" group by ", " order by ", " having ", " limit ", " offset "]);
  const groupByPart = extractSegment(lower, raw, " group by ", [" order by ", " having ", " limit ", " offset "]);
  const havingPart = extractSegment(lower, raw, " having ", [" order by ", " limit ", " offset "]);
  const orderByPart = extractSegment(lower, raw, " order by ", [" limit ", " offset "]);
  const limitPart = extractSegment(lower, raw, " limit ", [" offset "]);
  const offsetPart = extractSegment(lower, raw, " offset ", []);

  const lines = [];
  lines.push("SELECT");
  const selectCols = splitTopLevelByComma(selectPart);
  selectCols.forEach((col, idx) => {
    const suffix = idx === selectCols.length - 1 ? "" : ",";
    lines.push(`  ${col}${suffix}`);
  });

  if (fromPart) {
    const joinRegex = /\s+(left\s+outer\s+join|left\s+join|right\s+outer\s+join|right\s+join|full\s+outer\s+join|full\s+join|inner\s+join|join)\s+/ig;
    const segments = fromPart.split(joinRegex).filter(Boolean);
    if (segments.length > 0) {
      lines.push("FROM");
      lines.push(`  ${segments[0].trim()}`);
      for (let i = 1; i < segments.length; i += 2) {
        const joinType = segments[i] || "";
        const joinBody = segments[i + 1] || "";
        const onIdx = joinBody.toLowerCase().indexOf(" on ");
        if (onIdx >= 0) {
          const tableExpr = joinBody.slice(0, onIdx).trim();
          const onExpr = joinBody.slice(onIdx + 4).trim();
          lines.push(`  ${joinType.toUpperCase()} ${tableExpr}`);
          lines.push(`    ON ${onExpr}`);
        } else {
          lines.push(`  ${joinType.toUpperCase()} ${joinBody.trim()}`);
        }
      }
    }
  }

  if (wherePart) {
    lines.push("WHERE");
    const andParts = wherePart.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    andParts.forEach((part, idx) => {
      if (idx === 0) lines.push(`  ${part}`);
      else lines.push(`  AND ${part}`);
    });
  }
  if (groupByPart) {
    lines.push("GROUP BY");
    splitTopLevelByComma(groupByPart).forEach((item, idx, arr) => {
      lines.push(`  ${item}${idx === arr.length - 1 ? "" : ","}`);
    });
  }
  if (havingPart) {
    lines.push("HAVING");
    lines.push(`  ${havingPart}`);
  }
  if (orderByPart) {
    lines.push("ORDER BY");
    splitTopLevelByComma(orderByPart).forEach((item, idx, arr) => {
      lines.push(`  ${item}${idx === arr.length - 1 ? "" : ","}`);
    });
  }
  if (limitPart) lines.push(`LIMIT ${limitPart}`);
  if (offsetPart) lines.push(`OFFSET ${offsetPart}`);

  return lines.join("\n");
}

function normalizeStageSelection(next) {
  const out = { ...next };
  if (!out.retrieval) {
    out.jsonPath = false;
    out.ast = false;
    out.sqlGeneration = false;
    out.sqlExecution = false;
    return out;
  }
  if (!out.jsonPath) {
    out.ast = false;
    out.sqlGeneration = false;
    out.sqlExecution = false;
    return out;
  }
  if (!out.ast) {
    out.sqlGeneration = false;
    out.sqlExecution = false;
  }
  if (!out.sqlGeneration) {
    out.sqlExecution = false;
  }
  return out;
}

function isMarkdownTableSeparator(line) {
  const trimmed = String(line || "").trim();
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(trimmed);
}

function splitMarkdownRow(line) {
  const trimmed = String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function prettifyMarkdownHeader(header) {
  const raw = typeof header === "string" ? header.trim() : String(header ?? "").trim();
  if (!raw) return "";
  const withSpaces = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const acronym = new Map([
    ["id", "ID"],
    ["ui", "UI"],
    ["aso", "ASO"],
    ["don", "DON"],
    ["sql", "SQL"],
  ]);
  return withSpaces
    .split(" ")
    .map((token) => {
      const lower = token.toLowerCase();
      if (acronym.has(lower)) return acronym.get(lower);
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function parseMarkdownTableSegments(text) {
  const source = typeof text === "string" ? text : String(text ?? "");
  const lines = source.split(/\r?\n/);
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    if (!line.includes("|") || !isMarkdownTableSeparator(next)) {
      const start = i;
      i += 1;
      while (i < lines.length) {
        const maybeHeader = lines[i];
        const maybeSep = i + 1 < lines.length ? lines[i + 1] : "";
        if (maybeHeader.includes("|") && isMarkdownTableSeparator(maybeSep)) break;
        i += 1;
      }
      const block = lines.slice(start, i).join("\n").trim();
      if (block) segments.push({ type: "text", text: block });
      continue;
    }

    const headers = splitMarkdownRow(line);
    const rows = [];
    i += 2;
    while (i < lines.length) {
      const rowLine = lines[i];
      if (!rowLine.includes("|") || !rowLine.trim()) break;
      rows.push(splitMarkdownRow(rowLine));
      i += 1;
    }
    segments.push({ type: "table", headers, rows });
    while (i < lines.length && !lines[i].trim()) i += 1;
  }

  return segments.length ? segments : [{ type: "text", text: source }];
}

function JsonBlock({ value, className = "sqd-pre" }) {
  return <pre className={`${className} sqd-pre-json`} dangerouslySetInnerHTML={{ __html: colorizeJson(value) }} />;
}

function SqlBlock({ sql }) {
  return <pre className="sqd-pre sqd-pre-sql" dangerouslySetInnerHTML={{ __html: colorizeSql(formatSql(sql)) }} />;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value) {
  const n = asNumber(value);
  return n.toFixed(3).replace(/\.?0+$/, "");
}

function fmtMaybe(value) {
  if (value == null || value === "") {
    return "n/a";
  }
  return fmt(value);
}

const STAGE_OPTIONS = [
  {
    key: "retrieval",
    label: "Retrieval",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="m20 20-3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "jsonPath",
    label: "Json Path",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 4H4v4M16 20h4v-4M20 8V4h-4M4 16v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "ast",
    label: "AST",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 4h12M6 12h12M6 20h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "sqlGeneration",
    label: "SQL Generation",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "sqlExecution",
    label: "SQL Execution",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="7" ry="3" stroke="currentColor" strokeWidth="2" />
        <path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
];

export default function SemanticQueryDebugPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [streamEvents, setStreamEvents] = useState([]);
  const [panelWidth, setPanelWidth] = useState(420);
  const [resizing, setResizing] = useState(false);
  const [expandedEventIndex, setExpandedEventIndex] = useState(null);
  const [debugStages, setDebugStages] = useState({
    retrieval: true,
    jsonPath: true,
    ast: true,
    sqlGeneration: true,
    sqlExecution: true,
  });
  const splitRef = useRef(null);

  const jsonPathDisabled = !debugStages.retrieval;
  const astDisabled = jsonPathDisabled || !debugStages.jsonPath;
  const sqlGenerationDisabled = astDisabled || !debugStages.ast;
  const sqlExecutionDisabled = sqlGenerationDisabled || !debugStages.sqlGeneration;

  const candidateRows = useMemo(() => {
    const rows = Array.isArray(result?.candidateEntities) ? result.candidateEntities : [];
    return rows.map((row, index) => ({
      rank: index + 1,
      name: row?.name || "",
      score: row?.score ?? "",
      deterministicScore: row?.deterministicScore ?? "",
      vectorScore: row?.vectorScore ?? "",
      reasons: Array.isArray(row?.reasons) ? row.reasons.join(", ") : "",
    }));
  }, [result]);

  const latestStreamEvent = useMemo(
    () => (streamEvents.length ? streamEvents[streamEvents.length - 1] : null),
    [streamEvents],
  );
  const summarySegments = useMemo(() => parseMarkdownTableSegments(result?.summary || ""), [result?.summary]);
  const showSqlExecutionCard = useMemo(
    () => Boolean(result?.analysis?.include_sql_execution),
    [result?.analysis?.include_sql_execution],
  );

  const enabledStageLabels = useMemo(() => STAGE_OPTIONS
    .filter((option) => Boolean(debugStages[option.key]))
    .map((option) => option.label), [debugStages]);

  const resolution = useMemo(() => result?.analysis?.entity_resolution || {}, [result?.analysis?.entity_resolution]);
  const resolutionWeights = useMemo(() => resolution?.weights || {}, [resolution?.weights]);
  const resolutionSignals = useMemo(() => resolution?.inputSignals || {}, [resolution?.inputSignals]);
  const resolutionCandidates = useMemo(() => Array.isArray(resolution?.candidates) ? resolution.candidates : [], [resolution?.candidates]);
  const resolutionWinner = useMemo(() => resolution?.winner || {}, [resolution?.winner]);

  const selectedCandidate = useMemo(() => {
    const selected = String(result?.selectedEntity || "").toLowerCase();
    if (resolutionCandidates.length) {
      if (!selected) {
        return resolutionCandidates[0] || null;
      }
      return resolutionCandidates.find((row) => String(row?.entity || "").toLowerCase() === selected) || resolutionCandidates[0] || null;
    }
    if (!selected) {
      return candidateRows[0] || null;
    }
    return candidateRows.find((row) => String(row.name || "").toLowerCase() === selected) || candidateRows[0] || null;
  }, [candidateRows, resolutionCandidates, result?.selectedEntity]);

  const resolutionTiles = useMemo(() => {
    const analysis = result?.analysis || {};
    return [
      { label: "Selected Entity", value: result?.selectedEntity || "(none)", tone: "primary" },
      { label: "Reason", value: result?.selectedEntityReason || "(none)", tone: "accent" },
      { label: "Retrieval Confidence", value: resolution?.retrievalConfidence || result?.retrieval?.confidence || analysis?.retrieval_confidence || "(none)", tone: "neutral" },
      { label: "Candidate Count", value: String(resolutionCandidates.length || candidateRows.length || analysis?.candidate_entity_count || 0), tone: "neutral" },
      { label: "Winner Score", value: resolutionWinner?.winnerScore ?? selectedCandidate?.score ?? "(none)", tone: "score" },
      { label: "Second Score", value: resolutionWinner?.secondScore ?? "(none)", tone: "score" },
      { label: "Margin", value: resolutionWinner?.marginVsSecond ?? "(none)", tone: "score" },
    ];
  }, [candidateRows.length, resolution, resolutionCandidates.length, resolutionWinner, result, selectedCandidate]);

  const resolutionReasonChips = useMemo(() => {
    const rawReasons = Array.isArray(selectedCandidate?.reasons)
      ? selectedCandidate.reasons
      : String(selectedCandidate?.reasons || "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
    const reasons = rawReasons.map((r) => String(r || "").trim()).filter(Boolean);
    return reasons;
  }, [selectedCandidate]);

  const focusResolutionCandidate = useMemo(() => {
    if (resolutionCandidates.length === 0) {
      return null;
    }
    const selected = String(result?.selectedEntity || "").toLowerCase();
    if (!selected) {
      return resolutionCandidates[0] || null;
    }
    return resolutionCandidates.find((row) => String(row?.entity || "").toLowerCase() === selected)
      || resolutionCandidates[0]
      || null;
  }, [resolutionCandidates, result?.selectedEntity]);

  const formulaSignalValues = useMemo(() => {
    const signalMap = focusResolutionCandidate?.signals || {};
    const reasons = new Set(
      (Array.isArray(focusResolutionCandidate?.reasons) ? focusResolutionCandidate.reasons : [])
        .map((r) => String(r || "").toLowerCase()),
    );
    return {
      synonym: signalMap?.synonym ?? null,
      field: signalMap?.field ?? null,
      idPattern: signalMap?.idPattern ?? (reasons.has("idpattern") ? 1 : 0),
      lexical: signalMap?.lexical ?? (reasons.has("lexical") ? 1 : 0),
      fieldOwnership: signalMap?.fieldOwnership ?? null,
      deterministic: asNumber(focusResolutionCandidate?.breakdown?.deterministicScore),
      vectorScore: asNumber(focusResolutionCandidate?.breakdown?.vectorScore),
      feedbackBoost: signalMap?.feedbackBoost ?? asNumber(focusResolutionCandidate?.breakdown?.feedbackBoostEstimated),
    };
  }, [focusResolutionCandidate]);

  const deterministicExecution = useMemo(() => {
    const detBlend = asNumber(resolutionWeights?.deterministicBlendWeight);
    const vecBlend = asNumber(resolutionWeights?.vectorBlendWeight);
    const fbBlend = asNumber(resolutionWeights?.feedbackBlendWeight);
    const det = asNumber(formulaSignalValues?.deterministic);
    const vec = asNumber(formulaSignalValues?.vectorScore);
    const fb = asNumber(formulaSignalValues?.feedbackBoost);
    const detTerm = detBlend * det;
    const vecTerm = vecBlend * vec;
    const fbTerm = fbBlend * fb;
    const finalScore = asNumber(focusResolutionCandidate?.breakdown?.finalScore);
    return {
      detBlend, vecBlend, fbBlend, det, vec, fb, detTerm, vecTerm, fbTerm, finalScore,
    };
  }, [focusResolutionCandidate, formulaSignalValues, resolutionWeights]);

  const deterministicFormulaExecution = useMemo(() => {
    const term = (a, b) => (a == null || b == null ? null : asNumber(a) * asNumber(b));
    const synonymTerm = term(resolutionWeights?.synonymWeight, formulaSignalValues?.synonym);
    const fieldTerm = term(resolutionWeights?.fieldWeight, formulaSignalValues?.field);
    const idPatternTerm = term(resolutionWeights?.idPatternWeight, formulaSignalValues?.idPattern);
    const lexicalTerm = term(resolutionWeights?.lexicalWeight, formulaSignalValues?.lexical);
    const ownershipTerm = term(resolutionWeights?.fieldOwnershipWeight, formulaSignalValues?.fieldOwnership);
    return {
      synonymTerm, fieldTerm, idPatternTerm, lexicalTerm, ownershipTerm,
      deterministic: asNumber(formulaSignalValues?.deterministic),
    };
  }, [formulaSignalValues, resolutionWeights]);

  const deterministicVariableChips = useMemo(() => ([
    { key: "synonymWeight", label: "synonymWeight", value: resolutionWeights?.synonymWeight, color: "c1" },
    { key: "synonym", label: "synonym", value: formulaSignalValues?.synonym, color: "c2" },
    { key: "fieldWeight", label: "fieldWeight", value: resolutionWeights?.fieldWeight, color: "c3" },
    { key: "field", label: "field", value: formulaSignalValues?.field, color: "c4" },
    { key: "idPatternWeight", label: "idPatternWeight", value: resolutionWeights?.idPatternWeight, color: "c5" },
    { key: "idPattern", label: "idPattern", value: formulaSignalValues?.idPattern, color: "c6" },
    { key: "lexicalWeight", label: "lexicalWeight", value: resolutionWeights?.lexicalWeight, color: "c7" },
    { key: "lexical", label: "lexical", value: formulaSignalValues?.lexical, color: "c8" },
    { key: "fieldOwnershipWeight", label: "fieldOwnershipWeight", value: resolutionWeights?.fieldOwnershipWeight, color: "c9" },
    { key: "fieldOwnership", label: "fieldOwnership", value: formulaSignalValues?.fieldOwnership, color: "c10" },
  ]), [formulaSignalValues, resolutionWeights]);

  useEffect(() => {
    if (!resizing) {
      return undefined;
    }
    const onMouseMove = (event) => {
      const splitEl = splitRef.current;
      if (!splitEl) {
        return;
      }
      const rect = splitEl.getBoundingClientRect();
      const next = rect.right - event.clientX;
      const minWidth = 320;
      const maxWidth = Math.max(420, Math.floor(rect.width * 0.7));
      setPanelWidth(Math.max(minWidth, Math.min(maxWidth, next)));
    };
    const onMouseUp = () => setResizing(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing]);

  const toggleStage = (key) => {
    setDebugStages((prev) => normalizeStageSelection({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const onAnalyze = async () => {
    const q = String(question || "").trim();
    if (!q) {
      setError("Question is required.");
      setResult(null);
      setStreamEvents([]);
      return;
    }
    setLoading(true);
    setError("");
    setStreamEvents([]);
    setExpandedEventIndex(null);
    const stagePayload = {
      includeRetrieval: debugStages.retrieval,
      includeJsonPath: debugStages.jsonPath,
      includeAst: debugStages.ast,
      includeSqlGeneration: debugStages.sqlGeneration,
      includeSqlExecution: debugStages.sqlExecution,
    };
    const config = getConvEngineRuntimeConfig();
    const useSse = Boolean(config?.streamEnabled) && String(config?.streamTransport || "").toLowerCase() === "sse";
    if (useSse) {
      await new Promise((resolve) => {
        let finished = false;
        const safeDone = () => {
          if (finished) {
            return;
          }
          finished = true;
          setLoading(false);
          resolve();
        };
        const subscription = analyzeSemanticQueryDebugStream(q, {
          onEvent: (evt) => {
            setStreamEvents((prev) => [...prev, evt || {}]);
          },
          onComplete: (res) => {
            setResult(res || null);
            safeDone();
          },
          onError: (err) => {
            setError(err instanceof Error ? err.message : "Debug analyze failed.");
            subscription?.close?.();
            safeDone();
          },
          onClosed: () => {
            safeDone();
          },
        }, stagePayload);
      });
      return;
    }

    try {
      const res = await analyzeSemanticQueryDebug({ question: q, ...stagePayload });
      setResult(res || null);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Debug analyze failed.");
      setResult(null);
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <section className="db-schema-page sqd-page">
      <div className="sqd-shell">
        <div className="sqd-head">
          <div className="sqd-title-wrap">
            <h2>Semantic Query Debug</h2>
            <p>Analyze entity selection and AST generation for one user query.</p>
          </div>
        </div>

        <div className="sqd-query-split" ref={splitRef}>
          <div className="sqd-card sqd-query-card sqd-query-main">
            <div className="sqd-stage-row">
              {STAGE_OPTIONS.map((option) => {
                const disabled = (option.key === "jsonPath" && jsonPathDisabled)
                  || (option.key === "ast" && astDisabled)
                  || (option.key === "sqlGeneration" && sqlGenerationDisabled)
                  || (option.key === "sqlExecution" && sqlExecutionDisabled);
                return (
                  <label key={option.key} className={`sqd-stage-pill${disabled ? " disabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(debugStages[option.key])}
                      disabled={disabled || loading}
                      onChange={() => toggleStage(option.key)}
                    />
                    <span className="sqd-stage-icon">{option.icon}</span>
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>

            <label className="sqd-label" htmlFor="semantic-debug-question">
              Query
            </label>
            <textarea
              id="semantic-debug-question"
              className="sqd-question-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={6}
              placeholder='Example: why did DON9001 fail'
            />
            <div className="sqd-query-footer">
              <div className="sqd-query-error-wrap">
                {error ? <div className="db-schema-msg error sqd-inline-error">{error}</div> : null}
              </div>
              <button type="button" className="cache-analyze-load sqd-analyze-btn" onClick={onAnalyze} disabled={loading || !String(question || "").trim()}>
                {loading ? (
                  <span className="sqd-loader-circle" aria-hidden="true" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 12h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M13 6l7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {loading ? "Analyzing..." : "Analyze"}
              </button>
            </div>
          </div>

          <div
            className={`sqd-sse-resizer${resizing ? " active" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
              setResizing(true);
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize debug timeline panel"
          />
          <aside className="sqd-card sqd-sse-panel" style={{ width: `${panelWidth}px` }}>
            <div className="sqd-sse-head">
              <h3>Debug Timeline</h3>
            </div>
            <div className="sqd-sse-meta">
              <span className={`sqd-sse-stage ${stageClass(latestStreamEvent?.stage)}`}>{latestStreamEvent?.stage || "IDLE"}</span>
              <span>{`Elapsed ${latestStreamEvent?.elapsedMs ?? 0} ms`}</span>
              <span>{`Delta ${latestStreamEvent?.deltaMs ?? 0} ms`}</span>
            </div>
            <div className="sqd-sse-enabled">Enabled: {enabledStageLabels.join(" • ") || "None"}</div>
            <div className="sqd-sse-list">
              {!streamEvents.length ? (
                <div className="sqd-sse-empty">No SSE events yet.</div>
              ) : (
                streamEvents.map((evt, idx) => {
                  const expanded = expandedEventIndex === idx;
                  return (
                    <div key={`${idx}-${evt?.stage || "event"}`} className={`sqd-sse-item${expanded ? " open" : ""}`}>
                      <button
                        type="button"
                        className="sqd-sse-item-head"
                        onClick={() => setExpandedEventIndex(expanded ? null : idx)}
                      >
                        <span className={`sqd-sse-dot ${stageClass(evt?.stage)}`} />
                        <span className="sqd-sse-item-stage">{evt?.stage || "EVENT"}</span>
                        <span className="sqd-sse-item-time">{evt?.elapsedMs ?? 0} ms</span>
                      </button>
                      {expanded ? (
                        <div className="sqd-sse-item-body">
                          <JsonBlock value={evt} />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>

        {result ? (
          <>
            <div className="sqd-grid">
              <div className="sqd-card">
                <h3>Selection</h3>
                <div className="sqd-kv"><strong>Conversation ID:</strong> {result.conversationId || "(none)"}</div>
                <div className="sqd-kv"><strong>Selected Entity:</strong> {result.selectedEntity || "(none)"}</div>
                <div className="sqd-kv"><strong>Reason:</strong> {result.selectedEntityReason || "(none)"}</div>
                {result?.selectedEntityReason === "TOP_RETRIEVAL_CANDIDATE" ? (
                  <div className="sqd-kv">
                    <strong>Reason Detail:</strong> Top entity by retrieval score (deterministic + vector + feedback blend).
                  </div>
                ) : null}
                <div className="sqd-kv"><strong>AST Version:</strong> {result.astVersion || "(none)"}</div>
              </div>

              <div className="sqd-card">
                <h3>SQL</h3>
                <SqlBlock sql={result.compiledSql || "--"} />
                <div className="sqd-sql-params">
                  <div className="sqd-kv"><strong>Query Params:</strong></div>
                  <JsonBlock value={result.compiledSqlParams || {}} />
                </div>
              </div>
            </div>

            {showSqlExecutionCard ? (
              <div className="sqd-card">
                <h3>SQL Execution</h3>
                {summarySegments.map((segment, idx) => {
                  if (segment.type === "table") {
                    return (
                      <div key={`sum-tbl-${idx}`} className="sqd-summary-table-card">
                        <DbTable columns={segment.headers.map(prettifyMarkdownHeader)} rows={segment.rows} />
                      </div>
                    );
                  }
                  return (
                    <pre key={`sum-txt-${idx}`} className="sqd-pre sqd-summary-text-pre">
                      {segment.text}
                    </pre>
                  );
                })}
              </div>
            ) : null}

            <div className="sqd-card">
              <h3>Entity Candidates</h3>
              <div className="sqd-resolution-visual">
                <div className="sqd-resolution-formulas">
                  <div className="sqd-resolution-formula-card">
                    <div className="sqd-resolution-formula-title">Deterministic Formula</div>
                    <div className="sqd-resolution-formula-chip-row">
                      <span className="sqd-op-chip">deterministic</span>
                      <span className="sqd-op-chip">=</span>
                      {deterministicVariableChips.map((chip, idx) => (
                        <Fragment key={chip.key}>
                          {idx > 0 && idx % 2 === 0 ? <span className="sqd-op-chip">+</span> : null}
                          {idx % 2 === 1 ? <span className="sqd-op-chip">×</span> : null}
                          <span
                            className={`sqd-resolution-formula-chip sqd-tip-chip ${chip.color}`}
                            data-tip={`${chip.label}: ${chip.value == null ? "n/a (signal not exposed by retriever)" : fmt(chip.value)}`}
                          >
                            {chip.label}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                    <div className="sqd-resolution-formula-literal">
                      <div className="sqd-math-formula" role="math" aria-label="synonymWeight times synonym plus fieldWeight times field plus idPatternWeight times idPattern plus lexicalWeight times lexical plus fieldOwnershipWeight times fieldOwnership">
                        <span className="mf-lhs">deterministic</span>
                        <span className="mf-op">=</span>
                        <span className="mf-var">synonymWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-var">synonym</span>
                        <span className="mf-op">+</span>
                        <span className="mf-var">fieldWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-var">field</span>
                        <span className="mf-op">+</span>
                        <span className="mf-var">idPatternWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-var">idPattern</span>
                        <span className="mf-op">+</span>
                        <span className="mf-var">lexicalWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-var">lexical</span>
                        <span className="mf-op">+</span>
                        <span className="mf-var">fieldOwnershipWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-var">fieldOwnership</span>
                      </div>
                    </div>
                  </div>
                  <div className="sqd-resolution-formula-card">
                    <div className="sqd-resolution-formula-title">Final Score Formula</div>
                    <div className="sqd-resolution-formula-chip-row">
                      <span className="sqd-op-chip">final</span>
                      <span className="sqd-op-chip">=</span>
                      <span className={`sqd-resolution-formula-chip sqd-tip-chip c3`} data-tip={`deterministicBlendWeight: ${fmtMaybe(deterministicExecution?.detBlend)}`}>deterministicBlendWeight</span>
                      <span className="sqd-op-chip">×</span>
                      <span className="sqd-op-chip sqd-tip-chip" data-tip={"clamp01(x) bounds values to [0,1]. Example: clamp01(1.2)=1, clamp01(-0.3)=0"}>clamp01(</span>
                      <span className={`sqd-resolution-formula-chip sqd-tip-chip c4`} data-tip={`deterministic: ${fmtMaybe(deterministicExecution?.det)}`}>deterministic</span>
                      <span className="sqd-op-chip">)</span>
                      <span className="sqd-op-chip">+</span>
                      <span className={`sqd-resolution-formula-chip sqd-tip-chip c5`} data-tip={`vectorBlendWeight: ${fmtMaybe(deterministicExecution?.vecBlend)}`}>vectorBlendWeight</span>
                      <span className="sqd-op-chip">×</span>
                      <span className="sqd-op-chip sqd-tip-chip" data-tip={"clamp01(x) bounds values to [0,1]. Example: clamp01(0.27)=0.27"}>clamp01(</span>
                      <span className={`sqd-resolution-formula-chip sqd-tip-chip c6`} data-tip={`vectorScore: ${fmtMaybe(deterministicExecution?.vec)}`}>vectorScore</span>
                      <span className="sqd-op-chip">)</span>
                      <span className="sqd-op-chip">+</span>
                      <span className={`sqd-resolution-formula-chip sqd-tip-chip c7`} data-tip={`feedbackBlendWeight: ${fmtMaybe(deterministicExecution?.fbBlend)}`}>feedbackBlendWeight</span>
                      <span className="sqd-op-chip">×</span>
                      <span className="sqd-op-chip sqd-tip-chip" data-tip={"clamp01(x) bounds values to [0,1]. Example: clamp01(0)=0"}>clamp01(</span>
                      <span className={`sqd-resolution-formula-chip sqd-tip-chip c8`} data-tip={`feedbackBoost: ${fmtMaybe(deterministicExecution?.fb)}`}>feedbackBoost</span>
                      <span className="sqd-op-chip">)</span>
                    </div>
                    <div className="sqd-resolution-formula-literal">
                      <div className="sqd-math-formula" role="math" aria-label="deterministicBlendWeight times clamp01 deterministic plus vectorBlendWeight times clamp01 vectorScore plus feedbackBlendWeight times clamp01 feedbackBoost">
                        <span className="mf-lhs">final</span>
                        <span className="mf-op">=</span>
                        <span className="mf-var">deterministicBlendWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-fn">clamp01</span>
                        <span className="mf-op">(</span>
                        <span className="mf-var">deterministic</span>
                        <span className="mf-op">)</span>
                        <span className="mf-op">+</span>
                        <span className="mf-var">vectorBlendWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-fn">clamp01</span>
                        <span className="mf-op">(</span>
                        <span className="mf-var">vectorScore</span>
                        <span className="mf-op">)</span>
                        <span className="mf-op">+</span>
                        <span className="mf-var">feedbackBlendWeight</span>
                        <span className="mf-op">×</span>
                        <span className="mf-fn">clamp01</span>
                        <span className="mf-op">(</span>
                        <span className="mf-var">feedbackBoost</span>
                        <span className="mf-op">)</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="sqd-resolution-execution-grid">
                  <div className="sqd-resolution-execution-card deterministic-exec">
                    <div className="sqd-resolution-subhead">Deterministic Formula Execution</div>
                    <div className="sqd-exec-line">
                      <span className="var v-c1">synonymWeight</span> <span className="op">×</span> <span className="var v-c2">synonym</span> <span className="op">=</span> <span className="num">{fmtMaybe(resolutionWeights?.synonymWeight)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(formulaSignalValues?.synonym)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicFormulaExecution.synonymTerm)}</span>
                    </div>
                    <div className="sqd-exec-line">
                      <span className="var v-c3">fieldWeight</span> <span className="op">×</span> <span className="var v-c4">field</span> <span className="op">=</span> <span className="num">{fmtMaybe(resolutionWeights?.fieldWeight)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(formulaSignalValues?.field)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicFormulaExecution.fieldTerm)}</span>
                    </div>
                    <div className="sqd-exec-line">
                      <span className="var v-c5">idPatternWeight</span> <span className="op">×</span> <span className="var v-c6">idPattern</span> <span className="op">=</span> <span className="num">{fmtMaybe(resolutionWeights?.idPatternWeight)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(formulaSignalValues?.idPattern)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicFormulaExecution.idPatternTerm)}</span>
                    </div>
                    <div className="sqd-exec-line">
                      <span className="var v-c7">lexicalWeight</span> <span className="op">×</span> <span className="var v-c8">lexical</span> <span className="op">=</span> <span className="num">{fmtMaybe(resolutionWeights?.lexicalWeight)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(formulaSignalValues?.lexical)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicFormulaExecution.lexicalTerm)}</span>
                    </div>
                    <div className="sqd-exec-line">
                      <span className="var v-c9">fieldOwnershipWeight</span> <span className="op">×</span> <span className="var v-c10">fieldOwnership</span> <span className="op">=</span> <span className="num">{fmtMaybe(resolutionWeights?.fieldOwnershipWeight)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(formulaSignalValues?.fieldOwnership)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicFormulaExecution.ownershipTerm)}</span>
                    </div>
                    <div className="sqd-exec-line final">
                      <span className="var v-c3">deterministic (resolved)</span> = <span className="num">{fmtMaybe(deterministicFormulaExecution.deterministic)}</span>
                    </div>
                  </div>
                  <div className="sqd-resolution-execution-card final-exec">
                    <div className="sqd-resolution-subhead">Final Score Formula Execution</div>
                    <div className="sqd-exec-line">
                      <span className="var v-c3">deterministicBlendWeight</span> <span className="op">×</span> <span className="fn">clamp01</span><span className="op">(</span><span className="var v-c4">deterministic</span><span className="op">)</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicExecution.detBlend)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(deterministicExecution.det)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicExecution.detTerm)}</span>
                    </div>
                    <div className="sqd-exec-line">
                      <span className="var v-c5">vectorBlendWeight</span> <span className="op">×</span> <span className="fn">clamp01</span><span className="op">(</span><span className="var v-c6">vectorScore</span><span className="op">)</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicExecution.vecBlend)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(deterministicExecution.vec)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicExecution.vecTerm)}</span>
                    </div>
                    <div className="sqd-exec-line">
                      <span className="var v-c7">feedbackBlendWeight</span> <span className="op">×</span> <span className="fn">clamp01</span><span className="op">(</span><span className="var v-c8">feedbackBoost</span><span className="op">)</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicExecution.fbBlend)}</span> <span className="op">×</span> <span className="num">{fmtMaybe(deterministicExecution.fb)}</span> <span className="op">=</span> <span className="num">{fmtMaybe(deterministicExecution.fbTerm)}</span>
                    </div>
                    <div className="sqd-exec-line final">
                      <span className="var v-c5">final</span> = <span className="num">{fmtMaybe(deterministicExecution.detTerm)}</span> + <span className="num">{fmtMaybe(deterministicExecution.vecTerm)}</span> + <span className="num">{fmtMaybe(deterministicExecution.fbTerm)}</span> = <span className="num">{fmtMaybe(deterministicExecution.finalScore)}</span>
                    </div>
                  </div>
                </div>
                <div className="sqd-resolution-tiles">
                  {resolutionTiles.map((tile) => (
                    <div key={tile.label} className={`sqd-resolution-tile ${tile.tone || "neutral"}`}>
                      <div className="sqd-resolution-tile-label">{tile.label}</div>
                      <div className="sqd-resolution-tile-value">{tile.value}</div>
                    </div>
                  ))}
                </div>
                <div className="sqd-resolution-weights">
                  <div className="sqd-resolution-subhead">Weights</div>
                  <div className="sqd-resolution-chip-row">
                    {Object.entries(resolutionWeights).map(([k, v]) => (
                      <span key={k} className="sqd-resolution-chip" title={`${k} = ${v}`}>
                        {k}: {fmt(v)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sqd-resolution-signals">
                  <div className="sqd-resolution-subhead">Input Signals</div>
                  <div className="sqd-resolution-chip-row">
                    {(Array.isArray(resolutionSignals?.queryTokens) ? resolutionSignals.queryTokens : []).map((token) => (
                      <span key={`token-${token}`} className="sqd-resolution-chip token">{token}</span>
                    ))}
                    <span className={`sqd-resolution-chip ${resolutionSignals?.hasRequestIdToken ? "ok" : "no"}`}>hasRequestIdToken: {String(Boolean(resolutionSignals?.hasRequestIdToken))}</span>
                    <span className={`sqd-resolution-chip ${resolutionSignals?.hasDonToken ? "ok" : "no"}`}>hasDonToken: {String(Boolean(resolutionSignals?.hasDonToken))}</span>
                    <span className={`sqd-resolution-chip ${resolutionSignals?.hasDisconnectIdToken ? "ok" : "no"}`}>hasDisconnectIdToken: {String(Boolean(resolutionSignals?.hasDisconnectIdToken))}</span>
                  </div>
                </div>
                <div className="sqd-resolution-chip-row">
                  {resolutionReasonChips.length ? resolutionReasonChips.map((reason) => (
                    <span key={reason} className="sqd-resolution-chip">{reason}</span>
                  )) : <span className="sqd-resolution-chip muted">No scoring reasons</span>}
                </div>
                {resolutionCandidates.length ? (
                  <div className="sqd-resolution-candidates">
                    {resolutionCandidates.map((candidate, idx) => {
                      const breakdown = candidate?.breakdown || {};
                      const detBlend = asNumber(resolutionWeights?.deterministicBlendWeight);
                      const vecBlend = asNumber(resolutionWeights?.vectorBlendWeight);
                      const fbBlend = asNumber(resolutionWeights?.feedbackBlendWeight);
                      const det = asNumber(breakdown?.deterministicScore);
                      const vec = asNumber(breakdown?.vectorScore);
                      const fb = asNumber(breakdown?.feedbackBoostEstimated);
                      const detTerm = detBlend * det;
                      const vecTerm = vecBlend * vec;
                      const fbTerm = fbBlend * fb;
                      const finalScore = asNumber(breakdown?.finalScore);
                      return (
                        <div key={`${candidate?.entity || "candidate"}-${idx}`} className="sqd-resolution-candidate-card">
                          <div className="sqd-resolution-candidate-head">
                            <span className="sqd-resolution-candidate-rank">#{candidate?.rank || idx + 1}</span>
                            <span className="sqd-resolution-candidate-name">{candidate?.entity || "(entity)"}</span>
                            <span className="sqd-resolution-candidate-score">final: {fmt(finalScore)}</span>
                          </div>
                          <div className="sqd-resolution-calc" title={String(candidate?.formulaEval || "")}>
                            <span className="chip">({fmt(detBlend)} × {fmt(det)}) = {fmt(detTerm)}</span>
                            <span className="chip">+</span>
                            <span className="chip">({fmt(vecBlend)} × {fmt(vec)}) = {fmt(vecTerm)}</span>
                            <span className="chip">+</span>
                            <span className="chip">({fmt(fbBlend)} × {fmt(fb)}) = {fmt(fbTerm)}</span>
                            <span className="chip result">= {fmt(finalScore)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div className="sqd-resolution-winner">
                  <div className="sqd-resolution-subhead">Winner Selection</div>
                  <div className="sqd-resolution-winner-row">
                    <span className="sqd-resolution-chip primary">Winner: {resolutionWinner?.entity || "(none)"}</span>
                    <span className="sqd-resolution-chip">winnerScore: {fmt(resolutionWinner?.winnerScore)}</span>
                    <span className="sqd-resolution-chip">secondScore: {fmt(resolutionWinner?.secondScore)}</span>
                    <span className="sqd-resolution-chip score">margin: {fmt(resolutionWinner?.marginVsSecond)}</span>
                  </div>
                  <div className="sqd-resolution-winner-reason">{resolutionWinner?.reason || "No winner reason available."}</div>
                </div>
              </div>
              <div className="sqd-table-wrap sqd-resolution-table-wrap">
                <table className="sqd-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Entity</th>
                      <th>Score</th>
                      <th>Deterministic</th>
                      <th>Vector</th>
                      <th>Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateRows.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No candidate entities.</td>
                      </tr>
                    ) : (
                      candidateRows.map((row) => (
                        <tr key={`${row.rank}-${row.name}`}>
                          <td>{row.rank}</td>
                          <td>{row.name}</td>
                          <td>{row.score}</td>
                          <td>{row.deterministicScore}</td>
                          <td>{row.vectorScore}</td>
                          <td>{row.reasons}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="sqd-grid">
              <div className="sqd-card">
                <h3>AST</h3>
                <JsonBlock value={result.ast} />
              </div>
              <div className="sqd-card">
                <h3>Retrieval</h3>
                <JsonBlock value={result.retrieval} />
              </div>
            </div>

            <div className="sqd-grid">
              <div className="sqd-card">
                <h3>LLM Input (AST_INPUT)</h3>
                <JsonBlock value={result.llmInput} />
              </div>
              <div className="sqd-card">
                <h3>LLM Output (AST_OUTPUT)</h3>
                <JsonBlock value={result.llmOutput} />
              </div>
            </div>
            {result?.llmError && Object.keys(result.llmError).length ? (
              <div className="sqd-card">
                <h3>LLM Error (AST_ERROR)</h3>
                <JsonBlock value={result.llmError} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
