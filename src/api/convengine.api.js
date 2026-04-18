function normalizeHost(rawValue, fallbackValue) {
  const chosen = rawValue && String(rawValue).trim() ? String(rawValue).trim() : fallbackValue;
  return chosen.replace(/\/+$/, "");
}

const DEFAULT_API_HOST = import.meta.env.DEV ? "http://localhost:8080" : "/convengine";
const API_HOST = normalizeHost(import.meta.env.VITE_CONVENGINE_API_HOST, DEFAULT_API_HOST);
const API_BASE = `${API_HOST}/api/v1/conversation`;
const CACHE_BASE = `${API_HOST}/api/v1/cache`;
const DB_BASE = `${API_HOST}/api/v1/db`;
const WS_BASE = API_HOST;

const STREAM_STAGE_EVENTS = [
  "CONNECTED",
  "USER_INPUT",
  "DIALOGUE_ACT_LLM_INPUT",
  "DIALOGUE_ACT_LLM_OUTPUT",
  "STEP_ENTER",
  "STEP_EXIT",
  "STEP_ERROR",
  "ASSISTANT_OUTPUT",
  "ENGINE_RETURN",
  "MCP_TOOL_CALL",
  "MCP_TOOL_RESULT",
  "MCP_TOOL_ERROR",
  "MCP_FINAL_ANSWER",
  "TOOL_ORCHESTRATION_REQUEST",
  "TOOL_ORCHESTRATION_RESULT",
  "TOOL_ORCHESTRATION_ERROR",
  "RULE_MATCH",
  "RULE_APPLIED",
  "RULE_NO_MATCH",
  "PENDING_ACTION_EXECUTED",
  "PENDING_ACTION_REJECTED",
  "PENDING_ACTION_FAILED",
  "CORRECTION_STEP_RETRY_REQUESTED",
  "POLICY_BLOCK",
  "VERBOSE",
];

