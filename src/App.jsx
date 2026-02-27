import { useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import AuditTimeline from "./components/AuditTimeline";
import { fetchAudits, subscribeConversation } from "./api/convengine.api.js";

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

export default function App() {
  const [conversationId] = useState(crypto.randomUUID());
  const [auditVersion, setAuditVersion] = useState(0);
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("convengine_ui_theme") === "dark" ? "dark" : "light";
  });
  const [engineIntent, setEngineIntent] = useState("");
  const [engineState, setEngineState] = useState("");
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
              title={copiedConvId ? "Conversation id copied" : "Copy conversation id"}
              aria-label={copiedConvId ? "Copied" : "Copy"}
            >
              {copiedConvId ? "✓" : "⎘"}
            </button>
            <button type="button" className="audit-icon-btn audit-close" onClick={() => setAuditOpen(false)} title="Hide audit panel" aria-label="Close audit">✕</button>
          </div>
        </div>
        <AuditTimeline audits={auditEvents} loading={auditLoading} error={auditError} />
      </aside>

      <div className="app-shell">
        <main className="main-chat-layout">
          <header className="top-nav">
            <div className="brand-wrap">
              <span className="brand-icon" aria-hidden="true">
                <img
                  src={themeMode === "dark" ? "/logo-dark.png" : "/logo-light.png"}
                  alt="ConvEngine"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/conv.svg";
                  }}
                />
              </span>
              <div className="brand-copy">
                <h1>ConvEngine</h1>
                <p>Structured AI. Predictable Intelligence.</p>
              </div>
            </div>

            <div className="top-center-status" aria-live="polite">
              {engineIntent ? <span className="hero-chip hero-chip-intent">intent: {engineIntent}</span> : null}
              {engineState ? <span className="hero-chip hero-chip-state">state: {engineState}</span> : null}
            </div>

            <div className="top-actions">
              <button
                type="button"
                className={themeMode === "light" ? "hero-theme-toggle moon" : "hero-theme-toggle sun"}
                onClick={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
                aria-label={themeMode === "light" ? "Switch to dark mode" : "Switch to light mode"}
                title={themeMode === "light" ? "Dark mode" : "Light mode"}
              >
                {themeMode === "light" ? "◐" : "☀"}
              </button>

              <button
                type="button"
                className="audit-toggle"
                onClick={() => setAuditOpen(true)}
                title="Show audit panel"
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

          <ChatPanel
            conversationId={conversationId}
            onAuditUpdate={() => setAuditVersion((v) => v + 1)}
            onEngineStatusUpdate={onEngineStatusUpdate}
            progressText={liveProgressText}
          />
        </main>
      </div>
    </>
  );
}
