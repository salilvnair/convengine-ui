import { UserGlyph } from "./ChatIcons.jsx";
import { bubbleShapeClass } from "../utils/messageBubble.js";

export function UserChatMessage({ bubble }) {
  return (
    <article className="chat-message chat-message-user">
      <div className="chat-avatar chat-avatar-user">
        <UserGlyph />
      </div>
      <div className="chat-content">
        <div className={`chat-bubble ${bubbleShapeClass(bubble.text)} chat-bubble-user`}>
          <pre className="chat-text">{bubble.text}</pre>
        </div>
      </div>
    </article>
  );
}
