import { useEffect, useRef, useState } from "react";
import { fetchAudits, refreshCaches, refreshSemanticEmbeddingCatalog, subscribeConversation } from "./api/convengine.api.js";
import { createClientId } from "./lib/uuid.js";
import { AgentBuilderModal } from "./components/app/components/AgentBuilderModal.jsx";
import { AuditDrawer } from "./components/app/components/AuditDrawer.jsx";
import { InspectModal } from "./components/app/components/InspectModal.jsx";
import { PageContent } from "./components/app/components/PageContent.jsx";
import { TopNav } from "./components/app/components/TopNav.jsx";
import { assetUrl } from "./components/app/utils/assets.js";
import { extractVerboseText, resolveStage } from "./components/app/utils/progress.js";

const DEFAULT_AUDIT_WIDTH = 460;
const MIN_PROGRESS_VISIBLE_MS = 9000;

export default function App() {
  const [conversationId] = useState(() => createClientId());
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
  const [inspectTargetPage, setInspectTargetPage] = useState("schema");
  const [agentBuilderOpen, setAgentBuilderOpen] = useState(false);
  const [agentBuilderType, setAgentBuilderType] = useState("convengine");
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
      onError: () => { },
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
      const [cacheResult, embeddingResult] = await Promise.allSettled([
        refreshCaches(),
        refreshSemanticEmbeddingCatalog({ onlyMissing: true, limit: 300 }),
      ]);

      const parts = [];
      if (cacheResult.status === "fulfilled") {
        parts.push(cacheResult.value || "Cache refresh completed");
      } else {
        parts.push(cacheResult.reason instanceof Error ? cacheResult.reason.message : "Cache refresh failed");
      }

      if (embeddingResult.status === "fulfilled") {
        const stats = embeddingResult.value || {};
        parts.push(
          `Embedding catalog refreshed (candidates=${stats.candidateCount ?? 0}, indexed=${stats.indexedCount ?? 0}, failed=${stats.failedCount ?? 0})`
        );
      } else {
        parts.push(embeddingResult.reason instanceof Error ? embeddingResult.reason.message : "Embedding catalog refresh failed");
      }
      setCacheRefreshMessage(parts.join(" | "));
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

  const onOpenChat = () => {
    setActivePage("chat");
  };

  const onOpenInspectDialog = () => {
    setInspectTargetPage("schema");
    setInspectOpen(true);
  };

  const onOpenSemanticLayerBuilder = () => {
    setInspectTargetPage("semantic_builder");
    setInspectOpen(true);
  };

  const onOpenSemanticDebug = () => {
    setActivePage("semantic_debug");
  };

  const onOpenPdfExtract = () => {
    setActivePage("pdf_extract");
  };

  const onOpenCeBuilder = () => {
    setAgentBuilderType("convengine");
    setAgentBuilderOpen(true);
  };

  const onBuildAgentBuilder = () => {
    setAgentBuilderOpen(false);
    if (agentBuilderType === "convengine") {
      setActivePage("ce_builder");
      return;
    }
    if (agentBuilderType === "agents") {
      setActivePage("agent_builder");
      return;
    }
  };

  const onCancelAgentBuilder = () => {
    setAgentBuilderOpen(false);
  };

  const onRunInspect = () => {
    setInspectQuery({ prefix: inspectPrefix, schema: inspectSchema, matchMode: inspectMatchMode });
    setInspectOpen(false);
    setActivePage(inspectTargetPage === "semantic_builder" ? "semantic_builder" : "schema");
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

  const turnLatencyText = turnLatencyMs !== null ? formatTurnLatency(turnLatencyMs) : "";

  return (
    <>
      <AuditDrawer
        conversationId={conversationId}
        auditOpen={auditOpen}
        auditResizing={auditResizing}
        auditDrawerWidth={auditDrawerWidth}
        onAuditResizeMouseDown={onAuditResizeMouseDown}
        onAuditResizeDoubleClick={onAuditResizeDoubleClick}
        copiedConvId={copiedConvId}
        onCopyConversationId={onCopyConversationId}
        onClose={() => setAuditOpen(false)}
        auditEvents={auditEvents}
        auditLoading={auditLoading}
        auditError={auditError}
      />

      <div className="app-shell">
        <main className="main-chat-layout">
          <TopNav
            activePage={activePage}
            cacheRefreshLoading={cacheRefreshLoading}
            cacheRefreshMessage={cacheRefreshMessage}
            onOpenChat={onOpenChat}
            onCacheRefresh={onCacheRefresh}
            onToggleAnalyzePage={onToggleAnalyzePage}
            onOpenInspectDialog={onOpenInspectDialog}
            onOpenSemanticLayerBuilder={onOpenSemanticLayerBuilder}
            onOpenSemanticDebug={onOpenSemanticDebug}
            onOpenPdfExtract={onOpenPdfExtract}
            onOpenCeBuilder={onOpenCeBuilder}
            engineIntent={engineIntent}
            engineState={engineState}
            turnLatencyText={turnLatencyText}
            themeMode={themeMode}
            onToggleTheme={() => setThemeMode((prev) => (prev === "light" ? "dark" : "light"))}
            auditOpen={auditOpen}
            onOpenAudit={() => setAuditOpen(true)}
            assetUrl={assetUrl}
          />

          <PageContent
            activePage={activePage}
            conversationId={conversationId}
            onAuditUpdate={() => setAuditVersion((v) => v + 1)}
            onEngineStatusUpdate={onEngineStatusUpdate}
            onTurnTimingUpdate={onTurnTimingUpdate}
            liveProgressText={liveProgressText}
            inspectQuery={inspectQuery}
            onOpenInspectDialog={onOpenInspectDialog}
          />
        </main>
      </div>

      <InspectModal
        open={inspectOpen}
        inspectPrefix={inspectPrefix}
        inspectSchema={inspectSchema}
        inspectMatchMode={inspectMatchMode}
        inspectTargetPage={inspectTargetPage}
        onPrefixChange={setInspectPrefix}
        onSchemaChange={setInspectSchema}
        onMatchModeChange={setInspectMatchMode}
        onRun={onRunInspect}
        onCancel={() => setInspectOpen(false)}
      />
      <AgentBuilderModal
        open={agentBuilderOpen}
        builderType={agentBuilderType}
        onBuilderTypeChange={setAgentBuilderType}
        onBuild={onBuildAgentBuilder}
        onCancel={onCancelAgentBuilder}
      />
    </>
  );
}
