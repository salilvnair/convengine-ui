export function extractVerboseText(streamEvent) {
  const payload = streamEvent?.data;
  if (!payload || typeof payload !== "object") return "";
  const verbose =
    (payload.verbose && typeof payload.verbose === "object" && payload.verbose) ||
    (payload.payload && typeof payload.payload === "object" && payload.payload.verbose && typeof payload.payload.verbose === "object" && payload.payload.verbose) ||
    null;
  if (!verbose) return "";
  if (typeof verbose.text === "string" && verbose.text.trim()) return verbose.text.trim();
  if (typeof verbose.message === "string" && verbose.message.trim()) return verbose.message.trim();
  if (typeof verbose.errorMessage === "string" && verbose.errorMessage.trim()) return verbose.errorMessage.trim();
  return "";
}

export function resolveStage(streamEvent) {
  if (typeof streamEvent?.stage === "string" && streamEvent.stage.trim()) return streamEvent.stage.trim();
  const payload = streamEvent?.data;
  if (payload && typeof payload === "object" && typeof payload.stage === "string") return payload.stage.trim();
  return "";
}
