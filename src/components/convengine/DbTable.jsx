import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderInlineTokens } from "./renderInlineTokens";

export function DbTable({ title, columns = [], rows = [], note, className = "" }) {
  const colsClass = `ce-table-cols-${columns.length || 0}`;
  const showColumnPicker = columns.length >= 5;
  const pickerRef = useRef(null);
  const pickerPopupRef = useRef(null);
  const pickerAnchorRef = useRef(null);
  const wrapRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPopupPos, setPickerPopupPos] = useState({ top: 0, left: 0 });
  const [selectedColumns, setSelectedColumns] = useState(() => columns.map(() => true));
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false);
  const hasTitle = Boolean(String(title ?? "").trim());
  const isPickerOpen = showColumnPicker && pickerOpen;
  const clampPopupLeft = (x) => {
    const maxLeft = Math.max(8, window.innerWidth - 340);
    return Math.max(8, Math.min(maxLeft, x));
  };

  useEffect(() => {
    if (!isPickerOpen) return undefined;
    function onDocMouseDown(event) {
      if (pickerPopupRef.current && pickerPopupRef.current.contains(event.target)) return;
      if (pickerRef.current && pickerRef.current.contains(event.target)) return;
      if (pickerAnchorRef.current && pickerAnchorRef.current.contains(event.target)) return;
      setPickerOpen(false);
    }
    function updatePopupPos() {
      const anchor = pickerAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPickerPopupPos({
        left: clampPopupLeft(rect.left),
        top: rect.bottom + 6,
      });
    }
    updatePopupPos();
    window.addEventListener("resize", updatePopupPos);
    window.addEventListener("scroll", updatePopupPos, true);
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      window.removeEventListener("resize", updatePopupPos);
      window.removeEventListener("scroll", updatePopupPos, true);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (!showColumnPicker) {
        setPickerOpen(false);
      pickerAnchorRef.current = null;
    }
  }, [showColumnPicker]);

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
  const openPicker = (event) => {
    pickerAnchorRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    setPickerPopupPos({
      left: clampPopupLeft(rect.left),
      top: rect.bottom + 6,
    });
    setPickerOpen(true);
  };

  const pickerPopup = isPickerOpen ? createPortal(
    <div
      ref={pickerPopupRef}
      className="ce-table-cols-popup ce-table-cols-popup-portal"
      role="dialog"
      aria-label="Select columns"
      style={{ left: `${pickerPopupPos.left}px`, top: `${pickerPopupPos.top}px` }}
    >
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
    </div>,
    document.body,
  ) : null;

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
        </div>
      ) : null}
      <div ref={wrapRef} className={`ce-table-wrap ${hasHorizontalScroll ? "has-scroll-x" : "no-scroll-x"}`}>
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
      {pickerPopup}
    </section>
  );
}
