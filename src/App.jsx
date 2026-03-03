import { useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import AuditTimeline from "./components/AuditTimeline";
import CacheAnalyzePage from "./components/CacheAnalyzePage";
import DbSchemaInspectPage from "./components/DbSchemaInspectPage";
import { fetchAudits, refreshCaches, subscribeConversation } from "./api/convengine.api.js";

const DEFAULT_AUDIT_WIDTH = 460;
const MIN_PROGRESS_VISIBLE_MS = 9000;

function extractVerboseText(streamEvent) {
  const payload = streamEvent?.data;
  if (!payload || typeof payload !== "object") return "";
  const verbose =
    (payload.verbose && typeof payload.verbose === "object" && payload.verbose) ||
    (payload.payload && typeof payload.payload === "object" && payload.payload.verbose && typeof payload.payload.verbose === "object" && payload.payload.verbose) ||
    null;
  if (!verbose) return "";
  if (typeof verbose.text === "string" && verbose.text.trim()) return verbose.text.trim();
  if (typeof verbose.message === "string" && verbose.message.trim()) return verbose.message.trim();
  if (typeof verbose.errorMessage === "string" && verbose.errorMessage.trim()) return verbose.errorMessage.trim();
  return "";
}

function resolveStage(streamEvent) {
  if (typeof streamEvent?.stage === "string" && streamEvent.stage.trim()) return streamEvent.stage.trim();
  const payload = streamEvent?.data;
  if (payload && typeof payload === "object" && typeof payload.stage === "string") return payload.stage.trim();
  return "";
}

function RefreshCacheIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 4.8V10.2H14.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19.2V13.8H9.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 9.9C6.9 8.35 8.1 7.05 9.62 6.2C11.14 5.35 12.9 5.03 14.62 5.29C16.34 5.55 17.92 6.38 19.1 7.68" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.8 14.1C17.1 15.65 15.9 16.95 14.38 17.8C12.86 18.65 11.1 18.97 9.38 18.71C7.66 18.45 6.08 17.62 4.9 16.32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AnalyzeCacheIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.2" y="3.6" width="15.6" height="16.8" rx="2.7" stroke="currentColor" strokeWidth="2" />
      <path d="M8 14.8L10.8 12L12.9 14.1L16.2 10.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 18.2H16.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="14.8" r="1.05" fill="currentColor" />
      <circle cx="10.8" cy="12" r="1.05" fill="currentColor" />
      <circle cx="12.9" cy="14.1" r="1.05" fill="currentColor" />
      <circle cx="16.2" cy="10.4" r="1.05" fill="currentColor" />
    </svg>
  );
}

function InspectDbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.2" width="17" height="6.1" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="13.7" width="10.8" height="6.1" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 14.3L20.7 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.2" cy="13.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function App() {
  const [conversationId] = useState(crypto.randomUUID());
  const [auditVersion, setAuditVersion] = useState(0);
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("convengine_ui_theme") === "dark" ? "dark" : "light";
  });
  const [engineIntent, setEngineIntent] = useState("");
  const [engineState, setEngineState] = useState("");
  const [turnLatencyMs, setTurnLatencyMs] = useState(null);
  const [activePage, setActivePage] = useState("chat");
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectPrefix, setInspectPrefix] = useState("");
  const [inspectSchema, setInspectSchema] = useState("");
  const [inspectMatchMode, setInspectMatchMode] = useState("REGEX");
  const [inspectQuery, setInspectQuery] = useState({ prefix: "", schema: "", matchMode: "REGEX" });
  const [cacheRefreshLoading, setCacheRefreshLoading] = useState(false);
  const [cacheRefreshMessage, setCacheRefreshMessage] = useState("");
  const [liveProgressText, setLiveProgressText] = useState("");
  const progressShownAtRef = useRef(0);
  const progressTimerRef = useRef(null);
  const clearTimerRef = useRef(null);
  const queuedProgressRef = useRef("");

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditEvents, setAuditEvents] = useState([]);
  const [copiedConvId, setCopiedConvId] = useState(false);
  const [auditDrawerWidth, setAuditDrawerWidth] = useState(DEFAULT_AUDIT_WIDTH);
  const [auditResizing, setAuditResizing] = useState(false);
  const auditResizingRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    window.localStorage.setItem("convengine_ui_theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const clearProgressTimers = () => {
      if (progressTimerRef.current) {
        window.clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };

    const commitProgressText = (text) => {
      setLiveProgressText(text);
      progressShownAtRef.current = Date.now();
    };

    const scheduleQueuedProgress = (delayMs) => {
      if (progressTimerRef.current) return;
      progressTimerRef.current = window.setTimeout(() => {
        progressTimerRef.current = null;
        const next = queuedProgressRef.current;
        queuedProgressRef.current = "";
        if (next) commitProgressText(next);
      }, Math.max(0, delayMs));
    };

    const applyProgressText = (text) => {
      if (!text) return;
      setLiveProgressText((current) => {
        if (!current) {
          progressShownAtRef.current = Date.now();
          return text;
        }
        if (current === text) return current;
        const elapsed = Date.now() - progressShownAtRef.current;
        if (elapsed >= MIN_PROGRESS_VISIBLE_MS) {
          progressShownAtRef.current = Date.now();
          return text;
        }
        queuedProgressRef.current = text;
        scheduleQueuedProgress(MIN_PROGRESS_VISIBLE_MS - elapsed);
        return current;
      });
    };

    const clearProgressTextSmoothly = () => {
      queuedProgressRef.current = "";
      if (progressTimerRef.current) {
        window.clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setLiveProgressText((current) => {
        if (!current) return "";
        const elapsed = Date.now() - progressShownAtRef.current;
        if (elapsed >= MIN_PROGRESS_VISIBLE_MS) return "";
        if (!clearTimerRef.current) {
          clearTimerRef.current = window.setTimeout(() => {
            clearTimerRef.current = null;
            setLiveProgressText("");
          }, MIN_PROGRESS_VISIBLE_MS - elapsed);
        }
        return current;
      });
    };

    if (!conversationId) return undefined;
    const stream = subscribeConversation(conversationId, {
      onConnected: () => setAuditVersion((v) => v + 1),
      onEvent: (event) => {
        setAuditVersion((v) => v + 1);
        const text = extractVerboseText(event);
        if (text) {
          if (clearTimerRef.current) {
            window.clearTimeout(clearTimerRef.current);
            clearTimerRef.current = null;
          }
          applyProgressText(text);
        }

        const stage = resolveStage(event).toUpperCase();
        if (stage === "ASSISTANT_OUTPUT" || stage === "ENGINE_RETURN") clearProgressTextSmoothly();
      },
      onError: () => {},
    });

    return () => {
      stream.close();
      clearProgressTimers();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !auditOpen) return;
    let active = true;
    setAuditLoading(true);
    setAuditError("");

    fetchAudits(conversationId)
      .then((rows) => {
        if (!active) return;
        setAuditEvents(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!active) return;
        setAuditError(err instanceof Error ? err.message : "Failed to load audit timeline");
      })
      .finally(() => {
        if (!active) return;
        setAuditLoading(false);
      });

    return () => {
      active = false;
    };
  }, [conversationId, auditVersion, auditOpen]);

  useEffect(() => {
    const onMouseMove = (event) => {
      if (!auditResizingRef.current) return;
      const minWidth = 460;
      const maxWidth = Math.floor(window.innerWidth * 0.8);
      const next = Math.min(Math.max(window.innerWidth - event.clientX, minWidth), maxWidth);
      setAuditDrawerWidth(next);
    };

    const stopResize = () => {
      if (!auditResizingRef.current) return;
      auditResizingRef.current = false;
      setAuditResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseleave", stopResize);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("mouseleave", stopResize);
    };
  }, []);

  const onAuditResizeMouseDown = () => {
    auditResizingRef.current = true;
    setAuditResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onAuditResizeDoubleClick = () => {
    const maxWidth = Math.floor(window.innerWidth * 0.8);
    const threshold = 16;
    setAuditDrawerWidth((prev) => (Math.abs(prev - maxWidth) <= threshold ? DEFAULT_AUDIT_WIDTH : maxWidth));
  };

  const onCopyConversationId = async () => {
    try {
      await navigator.clipboard.writeText(conversationId);
      setCopiedConvId(true);
      window.setTimeout(() => setCopiedConvId(false), 1100);
    } catch {
      setCopiedConvId(false);
    }
  };

  const onEngineStatusUpdate = ({ intent, state }) => {
    if (typeof intent === "string" && intent.trim()) setEngineIntent(intent.trim());
    if (typeof state === "string" && state.trim()) setEngineState(state.trim());
  };

  const onCacheRefresh = async () => {
    setCacheRefreshLoading(true);
    setCacheRefreshMessage("");
    try {
      const message = await refreshCaches();
      setCacheRefreshMessage(message || "Cache refresh completed");
    } catch (err) {
      setCacheRefreshMessage(err instanceof Error ? err.message : "Cache refresh failed");
    } finally {
      setCacheRefreshLoading(false);
      window.setTimeout(() => setCacheRefreshMessage(""), 4200);
    }
  };

  const onToggleAnalyzePage = () => {
    setActivePage((prev) => (prev === "chat" ? "cache" : "chat"));
  };

  const onOpenInspectDialog = () => {
    setInspectOpen(true);
  };

  const onRunInspect = () => {
    setInspectQuery({ prefix: inspectPrefix, schema: inspectSchema, matchMode: inspectMatchMode });
    setInspectOpen(false);
    setActivePage("schema");
  };

  const onTurnTimingUpdate = (elapsedMs) => {
    if (typeof elapsedMs !== "number" || Number.isNaN(elapsedMs)) {
      setTurnLatencyMs(null);
      return;
    }
    setTurnLatencyMs(Math.max(0, Math.round(elapsedMs)));
  };

  const formatTurnLatency = (ms) => {
    if (typeof ms !== "number") return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <>
      <aside className={`audit-drawer ${auditOpen ? "open" : ""} ${auditResizing ? "resizing" : ""}`} style={{ width: `${auditDrawerWidth}px` }}>
        <div className="audit-resize-handle" onMouseDown={onAuditResizeMouseDown} onDoubleClick={onAuditResizeDoubleClick} title="Drag to resize (double-click to toggle max/default)" />
        <div className="audit-head">
          <h3>Audit Timeline</h3>
          <div className="audit-head-actions">
            <span className="audit-conv-id" title={conversationId}>{conversationId}</span>
            <button
              type="button"
              className={`audit-icon-btn audit-copy ${copiedConvId ? "is-copied" : ""}`}
              onClick={onCopyConversationId}
              title={copiedConvId ? "Conversation ID copied" : "Copy Conversation ID"}
              aria-label={copiedConvId ? "Conversation ID copied" : "Copy Conversation ID"}
            >
              {copiedConvId ? "✓" : "⎘"}
            </button>
            <button type="button" className="audit-icon-btn audit-close" onClick={() => setAuditOpen(false)} title="Close Audit Timeline" aria-label="Close Audit Timeline">✕</button>
          </div>
        </div>
        <AuditTimeline audits={auditEvents} loading={auditLoading} error={auditError} />
      </aside>

      <div className="app-shell">
        <main className="main-chat-layout">
          <header className="top-nav">
            <div className="brand-wrap">
              <button
                type="button"
                className="brand-icon hero-home-btn"
                onClick={() => window.location.reload()}
                title="ConvEngine"
                aria-label="ConvEngine"
              >
                <img
                  src={themeMode === "dark" ? "/logo-dark.png" : "/logo-light.png"}
                  alt="ConvEngine"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/conv.svg";
                  }}
                />
              </button>
              <div className="brand-copy">
                <div className="brand-title-row">
                  <h1>ConvEngine</h1>
                  <div className="hero-cache-actions">
                    <button
                      type="button"
                      className="hero-cache-icon-btn hero-cache-icon-btn-refresh"
                      onClick={onCacheRefresh}
                      disabled={cacheRefreshLoading}
                      title={cacheRefreshLoading ? "Refreshing cache..." : "Refresh cache"}
                      aria-label={cacheRefreshLoading ? "Refreshing cache" : "Refresh cache"}
                    >
                      <RefreshCacheIcon />
                    </button>
                    <button
                      type="button"
                      className={`hero-cache-icon-btn hero-cache-icon-btn-analyze ${activePage === "cache" ? "is-active" : ""}`}
                      onClick={onToggleAnalyzePage}
                      title={activePage === "cache" ? "Back to chat" : "Open cache analyze"}
                      aria-label={activePage === "cache" ? "Back to chat" : "Open cache analyze"}
                    >
                      <AnalyzeCacheIcon />
                    </button>
                    <button
                      type="button"
                      className={`hero-cache-icon-btn hero-cache-icon-btn-db ${activePage === "schema" ? "is-active" : ""}`}
                      onClick={onOpenInspectDialog}
                      title="Inspect DB schema tables/columns/joins"
                      aria-label="Inspect DB schema tables columns joins"
                    >
                      <InspectDbIcon />
                    </button>
                  </div>
                </div>
                <p>Structured AI. Predictable Intelligence.</p>
              </div>
            </div>

            <div className="top-center-status" aria-live="polite">
              {activePage === "chat" ? (
                <>
                  {engineIntent ? <span className="hero-chip hero-chip-intent">intent: {engineIntent}</span> : null}
                  {engineState ? <span className="hero-chip hero-chip-state">state: {engineState}</span> : null}
                  {turnLatencyMs !== null ? <span className="hero-chip hero-chip-timing">time: {formatTurnLatency(turnLatencyMs)}</span> : null}
                </>
              ) : (
                <span className="hero-chip hero-chip-state">
                  {activePage === "cache" ? "cache diagnostics" : "db schema inspect"}
                </span>
              )}
              {cacheRefreshMessage ? <span className="hero-chip hero-chip-intent">{cacheRefreshMessage}</span> : null}
            </div>

            <div className="top-actions">
              <button
                type="button"
                className={themeMode === "light" ? "hero-theme-toggle moon" : "hero-theme-toggle sun"}
                onClick={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
                aria-label={themeMode === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
                title={themeMode === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              >
                {themeMode === "light" ? "◐" : "☀"}
              </button>

              <button
                type="button"
                className="audit-toggle"
                onClick={() => setAuditOpen(true)}
                title="Open Audit Timeline"
                aria-label="Open Audit Timeline"
                style={{ display: auditOpen ? "none" : "inline-flex" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M8 7H18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M8 12H18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M8 17H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="5" cy="7" r="1.2" fill="currentColor" />
                  <circle cx="5" cy="12" r="1.2" fill="currentColor" />
                  <circle cx="5" cy="17" r="1.2" fill="currentColor" />
                </svg>
              </button>
            </div>
          </header>

          {activePage === "chat" ? (
            <ChatPanel
              conversationId={conversationId}
              onAuditUpdate={() => setAuditVersion((v) => v + 1)}
              onEngineStatusUpdate={onEngineStatusUpdate}
              onTurnTimingUpdate={onTurnTimingUpdate}
              progressText={liveProgressText}
            />
          ) : activePage === "cache" ? (
            <CacheAnalyzePage />
          ) : (
            <DbSchemaInspectPage
              query={inspectQuery}
              onOpenRunDialog={onOpenInspectDialog}
            />
          )}
        </main>
      </div>

      {inspectOpen ? (
        <div className="ce-modal-overlay" role="dialog" aria-modal="true">
          <div className="ce-modal">
            <h3>Inspect DB Schema</h3>
            <p>Enter table pattern or exact table name, choose match mode, then run inspection.</p>
            <label>
              Name
              <input value={inspectPrefix} onChange={(e) => setInspectPrefix(e.target.value)} placeholder="any table name or table name substring" />
            </label>
            <label>
              Match
              <select value={inspectMatchMode} onChange={(e) => setInspectMatchMode(e.target.value)}>
                <option value="REGEX">REGEX</option>
                <option value="EXACT">EXACT</option>
              </select>
            </label>
            <label>
              Schema
              <input value={inspectSchema} onChange={(e) => setInspectSchema(e.target.value)} placeholder="(optional) uses convengine.schema.active" />
            </label>
            <div className="ce-modal-actions">
              <button type="button" className="cache-analyze-load" onClick={onRunInspect}>Run</button>
              <button type="button" className="cache-analyze-load cache-analyze-secondary" onClick={() => setInspectOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
