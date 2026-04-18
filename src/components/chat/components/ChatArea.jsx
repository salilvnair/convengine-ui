import { ChatLanding } from "./ChatLanding.jsx";
import { ChatThread } from "./ChatThread.jsx";

export function ChatArea({
  isInitial,
  input,
  isTyping,
  isMultiLine,
  inputRef,
  onInputChange,
  onEnter,
  onSend,
  threadRef,
  messages,
  progressText,
  onFeedback,
}) {
  if (isInitial) {
    return (
      <ChatLanding
        input={input}
        isTyping={isTyping}
        isMultiLine={isMultiLine}
        inputRef={inputRef}
        onInputChange={onInputChange}
        onEnter={onEnter}
        onSend={onSend}
      />
    );
  }

  return (
    <ChatThread
      threadRef={threadRef}
      messages={messages}
      isTyping={isTyping}
      progressText={progressText}
      onFeedback={onFeedback}
    />
  );
}
