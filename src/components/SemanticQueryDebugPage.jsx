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

function isStreamConnectionError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("stream") || text.includes("sse") || text.includes("connection");
}

function asDisplayText(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sanitizeDisplayText(value) {
  return asDisplayText(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
}

function parseAstRawPreview(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { rawJsonPreview: text };
  }
}

function parsePromptJsonSection(userPrompt, label) {
  const text = String(userPrompt || "");
  if (!text || !label) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().startsWith(label));
  if (start < 0) {
    return null;
  }
  let payload = lines[start].slice(lines[start].indexOf(label) + label.length).trim();
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch {
    const collected = [payload];
    for (let i = start + 1; i < lines.length; i += 1) {
      const candidate = lines[i].trim();
      if (!candidate) {
        break;
      }
      if (candidate.includes(": ") && !candidate.startsWith("{") && !candidate.startsWith("[") && !candidate.startsWith("\"")) {
        break;
      }
      collected.push(candidate);
      try {
        return JSON.parse(collected.join("\n"));
      } catch {
        // continue
      }
    }
  }
  return null;
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
  const [kickRobot, setKickRobot] = useState(false);
  const [roamRobot, setRoamRobot] = useState(false);
  const [roamWalk, setRoamWalk] = useState(false);
  const [kickErrorMessage, setKickErrorMessage] = useState("");
  const [returnRobot, setReturnRobot] = useState(false);
  const [streamErrorActive, setStreamErrorActive] = useState(false);
  const [streamErrorRevealSeq, setStreamErrorRevealSeq] = useState(0);
  const [kickStartPos, setKickStartPos] = useState({ x: 0, y: 0 });
  const [returnStartPos, setReturnStartPos] = useState({ x: 0, y: 0 });
  const [roamStartPos, setRoamStartPos] = useState({ x: 0, y: 0 });
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
  const queryMainCardRef = useRef(null);
  const queryFooterRef = useRef(null);
  const analyzeBtnRef = useRef(null);
  const analyzeBotAnchorRef = useRef(null);
  const kickTargetRef = useRef(null);
  const kickRobotRef = useRef(null);
  const returnRobotRef = useRef(null);
  const roamRobotRef = useRef(null);
  const returnTimerRef = useRef(null);
  const flightRafRef = useRef(null);
  const roamRafRef = useRef(null);
  const loadingRef = useRef(false);

  const jsonPathDisabled = !debugStages.retrieval;
  const astDisabled = jsonPathDisabled || !debugStages.jsonPath;
  const sqlGenerationDisabled = astDisabled || !debugStages.ast;
  const sqlExecutionDisabled = sqlGenerationDisabled || !debugStages.sqlGeneration;

  useEffect(() => () => {
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    if (flightRafRef.current) {
      cancelAnimationFrame(flightRafRef.current);
      flightRafRef.current = null;
    }
    if (roamRafRef.current) {
      cancelAnimationFrame(roamRafRef.current);
      roamRafRef.current = null;
    }
  }, []);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const getAnchorPos = (anchorRef) => {
    const footerRect = queryFooterRef.current?.getBoundingClientRect?.();
    const anchorRect = anchorRef?.current?.getBoundingClientRect?.();
    if (!footerRect || !anchorRect) {
      return { x: 0, y: 0 };
    }
    return {
      x: (anchorRect.left - footerRect.left) + (anchorRect.width / 2) - 10,
      y: (anchorRect.top - footerRect.top) + (anchorRect.height / 2) - 10,
    };
  };

  const getNodePos = (node) => {
    const footerRect = queryFooterRef.current?.getBoundingClientRect?.();
    const nodeRect = node?.getBoundingClientRect?.();
    if (!footerRect || !nodeRect) {
      return { x: 0, y: 0 };
    }
    return {
      x: (nodeRect.left - footerRect.left) + (nodeRect.width / 2) - 10,
      y: (nodeRect.top - footerRect.top) + (nodeRect.height / 2) - 10,
    };
  };

  const finishKickAnimation = () => {
    setKickRobot(false);
    setKickErrorMessage((pending) => {
      if (pending) {
        setStreamErrorActive(true);
        setStreamErrorRevealSeq((prev) => prev + 1);
      }
      return pending;
    });
  };

  const stopRoamAnimation = () => {
    if (roamRafRef.current) {
      cancelAnimationFrame(roamRafRef.current);
      roamRafRef.current = null;
    }
    const node = roamRobotRef.current;
    if (node) {
      node.style.transform = "translate3d(0, 0, 0) rotate(0deg) scale(1)";
      node.style.opacity = "1";
    }
    setRoamWalk(false);
    setRoamRobot(false);
  };

  const startRoamAnimation = () => {
    if (roamRafRef.current) {
      cancelAnimationFrame(roamRafRef.current);
      roamRafRef.current = null;
    }
    const startPos = getAnchorPos(analyzeBotAnchorRef);
    setRoamStartPos(startPos);
    setRoamRobot(true);
    setRoamWalk(false);
    requestAnimationFrame(() => {
      const node = roamRobotRef.current;
      const footerRect = queryFooterRef.current?.getBoundingClientRect?.();
      const cardRect = queryMainCardRef.current?.getBoundingClientRect?.();
      if (!node || !footerRect) {
        setRoamRobot(false);
        return;
      }
      const cornerInset = 22;
      const robotInset = 12;
      const topLeft = cardRect
        ? {
            x: (cardRect.left - footerRect.left) + cornerInset,
            y: (cardRect.top - footerRect.top) + cornerInset,
          }
        : { x: 20, y: -126 };
      const topRight = cardRect
        ? {
            x: (cardRect.right - footerRect.left) - cornerInset - robotInset,
            y: (cardRect.top - footerRect.top) + cornerInset,
          }
        : { x: Math.max(56, footerRect.width - 78), y: -126 };
      const bottomRight = cardRect
        ? {
            x: (cardRect.right - footerRect.left) - cornerInset - robotInset,
            y: (cardRect.bottom - footerRect.top) - cornerInset - robotInset,
          }
        : { x: Math.max(56, footerRect.width - 78), y: -10 };
      const bottomLeft = cardRect
        ? {
            x: (cardRect.left - footerRect.left) + cornerInset,
            y: (cardRect.bottom - footerRect.top) - cornerInset - robotInset,
          }
        : { x: 20, y: -10 };
      const jumpToLeftMs = 1150;
      const jumpCornerMs = 1050;
      const cornerRunMs = 1000;
      const ease = (x) => 1 - ((1 - x) ** 3);
      const bounceEase = (x) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (x < 1 / d1) return n1 * x * x;
        if (x < 2 / d1) {
          const t = x - (1.5 / d1);
          return (n1 * t * t) + 0.75;
        }
        if (x < 2.5 / d1) {
          const t = x - (2.25 / d1);
          return (n1 * t * t) + 0.9375;
        }
        const t = x - (2.625 / d1);
        return (n1 * t * t) + 0.984375;
      };
      const projectile = (from, to, p, peak = 70) => {
        const x = from.x + ((to.x - from.x) * p);
        const yLinear = from.y + ((to.y - from.y) * p);
        const yArc = -Math.sin(Math.PI * p) * peak;
        return { x, y: yLinear + yArc };
      };
      const startLocal = { x: 0, y: 0 };
      const topLeftLocal = { x: topLeft.x - startPos.x, y: topLeft.y - startPos.y };
      const topRightLocal = { x: topRight.x - startPos.x, y: topRight.y - startPos.y };
      const bottomRightLocal = { x: bottomRight.x - startPos.x, y: bottomRight.y - startPos.y };
      const bottomLeftLocal = { x: bottomLeft.x - startPos.x, y: bottomLeft.y - startPos.y };
      const walkBob = (phase) => Math.sin(phase * Math.PI * 4) * 2.1;
      const walkShift = (phase) => Math.sin(phase * Math.PI * 2) * 2.6;
      const walkRot = (phase) => Math.sin(phase * Math.PI * 6) * 6;
      const setPose = (x, y, rot = 0, scale = 1) => {
        node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
        node.style.opacity = "1";
      };

      const runJump = (fromPos, toPos, durationMs, peak, onDone) => {
        const startTs = performance.now();
        const tick = (ts) => {
          if (!loadingRef.current) {
            roamRafRef.current = null;
            return;
          }
          const p = Math.max(0, Math.min(1, (ts - startTs) / durationMs));
          const pe = ease(p);
          const pos = projectile(fromPos, toPos, pe, peak);
          const rot = ((toPos.x >= fromPos.x ? 1 : -1) * 11) * Math.sin(Math.PI * pe);
          const scale = 1 + (0.04 * Math.sin(Math.PI * pe));
          if (toPos === bottomLeftLocal && pe > 0.9) {
            const b = bounceEase((pe - 0.9) / 0.1);
            pos.y += (1 - b) * 7;
          }
          setRoamWalk(false);
          setPose(pos.x, pos.y, rot, scale);
          if (p < 1) {
            roamRafRef.current = requestAnimationFrame(tick);
            return;
          }
          onDone?.();
        };
        roamRafRef.current = requestAnimationFrame(tick);
      };

      const runAtPoint = (point, durationMs, onDone) => {
        if (!loadingRef.current) {
          return;
        }
        setRoamWalk(true);
        const pointStart = performance.now();
        const tick = (ts) => {
          if (!loadingRef.current) {
            roamRafRef.current = null;
            return;
          }
          const p = Math.max(0, Math.min(1, (ts - pointStart) / durationMs));
          setPose(point.x + walkShift(p), point.y + walkBob(p), walkRot(p), 1);
          if (p < 1) {
            roamRafRef.current = requestAnimationFrame(tick);
            return;
          }
          setRoamWalk(false);
          onDone?.();
        };
        roamRafRef.current = requestAnimationFrame(tick);
      };

      const corners = [
        topLeftLocal,
        topRightLocal,
        bottomRightLocal,
        bottomLeftLocal,
      ];

      const loopCorners = (currentPos, idx) => {
        if (!loadingRef.current) {
          return;
        }
        const next = corners[idx % corners.length];
        runAtPoint(next, cornerRunMs, () => {
          const nextIdx = (idx + 1) % corners.length;
          const after = corners[nextIdx];
          runJump(next, after, jumpCornerMs, 82, () => {
            loopCorners(after, nextIdx);
          });
        });
      };

      runJump(startLocal, topLeftLocal, jumpToLeftMs, 72, () => {
        loopCorners(topLeftLocal, 0);
      });
    });
  };

  const runRobotFlight = (kind, onDone) => {
    if (flightRafRef.current) {
      cancelAnimationFrame(flightRafRef.current);
      flightRafRef.current = null;
    }
    const node = kind === "kick" ? kickRobotRef.current : returnRobotRef.current;
    if (!node) {
      onDone?.();
      return;
    }
    const duration = kind === "kick" ? 1450 : 1050;
    let distanceX = kind === "kick" ? -560 : 560;
    let distanceY = 0;
    const footerRect = queryFooterRef.current?.getBoundingClientRect?.();
    if (kind === "kick") {
      const targetRect = kickTargetRef.current?.getBoundingClientRect?.();
      const startRect = node.getBoundingClientRect();
      if (footerRect && targetRect && startRect) {
        distanceX = (targetRect.left + (targetRect.width / 2)) - (startRect.left + (startRect.width / 2));
        distanceY = (targetRect.top + (targetRect.height / 2)) - (startRect.top + (startRect.height / 2));
      }
    } else {
      const btnAnchorRect = analyzeBotAnchorRef.current?.getBoundingClientRect?.();
      const startRect = node.getBoundingClientRect();
      if (footerRect && btnAnchorRect && startRect) {
        const targetX = btnAnchorRect.left + (btnAnchorRect.width / 2);
        const targetY = btnAnchorRect.top + (btnAnchorRect.height / 2);
        distanceX = targetX - (startRect.left + (startRect.width / 2));
        distanceY = targetY - (startRect.top + (startRect.height / 2));
      }
    }
    const gravity = kind === "kick" ? 560 : 460;
    const vY0 = -0.5 * gravity;
    const startTs = performance.now();

    const tick = (ts) => {
      const p = Math.max(0, Math.min(1, (ts - startTs) / duration));
      // Slingshot-like projectile path: x = vx*t, y = vy*t + (g*t^2)/2
      const x = distanceX * p;
      const yArc = (vY0 * p) + (0.5 * gravity * p * p);
      const y = yArc + (distanceY * p);
      const vyNow = vY0 + (gravity * p) + distanceY;
      const flightAngleDeg = Math.atan2(vyNow, distanceX || 1) * (180 / Math.PI);
      const rot = kind === "kick"
        ? Math.max(-18, Math.min(14, flightAngleDeg * 0.55))
        : Math.max(-12, Math.min(16, flightAngleDeg * 0.5));
      const scale = kind === "kick"
        ? (1 + (0.05 * Math.sin(p * Math.PI)))
        : (1 + (0.04 * Math.sin(p * Math.PI)));
      const opacity = kind === "return" && p > 0.83 ? (1 - ((p - 0.83) / 0.17)) : 1;
      node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
      node.style.opacity = `${Math.max(0, Math.min(1, opacity))}`;
      if (p < 1) {
        flightRafRef.current = requestAnimationFrame(tick);
        return;
      }
      flightRafRef.current = null;
      onDone?.();
    };

    node.style.transform = "translate3d(0, 0, 0) rotate(0deg) scale(1)";
    node.style.opacity = "1";
    flightRafRef.current = requestAnimationFrame(tick);
  };

  const triggerReturnToButton = (startOverride) => {
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
    }
    setKickRobot(false);
    stopRoamAnimation();
    setStreamErrorActive(false);
    setKickErrorMessage("");
    setError("");
    const fallbackStart = getAnchorPos(kickTargetRef);
    const resolvedStart = (startOverride && Number.isFinite(startOverride.x) && Number.isFinite(startOverride.y)
      && (Math.abs(startOverride.x) > 0 || Math.abs(startOverride.y) > 0))
      ? startOverride
      : fallbackStart;
    setReturnStartPos(resolvedStart);
    setReturnRobot(true);
    returnTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          runRobotFlight("return", () => {
            setReturnRobot(false);
            returnTimerRef.current = null;
          });
        });
      });
    }, 0);
  };

  const setErrorWithKick = (nextError) => {
    const message = nextError instanceof Error ? nextError.message : String(nextError || "Debug analyze failed.");
    if (isStreamConnectionError(message)) {
      const alreadyInStreamErrorState = streamErrorActive || Boolean(kickErrorMessage);
      if (alreadyInStreamErrorState) {
        setKickRobot(false);
        stopRoamAnimation();
        setError("");
        setKickErrorMessage("Debug stream connection error.");
        setStreamErrorActive(true);
        setStreamErrorRevealSeq((prev) => prev + 1);
        return;
      }
      if (returnTimerRef.current) {
        clearTimeout(returnTimerRef.current);
        returnTimerRef.current = null;
      }
      setError("");
      setStreamErrorActive(false);
      setReturnRobot(false);
      setKickErrorMessage("Debug stream connection error.");
      stopRoamAnimation();
      setKickStartPos(getAnchorPos(analyzeBotAnchorRef));
      setKickRobot(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => runRobotFlight("kick", finishKickAnimation));
      });
      return;
    }
    setKickErrorMessage("");
    setStreamErrorActive(false);
    setKickRobot(false);
    stopRoamAnimation();
    setError(message);
  };

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

  const sqlErrorDetails = useMemo(() => {
    for (let i = streamEvents.length - 1; i >= 0; i -= 1) {
      const evt = streamEvents[i] || {};
      const stage = String(evt?.stage || "").toUpperCase();
      if (stage === "SQL_GENERATION_ERROR" || stage === "SQL_EXECUTION_ERROR") {
        const payload = evt?.payload || {};
        return {
          stage,
          message: sanitizeDisplayText(evt?.message || ""),
          rootCauseMessage: sanitizeDisplayText(payload?.rootCauseMessage || payload?.errorMessage || evt?.message || ""),
          rootCauseClass: sanitizeDisplayText(payload?.rootCauseClass || payload?.errorClass || ""),
          stackTrace: sanitizeDisplayText(payload?.stackTrace || ""),
        };
      }
    }
    const fallback = String(result?.analysis?.runtime_error || "").trim();
    if (!fallback) {
      return null;
    }
    return {
      stage: "SQL_GENERATION_ERROR",
      message: sanitizeDisplayText(fallback),
      rootCauseMessage: sanitizeDisplayText(fallback),
      rootCauseClass: "",
      stackTrace: "",
    };
  }, [result?.analysis?.runtime_error, streamEvents]);

  const enabledStageLabels = useMemo(() => STAGE_OPTIONS
    .filter((option) => Boolean(debugStages[option.key]))
    .map((option) => option.label), [debugStages]);

  const resolution = useMemo(() => result?.analysis?.entity_resolution || {}, [result?.analysis?.entity_resolution]);
  const appliedRulesTrace = useMemo(() => result?.analysis?.applied_rules_trace || {}, [result?.analysis?.applied_rules_trace]);
  const selectedEntityContext = useMemo(
    () => result?.analysis?.selected_entity_context || result?.analysis?.entity_resolution?.selectedEntityContext || {},
    [result?.analysis?.selected_entity_context, result?.analysis?.entity_resolution?.selectedEntityContext],
  );
  const selectionPath = useMemo(() => selectedEntityContext?.selectionPath || {}, [selectedEntityContext?.selectionPath]);
  const resolvedPath = useMemo(() => {
    const retrievalWinner = selectionPath?.retrievalWinner
      || result?.analysis?.selected_from_retrieval
      || result?.retrieval?.candidateEntities?.[0]?.name
      || "";
    const astEntity = selectionPath?.astEntity
      || result?.analysis?.selected_from_ast
      || result?.ast?.entity
      || "";
    const finalEntity = selectionPath?.finalEntity || selectedEntityContext?.entity || result?.selectedEntity || "";
    const reasonCode = selectionPath?.reasonCode || result?.selectedEntityReason || "";
    const astRepaired = Boolean(selectionPath?.astRepaired ?? result?.analysis?.ast_repaired);
    return {
      retrievalWinner,
      astEntity,
      finalEntity,
      reasonCode,
      astRepaired,
    };
  }, [result?.analysis?.ast_repaired, result?.analysis?.selected_from_ast, result?.analysis?.selected_from_retrieval, result?.ast?.entity, result?.retrieval?.candidateEntities, result?.selectedEntity, result?.selectedEntityReason, selectedEntityContext?.entity, selectionPath]);
  const selectionEvidence = useMemo(() => {
    const current = selectedEntityContext?.selectionEvidence || {};
    if (Object.keys(current).length) {
      return current;
    }
    const finalEntity = String(resolvedPath?.finalEntity || "").toLowerCase();
    const resolutionCandidates = Array.isArray(result?.analysis?.entity_resolution?.candidates)
      ? result.analysis.entity_resolution.candidates
      : [];
    const found = resolutionCandidates.find((c) => String(c?.entity || "").toLowerCase() === finalEntity);
    if (found) {
      return {
        evidenceSource: "resolution_candidate_fallback",
        score: found?.breakdown?.finalScore ?? "",
        deterministicScore: found?.breakdown?.deterministicScore ?? "",
        vectorScore: found?.breakdown?.vectorScore ?? "",
        reasons: Array.isArray(found?.reasons) ? found.reasons : [],
        signals: found?.signals || {},
      };
    }
    const winner = resolutionCandidates[0];
    if (winner) {
      return {
        evidenceSource: "resolution_winner_fallback",
        winnerEntity: winner?.entity || "",
        score: winner?.breakdown?.finalScore ?? "",
        deterministicScore: winner?.breakdown?.deterministicScore ?? "",
        vectorScore: winner?.breakdown?.vectorScore ?? "",
        reasons: Array.isArray(winner?.reasons) ? winner.reasons : [],
        signals: winner?.signals || {},
      };
    }
    return {};
  }, [result?.analysis?.entity_resolution?.candidates, resolvedPath?.finalEntity, selectedEntityContext?.selectionEvidence]);
  const selectionReasons = useMemo(() => {
    const reasons = selectionEvidence?.reasons;
    return Array.isArray(reasons) ? reasons : [];
  }, [selectionEvidence?.reasons]);
  const astStats = useMemo(() => {
    const ast = result?.ast || {};
    const selects = Array.isArray(ast?.select) ? ast.select.length : 0;
    const filters = Array.isArray(ast?.filters) ? ast.filters.length : 0;
    const exists = Array.isArray(ast?.exists) ? ast.exists.length : 0;
    return { selects, filters, exists };
  }, [result?.ast]);
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

  const entityFieldRows = useMemo(() => {
    const rows = Array.isArray(selectedEntityContext?.fields) ? selectedEntityContext.fields : [];
    return rows.map((row) => ([
      row?.field || "",
      row?.column || "",
      row?.table || "",
      row?.type || "",
      String(Boolean(row?.filterable)),
      String(Boolean(row?.searchable)),
      String(Boolean(row?.key)),
      Array.isArray(row?.allowedValues) ? row.allowedValues.join(", ") : "",
      Array.isArray(row?.aliases) ? row.aliases.join(", ") : "",
    ]));
  }, [selectedEntityContext?.fields]);

  const entityTableCoverageRows = useMemo(() => {
    const coverage = selectedEntityContext?.tableCoverage || {};
    return Object.entries(coverage).map(([table, fields]) => ([table, Array.isArray(fields) ? fields.join(", ") : ""]));
  }, [selectedEntityContext?.tableCoverage]);

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
  const traceMatchedRules = useMemo(
    () => (Array.isArray(appliedRulesTrace?.matched_intent_rules) ? appliedRulesTrace.matched_intent_rules : []),
    [appliedRulesTrace?.matched_intent_rules],
  );
  const traceSelectedRule = useMemo(
    () => appliedRulesTrace?.selected_intent_rule || {},
    [appliedRulesTrace?.selected_intent_rule],
  );
  const tracePromptSections = useMemo(
    () => (Array.isArray(appliedRulesTrace?.prompt_provenance?.prompt_sections) ? appliedRulesTrace.prompt_provenance.prompt_sections : []),
    [appliedRulesTrace?.prompt_provenance?.prompt_sections],
  );
  const traceRemaps = useMemo(
    () => appliedRulesTrace?.value_pattern_remaps || {},
    [appliedRulesTrace?.value_pattern_remaps],
  );
  const traceDeductionChain = useMemo(
    () => (Array.isArray(appliedRulesTrace?.deduction_chain) ? appliedRulesTrace.deduction_chain : []),
    [appliedRulesTrace?.deduction_chain],
  );
  const traceStages = useMemo(
    () => (Array.isArray(appliedRulesTrace?.stages) ? appliedRulesTrace.stages : []),
    [appliedRulesTrace?.stages],
  );
  const traceNormalizationDiff = useMemo(
    () => appliedRulesTrace?.normalization_diff || {},
    [appliedRulesTrace?.normalization_diff],
  );
  const astGeneratedFromLlm = useMemo(
    () => parseAstRawPreview(result?.llmOutput?.rawJsonPreview),
    [result?.llmOutput?.rawJsonPreview],
  );
  const llmStructuredEvidence = useMemo(() => {
    const input = result?.llmInput || {};
    return {
      metrics: Array.isArray(input?.relevant_metrics) ? input.relevant_metrics : [],
      intentRules: Array.isArray(input?.matched_intent_rules) ? input.matched_intent_rules : [],
      valuePatterns: Array.isArray(input?.relevant_value_patterns) ? input.relevant_value_patterns : [],
      relationships: Array.isArray(input?.relevant_relationships) ? input.relevant_relationships : [],
      joinHints: input?.relevant_join_hints && typeof input.relevant_join_hints === "object" ? input.relevant_join_hints : {},
      synonyms: input?.relevant_synonyms && typeof input.relevant_synonyms === "object" ? input.relevant_synonyms : {},
      rules: input?.relevant_rules && typeof input.relevant_rules === "object" ? input.relevant_rules : {},
    };
  }, [result?.llmInput]);
  const llmSemanticEvidence = useMemo(() => {
    const userPrompt = String(result?.llmInput?.userPrompt || "");
    const metrics = parsePromptJsonSection(userPrompt, "Relevant metrics:");
    const intentRules = parsePromptJsonSection(userPrompt, "Matched intent rules (max 2):");
    const valuePatterns = parsePromptJsonSection(userPrompt, "Relevant value patterns:");
    const relationships = parsePromptJsonSection(userPrompt, "Relevant relationships:");
    const joinHints = parsePromptJsonSection(userPrompt, "Relevant join hints:");
    const synonyms = parsePromptJsonSection(userPrompt, "Relevant synonyms:");
    const rules = parsePromptJsonSection(userPrompt, "Relevant rules:");
    return {
      metrics: Array.isArray(metrics) ? metrics : [],
      intentRules: Array.isArray(intentRules) ? intentRules : [],
      valuePatterns: Array.isArray(valuePatterns) ? valuePatterns : [],
      relationships: Array.isArray(relationships) ? relationships : [],
      joinHints: joinHints && typeof joinHints === "object" ? joinHints : {},
      synonyms: synonyms && typeof synonyms === "object" ? synonyms : {},
      rules: rules && typeof rules === "object" ? rules : {},
    };
  }, [result?.llmInput?.userPrompt]);
  const sqlGenerationMatrix = useMemo(
    () => result?.analysis?.sql_generation_matrix || {},
    [result?.analysis?.sql_generation_matrix],
  );
  const matrixGlobal = useMemo(() => sqlGenerationMatrix?.global || {}, [sqlGenerationMatrix?.global]);
  const matrixScoped = useMemo(() => sqlGenerationMatrix?.scoped || {}, [sqlGenerationMatrix?.scoped]);
  const matrixEntitySpecific = useMemo(() => sqlGenerationMatrix?.entity_specific || {}, [sqlGenerationMatrix?.entity_specific]);
  const intentRuleRows = useMemo(() => {
    const fromMatrix = Array.isArray(matrixGlobal?.intent_rules) ? matrixGlobal.intent_rules : [];
    const fromStructured = llmStructuredEvidence.intentRules;
    const fromPrompt = llmSemanticEvidence.intentRules;
    const fromTrace = Array.isArray(appliedRulesTrace?.matched_intent_rules) ? appliedRulesTrace.matched_intent_rules : [];
    const rows = (fromStructured.length
      ? fromStructured
      : (fromMatrix.length ? fromMatrix : (fromPrompt.length ? fromPrompt : fromTrace))).map((rule) => ([
      rule?.name || "",
      rule?.force_entity || "",
      rule?.force_mode || "",
      Array.isArray(rule?.force_select) ? rule.force_select.join(", ") : "",
      Array.isArray(rule?.enforce_where) ? rule.enforce_where.map((f) => `${f?.field || ""} ${f?.op || ""} ${String(f?.value)}`).join(" | ") : "",
      Array.isArray(rule?.enforce_exists) ? rule.enforce_exists.map((e) => `${e?.not_exists ? "NOT EXISTS" : "EXISTS"} ${e?.entity || ""}`).join(" | ") : "",
    ]));
    return rows;
  }, [appliedRulesTrace?.matched_intent_rules, llmSemanticEvidence.intentRules, llmStructuredEvidence.intentRules, matrixGlobal?.intent_rules]);
  const valuePatternRows = useMemo(() => {
    const source = Array.isArray(llmStructuredEvidence?.valuePatterns) && llmStructuredEvidence.valuePatterns.length
      ? llmStructuredEvidence.valuePatterns
      : Array.isArray(matrixGlobal?.value_patterns) && matrixGlobal.value_patterns.length
      ? matrixGlobal.value_patterns
      : llmSemanticEvidence.valuePatterns;
    return source.map((vp) => ([
    vp?.from_field || vp?.fromField || "",
    vp?.to_field || vp?.toField || "",
    Array.isArray(vp?.value_starts_with || vp?.valueStartsWith) ? (vp.value_starts_with || vp.valueStartsWith).join(", ") : "",
  ]));
  }, [llmSemanticEvidence.valuePatterns, llmStructuredEvidence.valuePatterns, matrixGlobal?.value_patterns]);
  const metricsRows = useMemo(() => {
    const source = Array.isArray(llmStructuredEvidence?.metrics) && llmStructuredEvidence.metrics.length
      ? llmStructuredEvidence.metrics
      : Array.isArray(matrixGlobal?.metrics) && matrixGlobal.metrics.length
      ? matrixGlobal.metrics
      : llmSemanticEvidence.metrics;
    return source.map((m) => ([
    m?.name || "",
    m?.description || "",
  ]));
  }, [llmSemanticEvidence.metrics, llmStructuredEvidence.metrics, matrixGlobal?.metrics]);
  const joinHintsRows = useMemo(
    () => {
      const source = llmStructuredEvidence?.joinHints && Object.keys(llmStructuredEvidence.joinHints || {}).length
        ? llmStructuredEvidence.joinHints
        : matrixGlobal?.join_hints && Object.keys(matrixGlobal.join_hints || {}).length
        ? matrixGlobal.join_hints
        : llmSemanticEvidence.joinHints;
      return Object.entries(source || {}).map(([table, joins]) => ([
      table,
      Array.isArray(joins) ? joins.join(", ") : "",
    ]));
    },
    [llmSemanticEvidence.joinHints, llmStructuredEvidence.joinHints, matrixGlobal?.join_hints],
  );
  const synonymsRows = useMemo(
    () => {
      const source = llmStructuredEvidence?.synonyms && Object.keys(llmStructuredEvidence.synonyms || {}).length
        ? llmStructuredEvidence.synonyms
        : matrixGlobal?.synonyms && Object.keys(matrixGlobal.synonyms || {}).length
        ? matrixGlobal.synonyms
        : llmSemanticEvidence.synonyms;
      return Object.entries(source || {}).map(([key, vals]) => ([
      key,
      Array.isArray(vals) ? vals.join(", ") : "",
    ]));
    },
    [llmSemanticEvidence.synonyms, llmStructuredEvidence.synonyms, matrixGlobal?.synonyms],
  );
  const relationshipRows = useMemo(() => {
    const source = Array.isArray(llmStructuredEvidence?.relationships) && llmStructuredEvidence.relationships.length
      ? llmStructuredEvidence.relationships
      : Array.isArray(matrixGlobal?.relationships) && matrixGlobal.relationships.length
      ? matrixGlobal.relationships
      : llmSemanticEvidence.relationships;
    return source.map((r) => ([
    r?.name || "",
    r?.type || "",
    `${r?.from?.table || ""}.${r?.from?.column || ""}`,
    `${r?.to?.table || ""}.${r?.to?.column || ""}`,
  ]));
  }, [llmSemanticEvidence.relationships, llmStructuredEvidence.relationships, matrixGlobal?.relationships]);
  const scopedCounts = useMemo(() => ({
    intentRules: Array.isArray(matrixScoped?.intent_rules) ? matrixScoped.intent_rules.length : 0,
    valuePatterns: Array.isArray(matrixScoped?.value_patterns) ? matrixScoped.value_patterns.length : 0,
    metrics: Array.isArray(matrixScoped?.metrics) ? matrixScoped.metrics.length : 0,
    joinHints: matrixScoped?.join_hints ? Object.keys(matrixScoped.join_hints).length : 0,
    synonyms: matrixScoped?.synonyms ? Object.keys(matrixScoped.synonyms).length : 0,
    relationships: Array.isArray(matrixScoped?.relationships) ? matrixScoped.relationships.length : 0,
  }), [matrixScoped]);
  const entitySpecificIntentRuleRows = useMemo(() => {
    const source = Array.isArray(matrixEntitySpecific?.intent_rules) ? matrixEntitySpecific.intent_rules : [];
    return source.map((rule) => ([
      rule?.name || "",
      rule?.force_entity || "",
      rule?.force_mode || "",
      Array.isArray(rule?.force_select) ? rule.force_select.join(", ") : "",
      Array.isArray(rule?.enforce_where) ? rule.enforce_where.map((f) => `${f?.field || ""} ${f?.op || ""} ${String(f?.value)}`).join(" | ") : "",
      Array.isArray(rule?.enforce_exists) ? rule.enforce_exists.map((e) => `${e?.not_exists ? "NOT EXISTS" : "EXISTS"} ${e?.entity || ""}`).join(" | ") : "",
    ]));
  }, [matrixEntitySpecific?.intent_rules]);
  const entitySpecificValuePatternRows = useMemo(() => {
    const source = Array.isArray(matrixEntitySpecific?.value_patterns) ? matrixEntitySpecific.value_patterns : [];
    return source.map((vp) => ([
      vp?.from_field || vp?.fromField || "",
      vp?.to_field || vp?.toField || "",
      Array.isArray(vp?.value_starts_with || vp?.valueStartsWith) ? (vp.value_starts_with || vp.valueStartsWith).join(", ") : "",
    ]));
  }, [matrixEntitySpecific?.value_patterns]);
  const entitySpecificMetricsRows = useMemo(() => {
    const source = Array.isArray(matrixEntitySpecific?.metrics) ? matrixEntitySpecific.metrics : [];
    return source.map((m) => ([
      m?.name || "",
      m?.description || "",
    ]));
  }, [matrixEntitySpecific?.metrics]);
  const entitySpecificJoinHintsRows = useMemo(() => {
    const source = matrixEntitySpecific?.join_hints && typeof matrixEntitySpecific.join_hints === "object"
      ? matrixEntitySpecific.join_hints
      : {};
    return Object.entries(source).map(([table, joins]) => ([
      table,
      Array.isArray(joins) ? joins.join(", ") : "",
    ]));
  }, [matrixEntitySpecific?.join_hints]);
  const entitySpecificSynonymsRows = useMemo(() => {
    const source = matrixEntitySpecific?.synonyms && typeof matrixEntitySpecific.synonyms === "object"
      ? matrixEntitySpecific.synonyms
      : {};
    return Object.entries(source).map(([key, vals]) => ([
      key,
      Array.isArray(vals) ? vals.join(", ") : "",
    ]));
  }, [matrixEntitySpecific?.synonyms]);
  const entitySpecificRelationshipRows = useMemo(() => {
    const source = Array.isArray(matrixEntitySpecific?.relationships) ? matrixEntitySpecific.relationships : [];
    return source.map((r) => ([
      r?.name || "",
      r?.type || "",
      `${r?.from?.table || ""}.${r?.from?.column || ""}`,
      `${r?.to?.table || ""}.${r?.to?.column || ""}`,
    ]));
  }, [matrixEntitySpecific?.relationships]);
  const entitySpecificCounts = useMemo(() => ({
    intentRules: entitySpecificIntentRuleRows.length,
    valuePatterns: entitySpecificValuePatternRows.length,
    metrics: entitySpecificMetricsRows.length,
    joinHints: entitySpecificJoinHintsRows.length,
    synonyms: entitySpecificSynonymsRows.length,
    relationships: entitySpecificRelationshipRows.length,
  }), [
    entitySpecificIntentRuleRows.length,
    entitySpecificJoinHintsRows.length,
    entitySpecificMetricsRows.length,
    entitySpecificRelationshipRows.length,
    entitySpecificSynonymsRows.length,
    entitySpecificValuePatternRows.length,
  ]);

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
    setKickRobot(false);
    if (!streamErrorActive) {
      setKickErrorMessage("");
      setError("");
    }
    if (!streamErrorActive) {
      startRoamAnimation();
    }
    setResult(null);
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
            if (streamErrorActive || kickErrorMessage) {
              triggerReturnToButton();
            } else {
              const roamPos = getNodePos(roamRobotRef.current);
              triggerReturnToButton(roamPos);
            }
            safeDone();
          },
          onError: (err) => {
            setErrorWithKick(err);
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
      if (streamErrorActive || kickErrorMessage) {
        triggerReturnToButton();
      } else {
        const roamPos = getNodePos(roamRobotRef.current);
        triggerReturnToButton(roamPos);
      }
    }
    catch (err) {
      setErrorWithKick(err);
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
          <div ref={queryMainCardRef} className="sqd-card sqd-query-card sqd-query-main">
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
            <div className="sqd-query-footer" ref={queryFooterRef}>
              <span ref={kickTargetRef} className="sqd-kick-target" aria-hidden="true" />
              {roamRobot ? (
                <span
                  ref={roamRobotRef}
                  className={`sqd-roam-robot ${roamWalk ? "walk" : ""}`}
                  aria-hidden="true"
                  style={{ left: `${roamStartPos.x}px`, top: `${roamStartPos.y}px` }}
                >
                  <svg className="sqd-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
                    <path d="M12 2v2" />
                    <line x1="9" y1="12" x2="6" y2="16" className="loader-arm-left" />
                    <line x1="15" y1="12" x2="18" y2="16" className="loader-arm-right" />
                    <line x1="9" y1="12" x2="9" y2="20" className="loader-leg-left" />
                    <line x1="15" y1="12" x2="15" y2="20" className="loader-leg-right" />
                    <path d="M9 18h6" />
                    <path d="M10 8v.01" />
                    <path d="M14 8v.01" />
                  </svg>
                </span>
              ) : null}
              {kickRobot ? (
                <span
                  ref={kickRobotRef}
                  className="sqd-kick-robot"
                  aria-hidden="true"
                  style={{ left: `${kickStartPos.x}px`, top: `${kickStartPos.y}px` }}
                >
                  <svg className="sqd-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
                    <path d="M12 2v2" />
                    <path d="M9 12v9" />
                    <path d="M15 12v9" />
                    <path d="M5 16l4 -2" />
                    <path d="M15 14l4 2" />
                    <path d="M9 18h6" />
                    <path d="M10 8v.01" />
                    <path d="M14 8v.01" />
                  </svg>
                </span>
              ) : null}
              {returnRobot ? (
                <span
                  ref={returnRobotRef}
                  className="sqd-return-robot"
                  aria-hidden="true"
                  style={{ left: `${returnStartPos.x}px`, top: `${returnStartPos.y}px` }}
                >
                  <svg className="sqd-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
                    <path d="M12 2v2" />
                    <path d="M9 12v9" />
                    <path d="M15 12v9" />
                    <path d="M5 16l4 -2" />
                    <path d="M15 14l4 2" />
                    <path d="M9 18h6" />
                    <path d="M10 8v.01" />
                    <path d="M14 8v.01" />
                  </svg>
                </span>
              ) : null}
              <div className="sqd-query-error-wrap">
                {(error || streamErrorActive) ? (
                  <div className={`sqd-error-alert ${(streamErrorActive || isStreamConnectionError(error)) ? "stream" : ""}`}>
                    <span className="sqd-error-icon-wrap" aria-hidden="true">
                      <svg className="sqd-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
                        <path d="M12 2v2" />
                        <path d="M9 12v9" />
                        <path d="M15 12v9" />
                        <path d="M5 16l4 -2" />
                        <path d="M15 14l4 2" />
                        <path d="M9 18h6" />
                        <path d="M10 8v.01" />
                        <path d="M14 8v.01" />
                      </svg>
                      <span className="sqd-error-badge">!</span>
                    </span>
                    <span key={`stream-reveal-${streamErrorRevealSeq}`} className={`sqd-error-text ${streamErrorActive ? "sqd-error-text-reveal" : ""}`}>
                      {streamErrorActive ? kickErrorMessage : error}
                    </span>
                  </div>
                ) : null}
              </div>
              <button ref={analyzeBtnRef} type="button" className="cache-analyze-load sqd-analyze-btn" onClick={onAnalyze} disabled={loading || !String(question || "").trim()}>
                <span ref={analyzeBotAnchorRef} className="sqd-analyze-bot-anchor" aria-hidden={loading || streamErrorActive || kickRobot || roamRobot}>
                  {(!loading && !streamErrorActive && !kickRobot && !roamRobot) ? (
                    <svg className="sqd-analyze-bot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
                      <path d="M12 2v2" />
                      <path d="M9 12v9" />
                      <path d="M15 12v9" />
                      <path d="M5 16l4 -2" />
                      <path d="M15 14l4 2" />
                      <path d="M9 18h6" />
                      <path d="M10 8v.01" />
                      <path d="M14 8v.01" />
                    </svg>
                  ) : null}
                </span>
                {loading ? (
                  (!roamRobot ? (
                    <svg className="sqd-loading-runner sqd-button-runner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
                      <path d="M12 2v2" />
                      <path d="M9 18h6" />
                      <path d="M10 8v.01" />
                      <path d="M14 8v.01" />
                      <line x1="9" y1="12" x2="6" y2="16" className="loader-arm-left" />
                      <line x1="15" y1="12" x2="18" y2="16" className="loader-arm-right" />
                      <line x1="9" y1="12" x2="9" y2="20" className="loader-leg-left" />
                      <line x1="15" y1="12" x2="15" y2="20" className="loader-leg-right" />
                    </svg>
                  ) : null)
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 12h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M13 6l7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
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
                <div className="sqd-sse-empty">No Events yet.</div>
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
            <div className="sqd-card sqd-meta-strip-card">
              <div className="sqd-meta-strip">
                <span className="sqd-meta-chip"><strong>Conversation ID:</strong> {result.conversationId || "(none)"}</span>
                <span className="sqd-meta-chip"><strong>Selected Entity:</strong> {result.selectedEntity || "(none)"}</span>
                <span className="sqd-meta-chip"><strong>Reason:</strong> {result.selectedEntityReason || "(none)"}</span>
                <span className="sqd-meta-chip"><strong>AST Version:</strong> {result.astVersion || "(none)"}</span>
              </div>
            </div>

            <div className="sqd-grid sqd-top-grid">
              <div className="sqd-card sqd-ast-generated-card">
                <h3>AST Generated</h3>
                <JsonBlock value={astGeneratedFromLlm || {}} />
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
                        <div className="sqd-summary-table-scroll">
                          <DbTable columns={segment.headers.map(prettifyMarkdownHeader)} rows={segment.rows} />
                        </div>
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
              <h3>Entity Selection Context</h3>
              <div className="sqd-selected-entity-tiles">
                <div className="sqd-selected-entity-tile">
                  <div className="sqd-selected-entity-label">Entity</div>
                  <div className="sqd-selected-entity-value">{selectedEntityContext?.entity || result?.selectedEntity || "(none)"}</div>
                </div>
                <div className="sqd-selected-entity-tile">
                  <div className="sqd-selected-entity-label">Primary Table</div>
                  <div className="sqd-selected-entity-value">{selectedEntityContext?.tables?.primary || "(none)"}</div>
                </div>
                <div className="sqd-selected-entity-tile">
                  <div className="sqd-selected-entity-label">Related Tables</div>
                  <div className="sqd-selected-entity-value">{Array.isArray(selectedEntityContext?.tables?.related) ? selectedEntityContext.tables.related.length : 0}</div>
                </div>
                <div className="sqd-selected-entity-tile">
                  <div className="sqd-selected-entity-label">Fields</div>
                  <div className="sqd-selected-entity-value">{selectedEntityContext?.fieldCount ?? 0}</div>
                </div>
                <div className="sqd-selected-entity-tile">
                  <div className="sqd-selected-entity-label">Score</div>
                  <div className="sqd-selected-entity-value">{fmtMaybe(selectionEvidence?.score)}</div>
                </div>
                <div className="sqd-selected-entity-tile">
                  <div className="sqd-selected-entity-label">Why Picked</div>
                  <div className="sqd-selected-entity-value">{selectionReasons.length ? selectionReasons.join(", ") : (selectedEntityContext?.whyNarrative || "(none)")}</div>
                </div>
              </div>
              <div className="sqd-selected-path-row">
                <span className="sqd-selected-path-chip stage">retrieval: {resolvedPath?.retrievalWinner || "(none)"}</span>
                <span className="sqd-selected-path-arrow">{"->"}</span>
                <span className="sqd-selected-path-chip stage">ast: {resolvedPath?.astEntity || "(none)"}</span>
                <span className="sqd-selected-path-arrow">{"->"}</span>
                <span className="sqd-selected-path-chip final">final: {resolvedPath?.finalEntity || selectedEntityContext?.entity || "(none)"}</span>
                <span className="sqd-selected-path-chip reason">{resolvedPath?.reasonCode || "(none)"}</span>
                <span className={`sqd-selected-path-chip ${resolvedPath?.astRepaired ? "reason" : "stage"}`}>
                  ast repaired: {String(Boolean(resolvedPath?.astRepaired))}
                </span>
              </div>
              {selectionReasons.length ? (
                <div className="sqd-selected-reasons-row">
                  {selectionReasons.map((reason) => (
                    <span key={reason} className="sqd-selected-reason-chip">{reason}</span>
                  ))}
                </div>
              ) : null}
              <div className="sqd-selected-why">
                {selectedEntityContext?.whyNarrative || "No narrative available."}
              </div>
              <div className="sqd-selected-trace">
                <div className="sqd-selected-trace-title">Decision Trace</div>
                <div className="sqd-selected-trace-grid">
                  <div className="sqd-selected-trace-step">
                    <div className="sqd-selected-trace-step-label">Retrieval Winner</div>
                    <div className="sqd-selected-trace-step-value">{resolvedPath?.retrievalWinner || "(none)"}</div>
                  </div>
                  <div className="sqd-selected-trace-step">
                    <div className="sqd-selected-trace-step-label">AST Entity</div>
                    <div className="sqd-selected-trace-step-value">{resolvedPath?.astEntity || "(none)"}</div>
                  </div>
                  <div className="sqd-selected-trace-step">
                    <div className="sqd-selected-trace-step-label">Final Entity</div>
                    <div className="sqd-selected-trace-step-value">{resolvedPath?.finalEntity || "(none)"}</div>
                  </div>
                  <div className="sqd-selected-trace-step">
                    <div className="sqd-selected-trace-step-label">Reason Code</div>
                    <div className="sqd-selected-trace-step-value">{resolvedPath?.reasonCode || "(none)"}</div>
                  </div>
                </div>
                <div className="sqd-selected-score-bars">
                  <div className="sqd-selected-score-row">
                    <span>Final Score</span>
                    <div className="sqd-selected-score-track">
                      <span className="sqd-selected-score-fill final" style={{ width: `${Math.max(0, Math.min(100, Number(selectionEvidence?.score || 0) * 100))}%` }} />
                    </div>
                    <strong>{fmtMaybe(selectionEvidence?.score)}</strong>
                  </div>
                  <div className="sqd-selected-score-row">
                    <span>Deterministic</span>
                    <div className="sqd-selected-score-track">
                      <span className="sqd-selected-score-fill det" style={{ width: `${Math.max(0, Math.min(100, Number(selectionEvidence?.deterministicScore || 0) * 100))}%` }} />
                    </div>
                    <strong>{fmtMaybe(selectionEvidence?.deterministicScore)}</strong>
                  </div>
                  <div className="sqd-selected-score-row">
                    <span>Vector</span>
                    <div className="sqd-selected-score-track">
                      <span className="sqd-selected-score-fill vec" style={{ width: `${Math.max(0, Math.min(100, Number(selectionEvidence?.vectorScore || 0) * 100))}%` }} />
                    </div>
                    <strong>{fmtMaybe(selectionEvidence?.vectorScore)}</strong>
                  </div>
                </div>
                <div className="sqd-selected-ast-summary">
                  AST impact: select={astStats.selects}, filters={astStats.filters}, exists={astStats.exists}
                </div>
              </div>
              <div className="sqd-kv"><strong>Description:</strong> {selectedEntityContext?.description || "(none)"}</div>
              <div className="sqd-kv"><strong>Synonyms:</strong> {Array.isArray(selectedEntityContext?.synonyms) && selectedEntityContext.synonyms.length ? selectedEntityContext.synonyms.join(", ") : "(none)"}</div>
              <div className="sqd-grid sqd-selected-evidence-grid">
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Table Coverage</h3>
                  {entityTableCoverageRows.length ? (
                    <div className="sqd-selected-table-scroll">
                      <DbTable columns={["Table", "Fields from Entity"]} rows={entityTableCoverageRows} />
                    </div>
                  ) : (
                    <pre className="sqd-pre">No table coverage available.</pre>
                  )}
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Selection Evidence</h3>
                  <JsonBlock value={selectionEvidence || {}} />
                </div>
              </div>
              <div className="sqd-selected-fields-table">
                <div className="sqd-selected-table-scroll">
                  <DbTable
                    columns={["Field", "Column", "Table", "Type", "Filterable", "Searchable", "Key", "Allowed Values", "Aliases"]}
                    rows={entityFieldRows}
                  />
                </div>
              </div>
            </div>

            <div className="sqd-card">
              <h3>Semantic Layer Evidence (Sent to LLM)</h3>
              <div className="sqd-kv">
                <strong>Selected Entity:</strong> {sqlGenerationMatrix?.selected_entity || result?.selectedEntity || "(none)"} |
                <strong> Entity Tables:</strong> {Array.isArray(sqlGenerationMatrix?.entity_tables) && sqlGenerationMatrix.entity_tables.length ? sqlGenerationMatrix.entity_tables.join(", ") : "(none)"}
              </div>
              <div className="sqd-semantic-evidence-grid">
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Intent Rules <span className="sqd-small-count">(scoped: {scopedCounts.intentRules})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Rule", "Force Entity", "Force Mode", "Force Select", "Enforce Where", "Enforce Exists"]}
                      rows={intentRuleRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Value Patterns <span className="sqd-small-count">(scoped: {scopedCounts.valuePatterns})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["From Field", "To Field", "Value Starts With"]}
                      rows={valuePatternRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Metrics <span className="sqd-small-count">(scoped: {scopedCounts.metrics})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Metric", "Description"]}
                      rows={metricsRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Join Hints <span className="sqd-small-count">(scoped: {scopedCounts.joinHints})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Table", "Commonly Joined With"]}
                      rows={joinHintsRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Synonyms <span className="sqd-small-count">(scoped: {scopedCounts.synonyms})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Key", "Values"]}
                      rows={synonymsRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Relationships <span className="sqd-small-count">(scoped: {scopedCounts.relationships})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Name", "Type", "From", "To"]}
                      rows={relationshipRows}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="sqd-card">
              <h3>Semantic Layer Evidence (Entity-Specific YAML)</h3>
              <div className="sqd-kv">
                <strong>Selected Entity:</strong> {sqlGenerationMatrix?.selected_entity || result?.selectedEntity || "(none)"} |
                <strong> Entity Tables:</strong> {Array.isArray(sqlGenerationMatrix?.entity_tables) && sqlGenerationMatrix.entity_tables.length ? sqlGenerationMatrix.entity_tables.join(", ") : "(none)"}
              </div>
              <div className="sqd-semantic-evidence-grid">
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Intent Rules <span className="sqd-small-count">(entity: {entitySpecificCounts.intentRules})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Rule", "Force Entity", "Force Mode", "Force Select", "Enforce Where", "Enforce Exists"]}
                      rows={entitySpecificIntentRuleRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Value Patterns <span className="sqd-small-count">(entity: {entitySpecificCounts.valuePatterns})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["From Field", "To Field", "Value Starts With"]}
                      rows={entitySpecificValuePatternRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Metrics <span className="sqd-small-count">(entity: {entitySpecificCounts.metrics})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Metric", "Description"]}
                      rows={entitySpecificMetricsRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Join Hints <span className="sqd-small-count">(entity: {entitySpecificCounts.joinHints})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Table", "Commonly Joined With"]}
                      rows={entitySpecificJoinHintsRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Synonyms <span className="sqd-small-count">(entity: {entitySpecificCounts.synonyms})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Key", "Values"]}
                      rows={entitySpecificSynonymsRows}
                    />
                  </div>
                </div>
                <div className="sqd-card sqd-selected-inner-card">
                  <h3>Relationships <span className="sqd-small-count">(entity: {entitySpecificCounts.relationships})</span></h3>
                  <div className="sqd-selected-table-scroll">
                    <DbTable
                      columns={["Name", "Type", "From", "To"]}
                      rows={entitySpecificRelationshipRows}
                    />
                  </div>
                </div>
              </div>
            </div>

            {sqlErrorDetails ? (
              <div className="sqd-card sqd-sql-error-card">
                <h3>SQL Execution Error</h3>
                <div className="sqd-sql-error-top">
                  <span className="sqd-sql-error-badge">{sqlErrorDetails.stage}</span>
                  <span className="sqd-sql-root-class-chip" title={sqlErrorDetails.rootCauseClass || ""}>
                    {sqlErrorDetails.rootCauseClass || "rootCauseClass: (none)"}
                  </span>
                </div>
                <div className="sqd-kv"><strong>rootCauseMessage:</strong></div>
                <div className="sqd-sql-error-message">{sqlErrorDetails.rootCauseMessage || "(none)"}</div>
                <details className="sqd-sql-error-details">
                  <summary>stackTrace</summary>
                  <pre className="sqd-pre sqd-sql-error-pre">{sqlErrorDetails.stackTrace || "(none)"}</pre>
                </details>
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

            <div className="sqd-card sqd-postmortem-card">
              <h3>Applied Rules Postmortem</h3>
              <div className="sqd-postmortem-headline">
                <span className="sqd-postmortem-chip strong">rule: {traceSelectedRule?.name || "(none)"}</span>
                <span className="sqd-postmortem-chip">entity: {result?.selectedEntity || "(none)"}</span>
                <span className="sqd-postmortem-chip">stage: {traceSelectedRule?.applied_at_stage || "AST_NORMALIZATION"}</span>
                <span className="sqd-postmortem-chip">prompt chars: {appliedRulesTrace?.prompt_provenance?.user_prompt_chars ?? 0}</span>
              </div>

              <div className="sqd-postmortem-grid">
                <div className="sqd-postmortem-panel">
                  <div className="sqd-postmortem-subhead">Matched Intent Rules</div>
                  <div className="sqd-postmortem-chip-row">
                    {traceMatchedRules.length ? traceMatchedRules.map((rule) => (
                      <span key={`${rule?.name || "rule"}-${rule?.force_entity || ""}`} className="sqd-postmortem-chip accent" title={rule?.description || ""}>
                        {rule?.name || "(rule)"} • {rule?.force_entity || "no-force-entity"}
                      </span>
                    )) : <span className="sqd-postmortem-chip muted">No rule matched</span>}
                  </div>
                </div>

                <div className="sqd-postmortem-panel">
                  <div className="sqd-postmortem-subhead">Injected Constraints</div>
                  <div className="sqd-postmortem-injected">
                    <div className="sqd-postmortem-submini">enforce_where</div>
                    <div className="sqd-postmortem-chip-row">
                      {Array.isArray(traceSelectedRule?.enforce_where) && traceSelectedRule.enforce_where.length ? traceSelectedRule.enforce_where.map((f, idx) => (
                        <span key={`ew-${idx}`} className="sqd-postmortem-chip">
                          {f?.field || "field"} {f?.op || "op"} {String(f?.value)}
                        </span>
                      )) : <span className="sqd-postmortem-chip muted">(none)</span>}
                    </div>
                    <div className="sqd-postmortem-submini">enforce_exists</div>
                    <div className="sqd-postmortem-chip-row">
                      {Array.isArray(traceSelectedRule?.enforce_exists) && traceSelectedRule.enforce_exists.length ? traceSelectedRule.enforce_exists.map((e, idx) => (
                        <span key={`ex-${idx}`} className="sqd-postmortem-chip warning">
                          {Boolean(e?.not_exists) ? "NOT EXISTS" : "EXISTS"} {e?.entity || "entity"}
                        </span>
                      )) : <span className="sqd-postmortem-chip muted">(none)</span>}
                    </div>
                  </div>
                </div>

                <div className="sqd-postmortem-panel">
                  <div className="sqd-postmortem-subhead">Prompt Provenance</div>
                  <div className="sqd-postmortem-chip-row">
                    {tracePromptSections.length ? tracePromptSections.map((s, idx) => (
                      <span key={`${s?.section || "section"}-${idx}`} className={`sqd-postmortem-chip ${s?.included ? "ok" : "no"}`}>
                        {s?.section}: {s?.included ? "included" : "missing"}
                      </span>
                    )) : <span className="sqd-postmortem-chip muted">(none)</span>}
                  </div>
                </div>

                <div className="sqd-postmortem-panel">
                  <div className="sqd-postmortem-subhead">Normalization Diff</div>
                  <div className="sqd-postmortem-chip-row">
                    <span className="sqd-postmortem-chip">entity before: {traceNormalizationDiff?.entity_before || "(none)"}</span>
                    <span className="sqd-postmortem-chip">entity after: {traceNormalizationDiff?.entity_after || "(none)"}</span>
                    <span className="sqd-postmortem-chip">filters: {traceNormalizationDiff?.filter_count_before ?? 0} → {traceNormalizationDiff?.filter_count_after ?? 0}</span>
                    <span className="sqd-postmortem-chip">exists: {traceNormalizationDiff?.exists_count_before ?? 0} → {traceNormalizationDiff?.exists_count_after ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="sqd-postmortem-subhead">Deduction Chain</div>
              <div className="sqd-postmortem-chain">
                {traceDeductionChain.length ? traceDeductionChain.map((step, idx) => (
                  <div key={`${step?.id || "step"}-${idx}`} className="sqd-postmortem-step">
                    <div className="sqd-postmortem-step-head">
                      <span className="sqd-postmortem-step-id">{step?.id || "Q?"}</span>
                      <span className="sqd-postmortem-step-title">{step?.title || "(step)"}</span>
                    </div>
                    <JsonBlock value={step?.evidence || {}} className="sqd-pre sqd-postmortem-json" />
                  </div>
                )) : <pre className="sqd-pre">No deduction chain.</pre>}
              </div>

              <div className="sqd-postmortem-subhead">Value Pattern Remaps</div>
              <div className="sqd-postmortem-grid">
                <div className="sqd-postmortem-panel">
                  <div className="sqd-postmortem-submini">considered</div>
                  <JsonBlock value={traceRemaps?.considered || []} className="sqd-pre sqd-postmortem-json" />
                </div>
                <div className="sqd-postmortem-panel">
                  <div className="sqd-postmortem-submini">applied</div>
                  <JsonBlock value={traceRemaps?.applied || []} className="sqd-pre sqd-postmortem-json" />
                </div>
              </div>

              <div className="sqd-postmortem-subhead">Stage Mapping</div>
              <div className="sqd-postmortem-chip-row">
                {traceStages.length ? traceStages.map((s, idx) => (
                  <span key={`st-${idx}`} className="sqd-postmortem-chip stage" title={s?.detail || ""}>
                    {s?.stage || "STAGE"}: {s?.detail || ""}
                  </span>
                )) : <span className="sqd-postmortem-chip muted">(none)</span>}
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
