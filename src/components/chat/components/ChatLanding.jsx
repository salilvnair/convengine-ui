import { ChatHeader } from "./ChatHeader.jsx";
import { ChatComposer } from "./ChatComposer.jsx";

export function ChatLanding({
  input,
  isTyping,
  isMultiLine,
  inputRef,
  onInputChange,
  onEnter,
  onSend,
}) {
  return (
    <div className="chat-landing">
      <ChatHeader title="How can I help you today?" />
      <ChatComposer
        centered
        inputRef={inputRef}
        input={input}
        isTyping={isTyping}
        isMultiLine={isMultiLine}
        onInputChange={onInputChange}
        onEnter={onEnter}
        onSend={onSend}
      />
    </div>
  );
}
