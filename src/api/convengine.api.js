const API_BASE = "http://localhost:8080/api/v1/conversation";
const CACHE_BASE = "http://localhost:8080/api/v1/cache";
const WS_BASE = "http://localhost:8080";

const STREAM_STAGE_EVENTS = [
  "CONNECTED",
  "USER_INPUT",
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
