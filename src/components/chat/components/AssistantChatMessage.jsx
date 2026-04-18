/* eslint-disable react-refresh/only-export-components */
import { AgentGlyph } from "./ChatIcons.jsx";
import { bubbleShapeClass, isAssistantErrorBubble } from "../utils/messageBubble.js";
import { containsMarkdownTable } from "../utils/assistantContent.jsx";
import { resolveAssistantRenderer } from "../renderers/core/assistantRendererRegistry.jsx";

export function AssistantChatMessage({ bubble }) {
  const isError = isAssistantErrorBubble(bubble);
  const resolvedRenderer = !isError ? resolveAssistantRenderer(bubble.text) : null;
  const hasMarkdownTable = !isError && resolvedRenderer?.key === "default" && containsMarkdownTable(bubble.text);
  const Renderer = resolvedRenderer?.Component;

  return (
    <article className={`chat-message chat-message-left ${isError ? "chat-message-error" : ""} ${hasMarkdownTable ? "chat-message-table" : ""}`}>
      <div className={`chat-avatar chat-avatar-assistant ${isError ? "chat-avatar-error" : ""}`}>
        <AgentGlyph />
        {isError && <span className="chat-error-avatar-badge" aria-hidden="true">!</span>}
      </div>
      <div className="chat-content">
        <div className={`chat-bubble ${bubbleShapeClass(bubble.text)} chat-bubble-agent ${isError ? "chat-bubble-error" : ""}`}>
          {!isError ? (
            <Renderer payload={resolvedRenderer.payload} />
          ) : (
            <pre className="chat-text">
              <span className="chat-error-prefix" aria-hidden="true">!</span>
              {bubble.text}
            </pre>
          )}
        </div>
      </div>
    </article>
  );
}

export function shouldShowAssistantFeedback(bubble) {
  return bubble.role === "assistant" && !isAssistantErrorBubble(bubble);
}

export function hasAssistantMarkdownTable(bubble) {
  if (bubble.role !== "assistant" || isAssistantErrorBubble(bubble)) return false;
  const resolvedRenderer = resolveAssistantRenderer(bubble.text);
  return resolvedRenderer.key === "default" && containsMarkdownTable(bubble.text);
}
