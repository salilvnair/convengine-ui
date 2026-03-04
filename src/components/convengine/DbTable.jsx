import React, { useEffect, useMemo, useRef, useState } from "react";
import { renderInlineTokens } from "./renderInlineTokens";

export function DbTable({ title, columns = [], rows = [], note, className = "" }) {
  const colsClass = `ce-table-cols-${columns.length || 0}`;
  const showColumnPicker = columns.length >= 5;
  const pickerRef = useRef(null);
  const wrapRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(() => columns.map(() => true));
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false);
  const hasTitle = Boolean(String(title ?? "").trim());
  const isPickerOpen = showColumnPicker && pickerOpen;

  useEffect(() => {
    if (!isPickerOpen) return undefined;
    function onDocMouseDown(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isPickerOpen]);

  const visibleIndices = useMemo(() => columns
    .map((_, idx) => (selectedColumns[idx] !== false ? idx : -1))
    .filter((idx) => idx >= 0), [columns, selectedColumns]);

  const effectiveVisibleIndices = visibleIndices.length ? visibleIndices : [0];
  const visibleColumns = effectiveVisibleIndices.map((idx) => columns[idx]);
  const visibleRows = rows.map((row) => effectiveVisibleIndices.map((idx) => (Array.isArray(row) ? row[idx] : "")));

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const updateScrollState = () => {
      setHasHorizontalScroll(el.scrollWidth > el.clientWidth + 1);
    };
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [visibleColumns, visibleRows, isPickerOpen]);

  const colWidths = visibleColumns.map((col, idx) => {
    const headerLen = String(col ?? "").trim().length;
    const maxRowLen = visibleRows.reduce((maxLen, row) => {
      const value = row[idx];
      const len = String(value ?? "").trim().length;
      return Math.max(maxLen, len);
    }, 0);
    const maxLen = Math.max(headerLen, maxRowLen);
    const widthCh = Math.min(42, Math.max(8, maxLen + 2));
    return `${widthCh}ch`;
  });

  const selectedCount = columns.reduce((count, _, idx) => count + (selectedColumns[idx] !== false ? 1 : 0), 0);
  const openPicker = () => setPickerOpen(true);

  return (
    <section className={`ce-table-card ${colsClass} ${className} ${!hasTitle ? "ce-table-card-inline-picker" : ""}`.trim()} ref={pickerRef}>
      {hasTitle ? (
      <div className="ce-table-card-head">
        <h3 className="ce-table-card-title">{renderInlineTokens(title)}</h3>
        {showColumnPicker && (
          <button type="button" className="ce-table-cols-btn" onClick={openPicker} title="Choose columns" aria-label="Choose columns">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16M15 4v16" />
            </svg>
            <span className="ce-table-cols-hover-label">Columns</span>
            <span>{selectedCount}</span>
          </button>
        )}
      </div>
      ) : null}
      {!hasTitle && showColumnPicker ? (
        <div className="ce-table-inline-tools">
          <button type="button" className="ce-table-cols-btn ce-table-cols-btn-inline" onClick={openPicker} title="Choose columns" aria-label="Choose columns">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16M15 4v16" />
            </svg>
            <span className="ce-table-cols-hover-label">Columns</span>
            <span>{selectedCount}</span>
          </button>
          {isPickerOpen && (
            <div className="ce-table-cols-popup ce-table-cols-popup-inline" role="dialog" aria-label="Select columns">
              <div className="ce-table-cols-popup-title">Columns</div>
              <div className="ce-table-cols-list">
                {columns.map((col, idx) => (
                  <label key={`pick-${String(col)}-${idx}`} className="ce-table-cols-item">
                    <input
                      type="checkbox"
                      checked={selectedColumns[idx] !== false}
                      onChange={(e) => {
                        const next = [...selectedColumns];
                        next[idx] = e.target.checked;
                        if (!columns.some((_, i) => next[i] !== false)) {
                          return;
                        }
                        setSelectedColumns(next);
                      }}
                    />
                    <span>{String(col)}</span>
                  </label>
                ))}
              </div>
              <div className="ce-table-cols-actions">
                <button type="button" className="ce-table-cols-action" onClick={() => setPickerOpen(false)}>Cancel</button>
                <button type="button" className="ce-table-cols-action primary" onClick={() => setPickerOpen(false)}>OK</button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      <div ref={wrapRef} className={`ce-table-wrap ${hasHorizontalScroll ? "has-scroll-x" : "no-scroll-x"}`}>
        {isPickerOpen && hasTitle && showColumnPicker && (
          <div className="ce-table-cols-popup" role="dialog" aria-label="Select columns">
            <div className="ce-table-cols-popup-title">Columns</div>
            <div className="ce-table-cols-list">
              {columns.map((col, idx) => (
                <label key={`pick-${String(col)}-${idx}`} className="ce-table-cols-item">
                  <input
                    type="checkbox"
                    checked={selectedColumns[idx] !== false}
                    onChange={(e) => {
                      const next = [...selectedColumns];
                      next[idx] = e.target.checked;
                      if (!columns.some((_, i) => next[i] !== false)) {
                        return;
                      }
                      setSelectedColumns(next);
                    }}
                  />
                  <span>{String(col)}</span>
                </label>
              ))}
            </div>
            <div className="ce-table-cols-actions">
              <button type="button" className="ce-table-cols-action" onClick={() => setPickerOpen(false)}>Cancel</button>
              <button type="button" className="ce-table-cols-action primary" onClick={() => setPickerOpen(false)}>OK</button>
            </div>
          </div>
        )}
        <table>
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={`cw-${i}`} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((col, i) => (
                <th key={`${String(col)}-${i}`}>
                  <span
                    className={`ce-table-cell-content ce-table-cell-head ce-table-cell-col-${i + 1}`}
                    style={{ display: "block" }}
                  >
                    {renderInlineTokens(col)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx}>
                    <span
                      className={`ce-table-cell-content ce-table-cell-body ce-table-cell-col-${cIdx + 1}`}
                      style={{ display: "block", boxSizing: "border-box" }}
                    >
                      {renderInlineTokens(cell)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note ? <div className="ce-table-note">{note}</div> : null}
    </section>
  );
}
