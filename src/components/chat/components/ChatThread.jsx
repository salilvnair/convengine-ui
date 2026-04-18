import { Fragment } from "react";
import { UserChatMessage } from "./UserChatMessage.jsx";
import { AssistantChatMessage, hasAssistantMarkdownTable, shouldShowAssistantFeedback } from "./AssistantChatMessage.jsx";
import { ChatFeedbackRow } from "./ChatFeedbackRow.jsx";
import { ChatTypingIndicator } from "./ChatTypingIndicator.jsx";

export function ChatThread({ threadRef, messages, isTyping, progressText, onFeedback }) {
  return (
    <div ref={threadRef} className="chat-thread">
      {messages.map((bubble) => {
        const hasMarkdownTable = hasAssistantMarkdownTable(bubble);
        const showFeedback = shouldShowAssistantFeedback(bubble);

        return (
          <Fragment key={bubble.id}>
            {bubble.role === "user" ? <UserChatMessage bubble={bubble} /> : <AssistantChatMessage bubble={bubble} />}
            {showFeedback && <ChatFeedbackRow bubble={bubble} hasMarkdownTable={hasMarkdownTable} onFeedback={onFeedback} />}
          </Fragment>
        );
      })}

      {isTyping && <ChatTypingIndicator progressText={progressText} />}
    </div>
  );
}
