export function AgentBuilderModal({
  open,
  builderType,
  onBuilderTypeChange,
  onBuild,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="ce-modal-overlay" role="dialog" aria-modal="true">
      <div className="ce-modal">
        <h3>Builder Studio</h3>
        <label>
          <select value={builderType} onChange={(event) => onBuilderTypeChange(event.target.value)}>
            <option value="convengine">ConvEngine</option>
            <option value="agents">Agents</option>
          </select>
        </label>
        <div className="ce-modal-actions">
          <button type="button" className="cache-analyze-load" onClick={onBuild}>
            Build
          </button>
          <button type="button" className="cache-analyze-load cache-analyze-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
