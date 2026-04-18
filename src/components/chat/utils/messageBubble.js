export function bubbleShapeClass(text) {
  const value = typeof text === "string" ? text : String(text ?? "");
  if (value.includes("\n") || value.length > 140) return "chat-bubble-rect";
  return "chat-bubble-pill";
}

export function isAssistantErrorBubble(bubble) {
  if (!bubble || bubble.role !== "assistant") return false;
  const text = typeof bubble.text === "string" ? bubble.text : String(bubble.text ?? "");
  return text.trim().startsWith("Error:");
}
