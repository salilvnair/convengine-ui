import React from "react";
import { renderInlineTokens } from "./renderInlineTokens";

export function DbTable({ title, columns = [], rows = [], note, className = "" }) {
  const colsClass = `ce-table-cols-${columns.length || 0}`;
  const presets = {
    2: [25, 75],
    3: [25, 40, 35],
    4: [22, 28, 25, 25],
    5: [18, 22, 20, 20, 20],
  };
  const fallbackWidth = columns.length > 0 ? 100 / columns.length : 100;
  const widths = presets[columns.length] || columns.map(() => fallbackWidth);

  return (
    <section
      className={`ce-table-card ${colsClass} ${className}`.trim()}
      style={{ width: "100%", maxWidth: "100%", display: "block" }}
    >
      {title ? <h3 className="ce-table-card-title">{renderInlineTokens(title)}</h3> : null}
      <div className="ce-table-wrap" style={{ width: "100%", maxWidth: "100%" }}>
        <table style={{ width: "100%", minWidth: "100%", tableLayout: "fixed" }}>
          <colgroup>
            {columns.map((_, i) => (
              <col key={`col-${i + 1}`} style={{ width: `${widths[i]}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={`${String(col)}-${i}`}>
                  <span
                    className={`ce-table-cell-content ce-table-cell-head ce-table-cell-col-${i + 1}`}
                    style={{ display: "block", width: "100%" }}
                  >
                    {renderInlineTokens(col)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx}>
                    <span
                      className={`ce-table-cell-content ce-table-cell-body ce-table-cell-col-${cIdx + 1}`}
                      style={{ display: "block", width: "100%", boxSizing: "border-box" }}
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
