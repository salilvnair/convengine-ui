/* eslint-disable react-refresh/only-export-components */
import { renderAssistantContent } from "../../utils/assistantContent.jsx";
import { assistantRendererProviders } from "../providers/index.js";

function tryParseJsonObject(rawText) {
  if (typeof rawText !== "string") return null;
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function deriveEffectiveType(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.type === "string" && payload.type.trim()) return payload.type.trim();
  return "";
}

function sortByPriorityDesc(renderers) {
  return [...renderers].sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function resolveAssistantRenderer(rawText) {
  const payload = tryParseJsonObject(rawText);
  const effectiveType = deriveEffectiveType(payload);
  const context = { rawText, payload, effectiveType };

  for (const renderer of sortByPriorityDesc(assistantRendererProviders)) {
    if (typeof renderer.match === "function" && renderer.match(context)) {
      return {
        key: renderer.key || "custom",
        Component: renderer.Component,
        payload,
      };
    }
  }

  return {
    key: "default",
    Component: DefaultAssistantRenderer,
    payload: { rawText },
  };
}

export function DefaultAssistantRenderer({ payload }) {
  return <>{renderAssistantContent(payload.rawText)}</>;
}
