import { useEffect, useMemo, useRef, useState } from "react";
import { sendMessage } from "../api/convengine.api.js";

function stringifyPayload(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function safeParseJson(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findFieldDeep(obj, field, depth = 0) {
  if (!obj || depth > 6) return "";
  if (typeof obj !== "object") return "";

  if (typeof obj[field] === "string" && obj[field].trim()) {
    return obj[field].trim();
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findFieldDeep(value, field, depth + 1);
      if (found) return found;
    }

    if (typeof value === "string" && value.trim().startsWith("{")) {
      const parsed = safeParseJson(value);
      if (parsed && typeof parsed === "object") {
        const found = findFieldDeep(parsed, field, depth + 1);
        if (found) return found;
      }
    }
  }

  return "";
}

function extractEngineStatus(response) {
  const intent = findFieldDeep(response, "intent");
  const state = findFieldDeep(response, "state");
  return { intent, state };
}

function UserGlyph() {
  return (
    <svg className="chat-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    </svg>
  );
}

function AgentGlyph() {
  return (
    <svg className="chat-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
      <path d="M12 2v2" />
      <path d="M9 12v9" />
      <path d="M15 12v9" />
      <path d="M5 16l4 -2" />
      <path d="M15 14l4 2" />
      <path d="M9 18h6" />
      <path d="M10 8v.01" />
      <path d="M14 8v.01" />
    </svg>
  );
}

function bubbleShapeClass(text) {
  const value = typeof text === "string" ? text : String(text ?? "");
  if (value.includes("\n") || value.length > 140) return "chat-bubble-rect";
  return "chat-bubble-pill";
}

function isAssistantErrorBubble(bubble) {
  if (!bubble || bubble.role !== "assistant") return false;
  const text = typeof bubble.text === "string" ? bubble.text : String(bubble.text ?? "");
  return text.trim().startsWith("Error:");
}

export default function ChatPanel({ conversationId, onAuditUpdate, onEngineStatusUpdate, onTurnTimingUpdate, progressText = "" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  const isInitial = useMemo(() => messages.length === 0 && !isTyping, [messages.length, isTyping]);
  const isMultiLine = input.includes("\n") || input.length > 90;

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, progressText]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input, isInitial]);

  async function handleSend() {
    const userText = input.trim();
    if (!userText || isTyping) return;
    const turnStartedAt = performance.now();
    onTurnTimingUpdate?.(null);

    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: userText }]);
    setIsTyping(true);

    try {
      const res = await sendMessage(conversationId, userText);
      const assistantText = stringifyPayload(res?.payload?.value ?? res?.payload ?? "");
      const status = extractEngineStatus(res);
      onEngineStatusUpdate?.(status);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: assistantText }]);
      onTurnTimingUpdate?.(Math.max(0, Math.round(performance.now() - turnStartedAt)));
      onAuditUpdate?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: `Error: ${message}` }]);
      onTurnTimingUpdate?.(Math.max(0, Math.round(performance.now() - turnStartedAt)));
    } finally {
      setIsTyping(false);
    }
  }

  const onEnter = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    handleSend();
  };

  return (
    <section className={`chat-root ${isInitial ? "chat-root-initial" : ""}`}>
      {isInitial ? (
        <div className="chat-landing">
          <h2 className="chat-landing-title">How can I help you today?</h2>
          <div className={`chat-composer chat-composer-center ${isMultiLine ? "chat-composer-multiline" : ""}`}>
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onEnter}
              placeholder="Ask ConvEngine"
              disabled={isTyping}
              rows={1}
            />
            <button type="button" className="chat-send" onClick={handleSend} disabled={isTyping || !input.trim()} title="Send Message" aria-label="Send Message">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 20L21 12L3 4L3 10L15 12L3 14L3 20Z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={threadRef} className="chat-thread">
            {messages.map((bubble) => (
              <article
                key={bubble.id}
                className={`chat-message ${bubble.role === "user" ? "chat-message-user" : "chat-message-left"} ${isAssistantErrorBubble(bubble) ? "chat-message-error" : ""}`}
              >
                <div className={`chat-avatar ${bubble.role === "user" ? "chat-avatar-user" : "chat-avatar-assistant"} ${isAssistantErrorBubble(bubble) ? "chat-avatar-error" : ""}`}>
                  {bubble.role === "user" ? <UserGlyph /> : <AgentGlyph />}
                  {isAssistantErrorBubble(bubble) && <span className="chat-error-avatar-badge" aria-hidden="true">!</span>}
                </div>
                <div className="chat-content">
                  <div
                    className={`chat-bubble ${bubbleShapeClass(bubble.text)} ${bubble.role === "user" ? "chat-bubble-user" : "chat-bubble-agent"} ${isAssistantErrorBubble(bubble) ? "chat-bubble-error" : ""}`}
                  >
                    <pre className="chat-text">
                      {isAssistantErrorBubble(bubble) && <span className="chat-error-prefix" aria-hidden="true">!</span>}
                      {bubble.text}
                    </pre>
                  </div>
                </div>
              </article>
            ))}

            {isTyping && (
              <article className="chat-message chat-message-left" aria-live="polite">
                <div className="chat-avatar chat-avatar-assistant chat-avatar-thinking">
                  <AgentGlyph />
                </div>
                <div className="chat-content chat-thinking">
                  <div className="chat-thinking-strip">
                    <span className="chat-thinking-text">{progressText && progressText.trim() ? progressText : "Agent is thinking"}</span>
                  </div>
                </div>
              </article>
            )}
          </div>

          <footer className="chat-composer-wrap">
            <div className={`chat-composer ${isMultiLine ? "chat-composer-multiline" : ""}`}>
              <textarea
                ref={inputRef}
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Ask ConvEngine"
                disabled={isTyping}
                rows={1}
              />
              <button type="button" className="chat-send" onClick={handleSend} disabled={isTyping || !input.trim()} title="Send Message" aria-label="Send Message">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 20L21 12L3 4L3 10L15 12L3 14L3 20Z" fill="currentColor" />
                </svg>
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
