import { useEffect, useState } from "react";
import { listIntents, fetchConfigByIntent } from "./api/ceConfig.api.js";

// Intent picker modal. Opens when the user clicks "Load Existing" in the
// CE Builder toolbar. Fetches the intent catalog from the backend, lets the
// admin pick one, then pulls all rows keyed by that intent and hydrates the
// canvas via the store's loadFromPayload action.

export default function LoadExistingDialog({ open, onClose, onLoaded }) {
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setSelected(null);
    setFilter("");
    listIntents()
      .then((rows) => {
        if (!active) return;
        setIntents(Array.isArray(rows) ? rows : rows?.rows ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to list intents");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const filtered = intents.filter((row) => {
    if (!filter) return true;
    const needle = filter.toLowerCase();
    return (
      String(row.intent_code || "").toLowerCase().includes(needle) ||
      String(row.display_name || "").toLowerCase().includes(needle) ||
      String(row.description || "").toLowerCase().includes(needle)
    );
  });

  const handleLoad = async () => {
    if (!selected) return;
    setLoadingRows(true);
    setError("");
    try {
      const payload = await fetchConfigByIntent(selected.intent_code);
      onLoaded(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoadingRows(false);
    }
  };

  return (
    <div className="ce-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ce-modal ce-load-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ce-load-head">
          <h3>Load existing configuration</h3>
          <p>Pick an intent. All rows keyed by that intent will be hydrated onto the canvas.</p>
        </header>

        <input
          className="ce-load-filter"
          autoFocus
          placeholder="Filter by intent code, name, or description…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <div className="ce-load-list">
          {loading ? <div className="ce-load-status">Loading intents…</div> : null}
          {error ? <div className="ce-load-status ce-load-status-err">{error}</div> : null}
          {!loading && !error && filtered.length === 0 ? (
            <div className="ce-load-status">No intents match.</div>
          ) : null}
          {filtered.map((row) => {
            const active = selected?.intent_code === row.intent_code;
            return (
              <button
                key={row.intent_code}
                type="button"
                className={`ce-load-row${active ? " is-active" : ""}`}
                onClick={() => setSelected(row)}
                onDoubleClick={() => {
                  setSelected(row);
                  handleLoad();
                }}
              >
                <div className="ce-load-row-head">
                  <span className="ce-load-row-code">{row.intent_code}</span>
                  {row.display_name ? <span className="ce-load-row-name">{row.display_name}</span> : null}
                  {row.enabled === false ? <span className="ce-load-row-chip">disabled</span> : null}
                </div>
                {row.description ? <span className="ce-load-row-desc">{row.description}</span> : null}
              </button>
            );
          })}
        </div>

        <footer className="ce-load-actions">
          <button type="button" className="ce-builder-btn" onClick={onClose} disabled={loadingRows}>
            Cancel
          </button>
          <button
            type="button"
            className="ce-builder-btn ce-builder-btn-primary"
            onClick={handleLoad}
            disabled={!selected || loadingRows}
          >
            {loadingRows ? "Loading…" : "Load onto canvas"}
          </button>
        </footer>
      </div>
    </div>
  );
}
