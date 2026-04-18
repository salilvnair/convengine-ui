import { ChatComposer } from "./ChatComposer.jsx";

export function ChatFooter({ inputRef, input, isTyping, isMultiLine, onInputChange, onEnter, onSend }) {
  return (
    <footer className="chat-composer-wrap">
      <ChatComposer
        inputRef={inputRef}
        input={input}
        isTyping={isTyping}
        isMultiLine={isMultiLine}
        onInputChange={onInputChange}
        onEnter={onEnter}
        onSend={onSend}
      />
    </footer>
  );
}
