import { useEffect, useMemo, useRef, useState } from "react";
import { sendMessage, submitConversationFeedback } from "../../api/convengine.api.js";
import { createClientId } from "../../lib/uuid.js";
import { ChatArea } from "./components/ChatArea.jsx";
import { ChatFooter } from "./components/ChatFooter.jsx";
import { containsMarkdownTable } from "./utils/assistantContent.jsx";
import { extractEngineStatus, stringifyPayload } from "./utils/messagePayload.js";

export default function ChatPanel({ conversationId, onAuditUpdate, onEngineStatusUpdate, onTurnTimingUpdate, progressText = "" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  const isInitial = useMemo(() => messages.length === 0 && !isTyping, [messages.length, isTyping]);
  const normalizedInput = input.replace(/\s+$/g, "");
  const isMultiLine = normalizedInput.length > 0 && (normalizedInput.includes("\n") || normalizedInput.length > 90);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, progressText]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!input.trim()) {
      el.style.height = "";
      return;
    }
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input, isInitial]);

  async function handleSend() {
    const userText = input.trim();
    if (!userText || isTyping) return;
    const turnStartedAt = performance.now();
    onTurnTimingUpdate?.(null);

    setInput("");
    setMessages((m) => [...m, { id: createClientId(), role: "user", text: userText }]);
    setIsTyping(true);

    try {
      const res = await sendMessage(conversationId, userText);
      const assistantText = stringifyPayload(res?.payload?.value ?? res?.payload ?? "");
      const status = extractEngineStatus(res);
      onEngineStatusUpdate?.(status);
      setMessages((m) => [...m, {
        id: createClientId(),
        role: "assistant",
        text: assistantText,
        feedback: null,
        feedbackBusy: false,
      }]);
      onTurnTimingUpdate?.(Math.max(0, Math.round(performance.now() - turnStartedAt)));
      onAuditUpdate?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setMessages((m) => [...m, { id: createClientId(), role: "assistant", text: `Error: ${message}` }]);
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

  async function handleFeedback(messageId, feedbackType) {
    if (!messageId || !feedbackType) return;
    let selectedMessage = null;
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      selectedMessage = msg;
      return { ...msg, feedbackBusy: true };
    }));
    if (!selectedMessage) return;

    try {
      await submitConversationFeedback({
        conversationId,
        feedbackType,
        messageId: selectedMessage.id,
        assistantResponse: selectedMessage.text,
        metadata: {
          role: selectedMessage.role,
          hasMarkdownTable: containsMarkdownTable(selectedMessage.text),
        },
      });
      setMessages((prev) => prev.map((msg) => (
        msg.id === messageId
          ? { ...msg, feedback: feedbackType, feedbackBusy: false }
          : msg
      )));
    } catch {
      setMessages((prev) => prev.map((msg) => (
        msg.id === messageId ? { ...msg, feedbackBusy: false } : msg
      )));
    }
  }

  return (
    <section className={`chat-root ${isInitial ? "chat-root-initial" : ""}`}>
      <ChatArea
        isInitial={isInitial}
        input={input}
        isTyping={isTyping}
        isMultiLine={isMultiLine}
        inputRef={inputRef}
        onInputChange={setInput}
        onEnter={onEnter}
        onSend={handleSend}
        threadRef={threadRef}
        messages={messages}
        progressText={progressText}
        onFeedback={handleFeedback}
      />

      {!isInitial && (
        <ChatFooter
          inputRef={inputRef}
          input={input}
          isTyping={isTyping}
          isMultiLine={isMultiLine}
          onInputChange={setInput}
          onEnter={onEnter}
          onSend={handleSend}
        />
      )}
    </section>
  );
}
