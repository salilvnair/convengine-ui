import React, { useMemo, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";

function autoIndentBraceCode(snippet) {
  const lines = snippet.split("\n");
  let indentLevel = 0;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";

      let closes = (trimmed.match(/}/g) || []).length;
      const opens = (trimmed.match(/{/g) || []).length;

      if (/^}/.test(trimmed)) {
        indentLevel = Math.max(0, indentLevel - 1);
        if (closes > 0) closes -= 1;
      }

      const indented = `${"  ".repeat(indentLevel)}${trimmed}`;
      indentLevel = Math.max(0, indentLevel + opens - closes);
      return indented;
    })
    .join("\n");
}

function normalizeJson(snippet) {
  try {
    return JSON.stringify(JSON.parse(snippet), null, 2);
  } catch (_error) {
    return snippet;
  }
}

function normalizeYaml(snippet) {
  const lines = snippet
    .split("\n")
    .map((line) => line.replace(/\t/g, "  ").replace(/\s+$/g, ""));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^(\s*)convengine:\s*$/);
    if (!match) continue;

    const baseIndent = match[1].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      if (!next.trim()) continue;
      const nextIndent = (next.match(/^\s*/) || [""])[0].length;
      if (nextIndent < baseIndent) break;
      if (nextIndent > baseIndent) continue;
      if (/^[A-Za-z0-9_-]+\s*:/.test(next.trim())) {
        lines[j] = `  ${next}`;
        continue;
      }
      break;
    }
  }

  return lines.join("\n");
}

function normalizeCodeSnippet(children, language) {
  if (typeof children !== "string") return children;
  const normalizedNewlines = children.replace(/\r\n/g, "\n");
  const trimmed = normalizedNewlines.replace(/^\n+|\n+$/g, "");
  const lines = trimmed.split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) return trimmed;

  const minIndent = Math.min(
    ...nonEmpty.map((line) => {
      const match = line.match(/^[ \t]*/);
      return match ? match[0].length : 0;
    })
  );

  const base = lines.map((line) => line.slice(Math.min(minIndent, line.length))).join("\n");
  const normalizedLanguage = String(language || "").toLowerCase();
  const braceLanguages = new Set(["java", "javascript", "js", "typescript", "ts", "tsx", "jsx", "c", "cpp"]);

  if (braceLanguages.has(normalizedLanguage)) return autoIndentBraceCode(base);
  if (normalizedLanguage === "json") return normalizeJson(base);
  if (normalizedLanguage === "yaml" || normalizedLanguage === "yml") return normalizeYaml(base);
  return base;
}

export default function CodeBlockToggle({
  language = "text",
  title,
  packagePath,
  filePath,
  defaultOpen,
  children,
}) {
  const snippet = useMemo(() => normalizeCodeSnippet(children, language), [children, language]);
  const lineCount = typeof snippet === "string" ? snippet.split("\n").length : 0;
  const initialOpen = typeof defaultOpen === "boolean" ? defaultOpen : lineCount <= 50;
  const [open, setOpen] = useState(initialOpen);
  const [copied, setCopied] = useState(false);

  const onCopy = async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(snippet || ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="ce-code-panel">
      <header className="ce-code-panel-header" onClick={() => setOpen(!open)}>
        <div className="ce-code-panel-head-left">
          <div className="ce-code-panel-ide-strip" aria-hidden="true">
            <span className="ce-ide-dot ce-ide-dot-red" />
            <span className="ce-ide-dot ce-ide-dot-yellow" />
            <span className="ce-ide-dot ce-ide-dot-green" />
          </div>

          <div className="ce-code-panel-title">{title || "Code Snippet"}</div>

          {(packagePath || filePath) && (
            <div className="ce-code-panel-path-wrap">
              {packagePath ? <span className="ce-code-panel-path ce-code-panel-path-package" title={packagePath}>package: {packagePath}</span> : null}
              {filePath ? <span className="ce-code-panel-path ce-code-panel-path-file" title={filePath}>file: {filePath}</span> : null}
            </div>
          )}
        </div>

        <div className="ce-code-panel-head-right">
          <span className="ce-code-lang">{String(language).toUpperCase()}</span>
          <button className="ce-code-toggle-btn" type="button">{open ? "Hide" : "Show"}</button>
        </div>
      </header>

      {open ? (
        <div className="ce-code-panel-body">
          <div className={`language-${language} codeBlockContainer_Ckt0 theme-code-block`} style={{ "--prism-background-color": "hsl(220, 13%, 18%)", "--prism-color": "hsl(220, 14%, 71%)" }}>
            <div className="codeBlockContent_QJqH" style={{ position: "relative" }}>
              <Highlight theme={themes.oneDark} code={String(snippet || "")} language={String(language).toLowerCase()}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre tabIndex="0" className={`${className} codeBlock_bY9V thin-scrollbar`} style={style}>
                    <code className="codeBlockLines_e6Vv">
                      {tokens.map((line, i) => (
                        <span key={i} className="token-line" {...getLineProps({ line })}>
                          {line.map((token, key) => (
                            <span key={key} {...getTokenProps({ token })} />
                          ))}
                          <br />
                        </span>
                      ))}
                    </code>
                  </pre>
                )}
              </Highlight>
              <div className="buttonGroup_M5ko" style={{ position: "absolute", top: "0.75rem", right: "0.75rem", zIndex: 3 }}>
                <button
                  type="button"
                  aria-label="Copy code to clipboard"
                  title={copied ? "Copied" : "Copy"}
                  className={`clean-btn ${copied ? "copied" : ""}`}
                  onClick={onCopy}
                >
                  <span className="copyButtonIcons_IEyt" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="copyButtonIcon_TrPX">
                      <path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" />
                    </svg>
                    <svg viewBox="0 0 24 24" className="copyButtonSuccessIcon_cVMy">
                      <path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
