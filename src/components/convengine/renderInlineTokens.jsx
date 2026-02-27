import React from "react";

const CE_TOKEN_REGEX = /(ce_[a-zA-Z0-9_]+)/g;

export function renderInlineTokens(value) {
  if (typeof value !== "string") {
    return value;
  }

  const parts = value.split(CE_TOKEN_REGEX);
  if (parts.length <= 1) {
    return value;
  }

  return (
    <>
      {parts.map((part, index) => {
        if (!part) {
          return null;
        }
        if (/^ce_[a-zA-Z0-9_]+$/.test(part)) {
          return (
            <span key={`ce-token-${index}`} className="ce-file-ref">
              {part}
            </span>
          );
        }
        return <React.Fragment key={`txt-${index}`}>{part}</React.Fragment>;
      })}
    </>
  );
}
