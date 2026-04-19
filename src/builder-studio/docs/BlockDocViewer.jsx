/**
 * BlockDocViewer — rich documentation overlay for the Inspector panel.
 * Renders registry-driven docs with Docusaurus-like styling: badges,
 * tip/alert callout boxes, field cards with type indicators, and icons.
 *
 * Props:
 *   blockType  — the block type key (e.g., 'agent', 'api')
 *   onClose    — callback to close the doc viewer
 *   bgColor    — block's accent color
 */
import { getBlockDocs } from '../docs/block-docs-registry'

const CATEGORY_META = {
  core:    { label: 'Core',    color: '#6366f1', icon: '⚙️' },
  tool:    { label: 'Tool',    color: '#0ea5e9', icon: '🔧' },
  trigger: { label: 'Trigger', color: '#f59e0b', icon: '⚡' },
  custom:  { label: 'Custom',  color: '#8b5cf6', icon: '🧩' },
}

export default function BlockDocViewer({ blockType, onClose, bgColor }) {
  const doc = getBlockDocs(blockType)
  if (!doc) {
    return (
      <div className="bsdoc-root">
        <div className="bsdoc-close-bar">
          <button className="bsdoc-close-btn" onClick={onClose} title="Close documentation">
            <CloseIcon />
          </button>
        </div>
        <div className="bsdoc-empty">
          <span className="bsdoc-empty-icon">📄</span>
          <p>No documentation available for this block yet.</p>
          <p className="bsdoc-empty-hint">
            Register docs via <code>registerBlockDocs('{blockType}', {'{ ... }'})</code>
          </p>
        </div>
      </div>
    )
  }

  const cat = CATEGORY_META[doc.category] || CATEGORY_META.custom

  return (
    <div className="bsdoc-root">
      {/* ── Close button ── */}
      <div className="bsdoc-close-bar">
        <button className="bsdoc-close-btn" onClick={onClose} title="Close documentation">
          <CloseIcon />
        </button>
      </div>

      {/* ── Header ── */}
      <div className="bsdoc-header" style={{ borderLeftColor: bgColor || cat.color }}>
        <div className="bsdoc-header-top">
          <span className="bsdoc-icon">{doc.icon}</span>
          <h2 className="bsdoc-title">{doc.title}</h2>
          <span className="bsdoc-cat-badge" style={{ background: cat.color }}>{cat.icon} {cat.label}</span>
        </div>
        <p className="bsdoc-summary">{doc.summary}</p>
      </div>

      {/* ── Tip callout ── */}
      {doc.tip && (
        <div className="bsdoc-callout bsdoc-callout-tip">
          <div className="bsdoc-callout-icon">💡</div>
          <div className="bsdoc-callout-body">
            <span className="bsdoc-callout-label">Tip</span>
            <p>{doc.tip}</p>
          </div>
        </div>
      )}

      {/* ── Alert callout ── */}
      {doc.alert && (
        <div className="bsdoc-callout bsdoc-callout-alert">
          <div className="bsdoc-callout-icon">⚠️</div>
          <div className="bsdoc-callout-body">
            <span className="bsdoc-callout-label">Important</span>
            <p>{doc.alert}</p>
          </div>
        </div>
      )}

      {/* ── Fields section ── */}
      {doc.fields && doc.fields.length > 0 && (
        <div className="bsdoc-section">
          <h3 className="bsdoc-section-title">
            <FieldsIcon />
            Fields Reference
          </h3>
          <div className="bsdoc-fields">
            {doc.fields.map((f) => (
              <FieldCard key={f.name} field={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FieldCard({ field }) {
  const f = field
  return (
    <div className={`bsdoc-field ${f.advanced ? 'bsdoc-field-advanced' : ''}`}>
      <div className="bsdoc-field-header">
        <code className="bsdoc-field-name">{f.label || f.name}</code>
        <div className="bsdoc-field-badges">
          {f.badge && (
            <span
              className="bsdoc-badge"
              style={{
                background: f.badgeColor ? `${f.badgeColor}18` : undefined,
                color: f.badgeColor || undefined,
                borderColor: f.badgeColor ? `${f.badgeColor}40` : undefined,
              }}
            >
              {f.badge}
            </span>
          )}
          {f.type && <span className="bsdoc-badge bsdoc-badge-type">{f.type}</span>}
          {f.required && <span className="bsdoc-badge bsdoc-badge-required">required</span>}
          {f.advanced && <span className="bsdoc-badge bsdoc-badge-advanced">advanced</span>}
        </div>
      </div>

      <p className="bsdoc-field-desc">{renderDescription(f.description)}</p>

      {f.defaultValue && (
        <div className="bsdoc-field-default">
          <span className="bsdoc-field-default-label">Default:</span>
          <code className="bsdoc-field-default-value">{f.defaultValue}</code>
        </div>
      )}

      {f.tip && (
        <div className="bsdoc-callout bsdoc-callout-tip bsdoc-callout-inline">
          <div className="bsdoc-callout-icon">💡</div>
          <div className="bsdoc-callout-body"><p>{f.tip}</p></div>
        </div>
      )}

      {f.alert && (
        <div className="bsdoc-callout bsdoc-callout-alert bsdoc-callout-inline">
          <div className="bsdoc-callout-icon">⚠️</div>
          <div className="bsdoc-callout-body"><p>{f.alert}</p></div>
        </div>
      )}
    </div>
  )
}

/**
 * Render a description string with light-markdown formatting.
 *
 * Supported tokens (all within the same string — no nested parsing):
 *   **bold**               → <strong> in the display font
 *   `code`                 → inline code chip (indigo)
 *   <agent.field>          → template-ref chip (dark blue)  — matches <\w+\.\w+...>
 *   {role, content}        → shape chip (dark maroon)        — matches {non-empty-non-newline}
 *   newlines               → <br>
 *
 * Additionally: when the description contains a run of lines that each start
 * with "• **Name** — description", those lines are lifted out into a real
 * table with a colored bullet, a bold name (display font), and the rest as
 * the regular description (body font). Remaining non-bullet text above/below
 * the run is rendered inline as usual. This is what the user asked for for
 * fields like the agent's `memoryType` enum list.
 */
function renderDescription(text) {
  if (!text) return null
  // Normalize so each "• **X** — Y" bullet sits on its own line. Some doc
  // entries keep them on the same paragraph without a \n separator.
  const lines = text.split(/\n+/).flatMap((block) =>
    block.includes('• ') ? block.split(/(?=• \*\*)/) : [block]
  ).map((l) => l.trim()).filter(Boolean)

  const ENUM_RE = /^•\s*\*\*([^*]+)\*\*\s*[—-]\s*(.*)$/
  const out = []
  let buf = []
  let enumRows = []
  const flushText = () => {
    if (buf.length === 0) return
    out.push(<p key={`p-${out.length}`} className="bsdoc-field-para">{renderInline(buf.join('\n'))}</p>)
    buf = []
  }
  const flushEnum = () => {
    if (enumRows.length === 0) return
    out.push(
      <table key={`tbl-${out.length}`} className="bsdoc-enum-table">
        <tbody>
          {enumRows.map((row, i) => (
            <tr key={i}>
              <td className="bsdoc-enum-bullet-cell"><span className="bsdoc-enum-bullet" /></td>
              <td className="bsdoc-enum-name-cell"><span className="bsdoc-enum-name">{row.name}</span></td>
              <td className="bsdoc-enum-desc-cell"><span className="bsdoc-enum-desc">{renderInline(row.desc)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
    enumRows = []
  }

  for (const line of lines) {
    const m = line.match(ENUM_RE)
    if (m) {
      flushText()
      enumRows.push({ name: m[1].trim(), desc: m[2].trim() })
    } else {
      flushEnum()
      buf.push(line)
    }
  }
  flushEnum()
  flushText()
  return out
}

/**
 * Inline formatter for a single chunk of text (no bullet handling, no
 * paragraph splitting). Recognises bold / backtick-code / <refs> / {shapes}
 * and keeps everything else as plain text with <br> on newlines.
 */
function renderInline(text) {
  if (!text) return null
  // Single regex with alternation so we preserve order.
  const RE = /(\*\*[^*]+\*\*|`[^`]+`|<[A-Za-z_][\w.]*(?:\.[\w.]+)?>|\{[^{}\n]{1,80}\})/g
  const pieces = []
  let last = 0
  let m
  let i = 0
  while ((m = RE.exec(text)) !== null) {
    if (m.index > last) pieces.push(renderPlain(text.slice(last, m.index), `t-${i++}`))
    const tok = m[0]
    if (tok.startsWith('**')) {
      pieces.push(<strong key={`b-${i++}`} className="bsdoc-strong">{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('`')) {
      pieces.push(<code key={`c-${i++}`} className="bsdoc-inline-code">{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith('<')) {
      pieces.push(<code key={`r-${i++}`} className="bsdoc-inline-ref">{tok}</code>)
    } else if (tok.startsWith('{')) {
      pieces.push(<code key={`s-${i++}`} className="bsdoc-inline-shape">{tok}</code>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) pieces.push(renderPlain(text.slice(last), `t-${i++}`))
  return pieces
}

function renderPlain(s, key) {
  if (!s.includes('\n')) return <span key={key}>{s}</span>
  const parts = s.split('\n')
  return (
    <span key={key}>
      {parts.map((p, j) => (
        <span key={j}>{j > 0 && <br />}{p}</span>
      ))}
    </span>
  )
}

/* ── SVG Icons ──────────────────────────────────────────────────────── */

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function FieldsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
