export function UserGlyph() {
  return (
    <svg className="chat-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    </svg>
  );
}

export function AgentGlyph() {
  return (
    <svg className="chat-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4" />
      <path d="M12 2v2" />
      <path d="M9 12v9" />
      <path d="M15 12v9" />
      <path d="M5 16l4 -2" />
      <path d="M15 14l4 2" />
      <path d="M9 18h6" />
      <path d="M10 8v.01" />
      <path d="M14 8v.01" />
    </svg>
  );
}

export function ThumbUpGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v10" />
      <path d="M3 10h4v10H3z" />
      <path d="M7 20h8.2a2.3 2.3 0 0 0 2.2-1.7l1.3-4.6a2.3 2.3 0 0 0-2.2-2.9H12l.8-4.1a2 2 0 0 0-2-2.4H10l-3 5.7V20z" />
    </svg>
  );
}

export function ThumbDownGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 14V4" />
      <path d="M3 4h4v10H3z" />
      <path d="M7 4h8.2a2.3 2.3 0 0 1 2.2 1.7l1.3 4.6a2.3 2.3 0 0 1-2.2 2.9H12l.8 4.1a2 2 0 0 1-2 2.4H10l-3-5.7V4z" />
    </svg>
  );
}
