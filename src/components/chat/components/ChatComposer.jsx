export function ChatComposer({ inputRef, input, isTyping, isMultiLine, onInputChange, onEnter, onSend, centered = false }) {
  const composerClassName = centered
    ? `chat-composer chat-composer-center ${isMultiLine ? "chat-composer-multiline" : ""}`
    : `chat-composer ${isMultiLine ? "chat-composer-multiline" : ""}`;

  return (
    <div className={composerClassName}>
      <textarea
        ref={inputRef}
        className="chat-input"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onEnter}
        placeholder="Ask ConvEngine"
        disabled={isTyping}
        rows={1}
      />
      <button type="button" className="chat-send" onClick={onSend} disabled={isTyping || !input.trim()} title="Send Message" aria-label="Send Message">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 20L21 12L3 4L3 10L15 12L3 14L3 20Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
