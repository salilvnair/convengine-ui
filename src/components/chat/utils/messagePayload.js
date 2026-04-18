function safeParseJson(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findFieldDeep(obj, field, depth = 0) {
  if (!obj || depth > 6) return "";
  if (typeof obj !== "object") return "";

  if (typeof obj[field] === "string" && obj[field].trim()) {
    return obj[field].trim();
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findFieldDeep(value, field, depth + 1);
      if (found) return found;
    }

    if (typeof value === "string" && value.trim().startsWith("{")) {
      const parsed = safeParseJson(value);
      if (parsed && typeof parsed === "object") {
        const found = findFieldDeep(parsed, field, depth + 1);
        if (found) return found;
      }
    }
  }

  return "";
}

export function stringifyPayload(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function extractEngineStatus(response) {
  const intent = findFieldDeep(response, "intent");
  const state = findFieldDeep(response, "state");
  return { intent, state };
}
