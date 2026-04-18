import { AgentGlyph } from "./ChatIcons.jsx";

export function ChatTypingIndicator({ progressText }) {
  return (
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
  );
}
