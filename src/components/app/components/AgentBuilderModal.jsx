export function AgentBuilderModal({
  open,
  builderType,
  onBuilderTypeChange,
  onBuild,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="abm-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="abm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="abm-header">
          <div className="abm-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h3 className="abm-title">Builder Studio</h3>
            <p className="abm-sub">Choose a builder type to get started.</p>
          </div>
        </div>

        <div className="abm-body">
          <label className="abm-label">Builder type</label>
          <div className="abm-cards">
            <button
              type="button"
              className={`abm-card ${builderType === 'convengine' ? 'is-active' : ''}`}
              onClick={() => onBuilderTypeChange('convengine')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="abm-card-label">ConvEngine</span>
              <span className="abm-card-desc">Conversational AI builder</span>
            </button>
            <button
              type="button"
              className={`abm-card ${builderType === 'agents' ? 'is-active' : ''}`}
              onClick={() => onBuilderTypeChange('agents')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              <span className="abm-card-label">Agents</span>
              <span className="abm-card-desc">Visual workflow builder</span>
            </button>
          </div>
        </div>

        <div className="abm-footer">
          <button type="button" className="abm-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="abm-btn-primary" onClick={onBuild}>
            Open Studio
          </button>
        </div>
      </div>
    </div>
  );
}