function toBool(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function streamTransport() {
  return String(import.meta.env.VITE_CONVENGINE_STREAM_TRANSPORT || "sse")
    .trim()
    .toLowerCase();
}

function noOpSubscription() {
  return {
    close() {},
  };
}

export function getConvEngineRuntimeConfig() {
  return {
    streamEnabled: toBool(import.meta.env.VITE_CONVENGINE_STREAM_ENABLED, true),
    streamTransport: streamTransport(), // sse | stomp
  };
}

export async function sendMessage(conversationId, message, inputParams = {}, reset = false) {
  const res = await fetch(`${API_BASE}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversationId,
      message,
      reset,
      inputParams,
    }),
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}

export async function submitConversationFeedback(payload = {}) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}

export async function fetchAudits(conversationId) {
  const res = await fetch(`${API_BASE}/audit/${conversationId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}

export async function fetchAuditTrace(conversationId) {
  const res = await fetch(`${API_BASE}/audit/${conversationId}/trace`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}

export async function refreshCaches() {
  const res = await fetch(`${CACHE_BASE}/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.text();
}

export async function refreshSemanticEmbeddingCatalog(payload = {}) {
  const res = await fetch(`${DB_BASE}/semantic/embeddings/catalog/rebuild`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}

export async function analyzeCaches(warmup = true) {
  const res = await fetch(`${CACHE_BASE}/analyze?warmup=${warmup ? "true" : "false"}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  return res.json();
}

export async function inspectDbSchema(prefix = "", schema = "", matchMode = "REGEX") {
  const q = new URLSearchParams();
  q.set("prefix", prefix || "");
  q.set("matchMode", String(matchMode || "REGEX").toUpperCase());
  if (schema && String(schema).trim()) {
    q.set("schema", String(schema).trim());
  }
  const res = await fetch(`${DB_BASE}/inspect-schema?${q.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

export async function generateDbSchemaSeed(payload) {
  const res = await fetch(`${DB_BASE}/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

export async function generateSemanticModelDraft(payload) {
  const res = await fetch(`${DB_BASE}/semantic-query/generate-model`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

export async function validateSemanticModel(payload) {
  const res = await fetch(`${DB_BASE}/semantic-query/validate-model`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

export async function saveSemanticModel(payload) {
  const res = await fetch(`${DB_BASE}/semantic-query/save-model`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

export async function reloadSemanticModel(payload) {
  const res = await fetch(`${DB_BASE}/semantic-query/reload-model`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

export async function extractPdfWithPapermind(file) {
  if (!(file instanceof File)) {
    throw new Error("A valid PDF file is required.");
  }
  const base = String(import.meta.env.VITE_PAPERMIND_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
  const endpoint = `${base}/extract/pdf`;
  const formData = new FormData();
  formData.append("file", file, file.name || "document.pdf");

  const res = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `PDF extraction failed with status ${res.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function fetchCurrentSemanticModelYaml() {
  const res = await fetch(`${DB_BASE}/semantic-query/current-model-yaml`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

export async function fetchSemanticModelStudioConfig() {
  const res = await fetch(`${DB_BASE}/semantic-query/studio-config`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }
  return res.json();
}

// Semantic debug REST wrappers — point at the new /api/v1/semantic facade that
// runs the interpret/compile/execute stages directly, bypassing the 27-step
// ConvEngine pipeline. Replaces the old /semantic-query/debug-analyze stream.
const SEMANTIC_DEBUG_BASE = "http://localhost:8080/api/v1/semantic";

async function semanticPost(path, body) {
  const res = await fetch(`${SEMANTIC_DEBUG_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    throw new Error(`Semantic debug ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function runSemanticDebug({ question, mode = "llm", execute = false } = {}) {
  return semanticPost("/run", { question, mode, execute });
}

export function interpretSemantic({ question, mode = "llm", context, hints } = {}) {
  return semanticPost("/interpret", { question, mode, context, hints });
}

export function compileSemantic({ question, canonicalIntent } = {}) {
  return semanticPost("/compile", { question, canonicalIntent });
}

export function executeSemanticSql({ sql, params } = {}) {
  return semanticPost("/execute", { sql, params });
}

// SSE live stream of the semantic debug pipeline. Emits `stage` events
// (INTERPRET/COMPILE/EXECUTE with phase start|done|error) and terminates with
// a `done` event carrying the aggregated payload (same shape as /run).
export function streamSemanticDebug({ question, mode = "llm", execute = false } = {}, handlers = {}) {
  const qs = new URLSearchParams({
    question: String(question || ""),
    mode: String(mode || "llm"),
    execute: String(Boolean(execute)),
  });
  const source = new EventSource(`${SEMANTIC_DEBUG_BASE}/run/stream?${qs.toString()}`);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
    handlers.onClose?.();
  };
  source.addEventListener("stage", (e) => {
    try { handlers.onStage?.(JSON.parse(e.data)); } catch { /* ignore */ }
  });
  source.addEventListener("done", (e) => {
    try { handlers.onDone?.(JSON.parse(e.data)); } catch { handlers.onDone?.(null); }
    close();
  });
  source.addEventListener("error", (e) => {
    let msg = "stream error";
    try { msg = JSON.parse(e.data)?.message || msg; } catch { /* ignore */ }
    handlers.onError?.(new Error(msg));
  });
  source.onerror = () => {
    if (!closed) handlers.onError?.(new Error("SSE connection error"));
  };
  return { close };
}

export function subscribeConversationSse(conversationId, handlers = {}) {
  const streamUrl = `${API_BASE}/stream/${conversationId}`;
  const source = new EventSource(streamUrl);

  source.onopen = () => {
    handlers.onConnected?.();
  };

  source.onmessage = (event) => {
    try {
      const parsed = event.data ? JSON.parse(event.data) : null;
      handlers.onEvent?.({ stage: "MESSAGE", data: parsed, raw: event });
    }
    catch {
      handlers.onEvent?.({ stage: "MESSAGE", data: null, raw: event });
    }
  };

  STREAM_STAGE_EVENTS.forEach((stage) => {
    source.addEventListener(stage, (event) => {
      try {
        const parsed = event.data ? JSON.parse(event.data) : null;
        handlers.onEvent?.({ stage, data: parsed, raw: event });
      }
      catch {
        handlers.onEvent?.({ stage, data: null, raw: event });
      }
    });
  });

  source.onerror = (error) => {
    handlers.onError?.(error);
  };

  return {
    close() {
      source.close();
      handlers.onClosed?.();
    },
  };
}

export function subscribeConversationStomp(conversationId, handlers = {}) {
  const stompClientCtor = globalThis?.StompJs?.Client;
  const sockJsCtor = globalThis?.SockJS;

  if (!stompClientCtor || !sockJsCtor) {
    console.warn(
      "STOMP selected but StompJs/SockJS is missing. " +
      "Install @stomp/stompjs + sockjs-client and expose them (or switch to SSE/direct mode)."
    );
    handlers.onError?.(new Event("stomp_not_available"));
    return noOpSubscription();
  }

  const client = new stompClientCtor({
    webSocketFactory: () => new sockJsCtor(`${WS_BASE}/ws-convengine`),
    reconnectDelay: 5000,
    onConnect: () => {
      handlers.onConnected?.();
      client.subscribe(`/topic/convengine/audit/${conversationId}`, (msg) => {
        try {
          const parsed = msg.body ? JSON.parse(msg.body) : null;
          handlers.onEvent?.({ stage: parsed?.stage || "MESSAGE", data: parsed, raw: msg });
        }
        catch {
          handlers.onEvent?.({ stage: "MESSAGE", data: msg.body, raw: msg });
        }
      });
    },
    onStompError: (frame) => handlers.onError?.(frame),
    onWebSocketError: (error) => handlers.onError?.(error),
  });

  client.activate();
  return {
    close() {
      client.deactivate();
      handlers.onClosed?.();
    },
  };
}

export function subscribeConversation(conversationId, handlers = {}) {
  const config = getConvEngineRuntimeConfig();
  if (!config.streamEnabled) {
    return noOpSubscription();
  }
  if (config.streamTransport === "stomp") {
    return subscribeConversationStomp(conversationId, handlers);
  }
  return subscribeConversationSse(conversationId, handlers);
}
