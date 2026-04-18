import { DbTable } from "../../convengine/DbTable.jsx";

function isMarkdownTableSeparator(line) {
  const trimmed = line.trim();
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(trimmed);
}

function splitMarkdownRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
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

export function containsMarkdownTable(text) {
  return parseMarkdownTableSegments(text).some((segment) => segment.type === "table");
}

export function renderAssistantContent(text) {
  const segments = parseMarkdownTableSegments(text);
  return segments.map((segment, idx) => {
    if (segment.type === "table") {
      return (
        <div key={`tbl-${idx}`} style={{ margin: "10px 0" }}>
          <DbTable columns={segment.headers.map(prettifyMarkdownHeader)} rows={segment.rows} />
        </div>
      );
    }

    return (
      <pre key={`txt-${idx}`} className="chat-text">
        {segment.text}
      </pre>
    );
  });
}
