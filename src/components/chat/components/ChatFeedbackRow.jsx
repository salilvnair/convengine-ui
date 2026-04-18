import { ThumbDownGlyph, ThumbUpGlyph } from "./ChatIcons.jsx";

export function ChatFeedbackRow({ bubble, hasMarkdownTable, onFeedback }) {
  return (
    <div className={`chat-feedback-row ${hasMarkdownTable ? "chat-feedback-row-table" : ""}`}>
      <div className="chat-feedback-actions" role="group" aria-label="Message feedback">
        <button
          type="button"
          className={`chat-feedback-btn chat-feedback-up ${bubble.feedback === "THUMBS_UP" ? "is-selected" : ""}`}
          title="Mark response as helpful"
          aria-label="Thumbs up"
          disabled={bubble.feedbackBusy}
          onClick={() => onFeedback(bubble.id, "THUMBS_UP")}
        >
          <ThumbUpGlyph />
        </button>
        <button
          type="button"
          className={`chat-feedback-btn chat-feedback-down ${bubble.feedback === "THUMBS_DOWN" ? "is-selected" : ""}`}
          title="Mark response as not helpful"
          aria-label="Thumbs down"
          disabled={bubble.feedbackBusy}
          onClick={() => onFeedback(bubble.id, "THUMBS_DOWN")}
        >
          <ThumbDownGlyph />
        </button>
      </div>
    </div>
  );
}
