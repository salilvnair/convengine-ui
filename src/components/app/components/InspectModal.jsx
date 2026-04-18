export function InspectModal({
  open,
  inspectPrefix,
  inspectSchema,
  inspectMatchMode,
  inspectTargetPage,
  onPrefixChange,
  onSchemaChange,
  onMatchModeChange,
  onRun,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="ce-modal-overlay" role="dialog" aria-modal="true">
      <div className="ce-modal">
        <h3>Inspect DB Schema</h3>
        <p>Enter table pattern or exact table name, choose match mode, then run inspection.</p>
        <label>
          Name
          <input value={inspectPrefix} onChange={(e) => onPrefixChange(e.target.value)} placeholder="any table name or table name substring" />
        </label>
        <label>
          Match
          <select value={inspectMatchMode} onChange={(e) => onMatchModeChange(e.target.value)}>
            <option value="REGEX">REGEX</option>
            <option value="EXACT">EXACT</option>
          </select>
        </label>
        <label>
          Schema
          <input value={inspectSchema} onChange={(e) => onSchemaChange(e.target.value)} placeholder="(optional) uses convengine.schema.active" />
        </label>
        <div className="ce-modal-actions">
          <button type="button" className="cache-analyze-load" onClick={onRun}>
            {inspectTargetPage === "semantic_builder" ? "Build" : "Run"}
          </button>
          <button type="button" className="cache-analyze-load cache-analyze-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
