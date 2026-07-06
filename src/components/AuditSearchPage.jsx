import { useState } from "react";
import { fetchAudits } from "../api/convengine.api.js";
import AuditTimeline from "./AuditTimeline";

export default function AuditSearchPage() {
  const [conversationId, setConversationId] = useState("");
  const [searchedId, setSearchedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [audits, setAudits] = useState([]);

  const onSearch = async () => {
    const id = conversationId.trim();
    if (!id) {
      setError("Enter a conversation id to search.");
      return;
    }
    setLoading(true);
    setError("");
    setSearchedId(id);
    try {
      const rows = await fetchAudits(id);
      const list = Array.isArray(rows) ? rows : [];
      setAudits(list);
      if (!list.length) setError("No audit events found for this conversation id.");
    } catch (err) {
      setAudits([]);
      setError(err instanceof Error ? err.message : "Failed to load audit timeline");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") onSearch();
  };

  return (
    <section className="cache-analyze-page audit-search-page">
      <div className="cache-analyze-content">
        <div className="cache-analyze-toolbar">
          <div>
            <h2>Audit Search</h2>
            <p>Look up the audit chat for any conversation id from `ce_audit`.</p>
          </div>

          <div className="cache-analyze-actions">
            <input
              type="text"
              className="audit-conv-id audit-search-input"
              style={{ minWidth: "320px" }}
              placeholder="Enter conversation id (UUID)"
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              className="cache-analyze-load"
              onClick={onSearch}
              disabled={loading}
              title={loading ? "Searching audit trail" : "Search audit trail"}
              aria-label={loading ? "Searching audit trail" : "Search audit trail"}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {error ? <div className="cache-analyze-error">{error}</div> : null}

        {searchedId ? (
          <div className="audit-search-results">
            <AuditTimeline audits={audits} loading={loading} error="" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
