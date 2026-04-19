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
 * Render description with basic markdown-like formatting:
 * **bold**, `code`, and \n\n for paragraphs, • for bullets
 */
function renderDescription(text) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|• )/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bsdoc-inline-code">{part.slice(1, -1)}</code>
    }
    if (part === '• ') {
      return <span key={i} className="bsdoc-bullet">•</span>
    }
    // Handle newlines
    if (part.includes('\n')) {
      return part.split('\n').map((line, j) => (
        <span key={`${i}-${j}`}>
          {j > 0 && <br />}
          {line}
        </span>
      ))
    }
    return part
  })
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
