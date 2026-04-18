/* eslint-disable react-refresh/only-export-components */
import "./FaqAnswer.css";

export function FaqAnswer({ payload }) {
  const answer = typeof payload?.answer === "string" ? payload.answer : "";
  const matchedFaqIds = Array.isArray(payload?.matchedFaqIds)
    ? payload.matchedFaqIds
    : Array.isArray(payload?.faqIdsMatched)
      ? payload.faqIdsMatched
      : [];
  const confidenceRaw = typeof payload?.confidence === "number" ? payload.confidence : null;
  const confidencePercent = confidenceRaw === null ? null : Math.max(0, Math.min(100, Math.round(confidenceRaw * 100)));

  return (
    <div className="faq-answer-render faq-answer-corner-badge">
      {confidencePercent !== null && (
        <span className="faq-answer-confidence-badge faq-answer-confidence-badge-corner" title={`Confidence ${confidencePercent}%`} aria-label={`Confidence ${confidencePercent} percent`}>
          {confidencePercent}
        </span>
      )}

      <div className="faq-answer-meta" aria-label="FAQ answer metadata">
        {matchedFaqIds.length > 0 && (
          <span className="faq-answer-chip" title={`Matched FAQ IDs: ${matchedFaqIds.join(", ")}`}>
            FAQ: {matchedFaqIds.join(", ")}
          </span>
        )}
      </div>

      <pre className="chat-text">{answer}</pre>
    </div>
  );
}

export const faqAnswerRenderer = {
  key: "FaqAnswer",
  priority: 100,
  match: ({ payload, effectiveType }) => {
    if (!payload || typeof payload !== "object") return false;
    if (effectiveType === "FaqAnswer") return true;

    const hasAnswer = typeof payload.answer === "string";
    const hasFaqArray = Array.isArray(payload.matchedFaqIds) || Array.isArray(payload.faqIdsMatched);
    const hasConfidence = typeof payload.confidence === "number";
    return hasAnswer && (hasFaqArray || hasConfidence);
  },
  Component: FaqAnswer,
};
