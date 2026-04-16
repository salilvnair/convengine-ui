import { useMemo, useState } from "react";
import { extractPdfWithPapermind } from "../api/convengine.api.js";

function prettyFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
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
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (match.endsWith(":")) return `<span class="pm-json-key">${match}</span>`;
      if (match.startsWith("\"")) return `<span class="pm-json-string">${match}</span>`;
      if (match === "true" || match === "false") return `<span class="pm-json-boolean">${match}</span>`;
      if (match === "null") return `<span class="pm-json-null">${match}</span>`;
      return `<span class="pm-json-number">${match}</span>`;
    },
  );
}

export default function PdfExtractPage() {
  const [files, setFiles] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [viewMode, setViewMode] = useState("structured");
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropRejected, setDropRejected] = useState(false);
  const [activeFileId, setActiveFileId] = useState("");

  const activeFile = useMemo(
    () => files.find((item) => item.id === activeFileId) || null,
    [files, activeFileId],
  );
  const activeResult = activeFile?.result || null;
  const hasResult = useMemo(() => !!(activeResult && typeof activeResult === "object"), [activeResult]);
  const tableCount = Array.isArray(activeResult?.tables) ? activeResult.tables.length : 0;
  const blockCount = Array.isArray(activeResult?.blocks) ? activeResult.blocks.length : 0;
  const hasAnyFile = files.length > 0;
  const busy = globalLoading || files.some((item) => item.status === "extracting");

  const addFiles = (rawFiles) => {
    const incoming = Array.from(rawFiles || []);
    if (!incoming.length) return;

    const valid = [];
    let rejectedCount = 0;
    for (const file of incoming) {
      if (file?.name?.toLowerCase().endsWith(".pdf")) valid.push(file);
      else rejectedCount += 1;
    }

    if (!valid.length) {
      setDropRejected(true);
      setGlobalError("Only .pdf files are supported.");
      return;
    }

    if (rejectedCount > 0) {
      setDropRejected(true);
      setGlobalError(`${rejectedCount} file(s) were ignored. Only .pdf files are supported.`);
    } else {
      setDropRejected(false);
      setGlobalError("");
    }

    setFiles((prev) => {
      const existingKey = new Set(prev.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`));
      const fresh = valid
        .filter((file) => !existingKey.has(`${file.name}-${file.size}-${file.lastModified}`))
        .map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          status: "idle",
          result: null,
          error: "",
        }));
      const next = [...prev, ...fresh];
      if (!activeFileId && next.length) {
        setActiveFileId(next[0].id);
      } else if (activeFileId && !next.some((item) => item.id === activeFileId) && next.length) {
        setActiveFileId(next[0].id);
      }
      return next;
    });
  };

  const onSelectFile = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    addFiles(event.dataTransfer?.files);
  };

  const onDragOver = (event) => {
    event.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const onDragEnter = (event) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (event) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setIsDragOver(false);
  };

  const removeFile = (fileId) => {
    setFiles((prev) => {
      const next = prev.filter((item) => item.id !== fileId);
      if (fileId === activeFileId) {
        setActiveFileId(next[0]?.id || "");
      }
      return next;
    });
  };

  const extractForEntry = async (entry) => {
    setFiles((prev) =>
      prev.map((item) =>
        item.id === entry.id
          ? {
            ...item,
            status: "extracting",
            error: "",
          }
          : item,
      ),
    );
    try {
      const payload = await extractPdfWithPapermind(entry.file);
      setFiles((prev) =>
        prev.map((item) =>
          item.id === entry.id
            ? {
              ...item,
              status: "done",
              result: payload,
              error: "",
            }
            : item,
        ),
      );
      setActiveFileId(entry.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to extract PDF content.";
      setFiles((prev) =>
        prev.map((item) =>
          item.id === entry.id
            ? {
              ...item,
              status: "error",
              error: message,
            }
            : item,
        ),
      );
      setGlobalError(message);
    }
  };

  const onExtractActive = async () => {
    if (!activeFile) {
      setGlobalError("Select a PDF file first.");
      return;
    }
    setGlobalLoading(true);
    setGlobalError("");
    await extractForEntry(activeFile);
    setGlobalLoading(false);
  };

  const onExtractAll = async () => {
    if (!files.length) {
      setGlobalError("Drop or choose at least one PDF file first.");
      return;
    }

    setGlobalLoading(true);
    setGlobalError("");
    const snapshot = [...files];
    for (const entry of snapshot) {
      // sequential extraction keeps backend load predictable
      await extractForEntry(entry);
    }
    setGlobalLoading(false);
  };

  const onReset = () => {
    setFiles([]);
    setGlobalError("");
    setViewMode("structured");
    setDropRejected(false);
    setIsDragOver(false);
    setActiveFileId("");
  };

  return (
    <section className="pm-page">
      <div className="pm-shell">
        <div className="pm-hero">
          <div>
            <h2>PDF Extract Studio</h2>
            <p>Upload a PDF, run ce_papermind extraction, and inspect text blocks plus table structures.</p>
          </div>
          <div className="pm-actions">
            <label className="pm-file-btn">
              <input type="file" accept="application/pdf,.pdf" multiple onChange={onSelectFile} />
              {hasAnyFile ? "Add PDF" : "Choose PDF"}
            </label>
            <button type="button" className="pm-run-btn" onClick={onExtractActive} disabled={busy || !activeFile}>
              {busy ? "Extracting..." : "Extract Selected"}
            </button>
            <button type="button" className="pm-run-btn pm-run-btn-all" onClick={onExtractAll} disabled={busy || !hasAnyFile}>
              {busy ? "Extracting..." : "Extract All"}
            </button>
            <button type="button" className="pm-reset-btn" onClick={onReset} disabled={busy}>
              Reset
            </button>
          </div>
        </div>

        {!hasAnyFile ? (
          <div
            className={`pm-dropzone ${isDragOver ? "is-drag-over" : ""} ${dropRejected ? "is-rejected" : ""}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                const input = document.getElementById("pm-drop-input");
                if (input) input.click();
              }
            }}
            aria-label="Drop PDF file here or click to select"
            onClick={() => {
              const input = document.getElementById("pm-drop-input");
              if (input) input.click();
            }}
          >
            <input id="pm-drop-input" type="file" accept="application/pdf,.pdf" multiple onChange={onSelectFile} />
            <div className="pm-dropzone-visual">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="pmDropGradA" x1="8" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#3B82F6" />
                    <stop offset="1" stopColor="#8B5CF6" />
                  </linearGradient>
                  <linearGradient id="pmDropGradB" x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#22D3EE" />
                    <stop offset="1" stopColor="#6366F1" />
                  </linearGradient>
                </defs>
                <rect x="7" y="6" width="34" height="48" rx="8" fill="url(#pmDropGradA)" opacity="0.18" />
                <path d="M16 14h18l8 8v28H16z" stroke="url(#pmDropGradA)" strokeWidth="2.6" strokeLinejoin="round" />
                <path d="M34 14v8h8" stroke="url(#pmDropGradA)" strokeWidth="2.6" strokeLinejoin="round" />
                <path d="M23 34h12M23 40h18" stroke="url(#pmDropGradB)" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M47 40l6-6m0 0 6 6m-6-6v20" stroke="url(#pmDropGradB)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="pm-dropzone-copy">
              <h3>Drop PDF here</h3>
              <p>Drag and drop or click anywhere in this area to select your file.</p>
            </div>
            <div className="pm-drop-hint">Supports multiple files. PDF only.</div>
          </div>
        ) : (
          <div className="pm-file-strip-wrap">
            <div className="pm-file-strip" role="list" aria-label="Selected PDF files">
              {files.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  role="listitem"
                  className={`pm-file-card ${item.id === activeFileId ? "active" : ""} ${item.status === "done" ? "done" : ""} ${item.status === "error" ? "error" : ""}`}
                  onClick={() => setActiveFileId(item.id)}
                >
                  <span
                    className="pm-file-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFile(item.id);
                    }}
                    aria-label={`Remove ${item.file.name}`}
                    title={`Remove ${item.file.name}`}
                  >
                    ×
                  </span>
                  <span className="pm-file-icon" aria-hidden="true">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                      <path d="M6.5 3.8h7.2L18 8v12.1H6.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M13.7 3.8V8H18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M8.6 12.1h6.8M8.6 15.2h6.8M8.6 18.3h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="pm-file-name" title={item.file.name}>{item.file.name}</span>
                  <span className="pm-file-size">{prettyFileSize(item.file.size)}</span>
                  <span className={`pm-file-state ${item.status}`}>
                    {item.status === "extracting" ? "extracting" : item.status === "done" ? "ready" : item.status === "error" ? "failed" : "idle"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pm-meta-row">
          <span className="pm-chip">Endpoint: `/extract/pdf`</span>
          {!hasResult ? (
            <span className="pm-chip pm-chip-suggest">
              Suggestion: select a PDF and click Extract Content to preview structured output.
            </span>
          ) : null}
          {activeFile ? (
            <>
              <span className="pm-chip">Active: {activeFile.file.name}</span>
              <span className="pm-chip">Size: {prettyFileSize(activeFile.file.size)}</span>
            </>
          ) : null}
          {hasResult ? (
            <>
              <span className="pm-chip pm-chip-ok">Pages: {activeResult?.pages ?? 0}</span>
              <span className="pm-chip pm-chip-ok">Blocks: {blockCount}</span>
              <span className="pm-chip pm-chip-ok">Tables: {tableCount}</span>
            </>
          ) : null}
        </div>

        {globalError ? (
          <div className="pm-error" role="alert">
            {globalError}
          </div>
        ) : null}

        {hasResult ? (
          <div className="pm-result-wrap">
            <div className="pm-view-toggle" role="tablist" aria-label="Result view mode">
              <button
                type="button"
                className={`pm-view-btn ${viewMode === "structured" ? "active" : ""}`}
                onClick={() => setViewMode("structured")}
              >
                Structured View
              </button>
              <button
                type="button"
                className={`pm-view-btn ${viewMode === "json" ? "active" : ""}`}
                onClick={() => setViewMode("json")}
              >
                Raw JSON
              </button>
            </div>

            {viewMode === "json" ? (
              <pre className="pm-json-card" dangerouslySetInnerHTML={{ __html: colorizeJson(activeResult) }} />
            ) : (
              <div className="pm-grid">
                <article className="pm-card">
                  <h3>Text Blocks</h3>
                  {!blockCount ? (
                    <p className="pm-empty">No text blocks returned.</p>
                  ) : (
                    <div className="pm-list">
                      {activeResult.blocks.map((block, index) => (
                        <div className="pm-list-item" key={`block-${block.page}-${index}`}>
                          <div className="pm-list-head">
                            <span className="pm-kicker">Page {block.page}</span>
                            <span className={`pm-source ${block.source === "ocr" ? "ocr" : "pdf"}`}>
                              {block.source}
                            </span>
                          </div>
                          <p>{block.text || "-"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="pm-card">
                  <h3>Tables</h3>
                  {!tableCount ? (
                    <p className="pm-empty">No tables detected.</p>
                  ) : (
                    <div className="pm-list">
                      {activeResult.tables.map((table, tableIndex) => (
                        <div className="pm-table-card" key={`table-${table.page}-${tableIndex}`}>
                          <div className="pm-list-head">
                            <span className="pm-kicker">Page {table.page}</span>
                            <span className="pm-source table">table</span>
                          </div>
                          <div className="pm-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  {(table.columns || []).map((col, colIndex) => (
                                    <th key={`col-${tableIndex}-${colIndex}`}>{col || "-"}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(table.rows || []).map((row, rowIndex) => (
                                  <tr key={`row-${tableIndex}-${rowIndex}`}>
                                    {row.map((cell, cellIndex) => (
                                      <td key={`cell-${tableIndex}-${rowIndex}-${cellIndex}`}>{cell || "-"}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            )}
          </div>
        ) : (
          <div className="pm-blank-state" />
        )}
      </div>
    </section>
  );
}
