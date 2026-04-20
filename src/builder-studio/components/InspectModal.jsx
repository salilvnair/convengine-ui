/**
 * InspectModal — colorful block-card + detailed I/O data table.
 * Opened via right-click → "Inspect" on any node after a run.
 * Shows the block's identity card (WikiDoc-style) and a detailed
 * breakdown of all inputs, outputs, config values, and metadata.
 */
import { useState } from 'react'
import { getBlock } from '../blocks/registry'
import { getTypeColor } from '../panel/io-registry'
import JsonView from '../run/JsonView'

export default function InspectModal({ nodeId, nodeData, traceEntry, onClose }) {
  const cfg = getBlock(nodeData?.blockType)
  const Icon = nodeData?.icon || cfg?.icon
  const title = nodeData?.title || cfg?.name || nodeData?.blockType
  const t = traceEntry || {}

  return (
    <div className="bs-inspect-overlay" onClick={onClose}>
      <div className="bs-inspect-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className="bs-inspect-close" onClick={onClose} title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {/* Block Identity Card */}
        <div className="bs-inspect-card" style={{ '--inspect-accent': cfg?.bgColor || '#6366f1' }}>
          <div className="bs-inspect-card-icon" style={{ background: cfg?.bgColor || '#6366f1' }}>
            {Icon ? <Icon className="bs-node-icon" /> : null}
          </div>
          <div className="bs-inspect-card-info">
            <div className="bs-inspect-card-title">{title}</div>
            <div className="bs-inspect-card-meta">
              <span className="bs-inspect-badge is-type">{nodeData?.blockType}</span>
              {cfg?.category && <span className="bs-inspect-badge is-cat">{cfg.category}</span>}
              {t.ms != null && <span className="bs-inspect-badge is-time">{t.ms}ms</span>}
              {t.error && <span className="bs-inspect-badge is-error">Error</span>}
              {!t.error && t.output !== undefined && <span className="bs-inspect-badge is-ok">Success</span>}
            </div>
            <div className="bs-inspect-card-id">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <code>{nodeId}</code>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {t.error && (
          <div className="bs-inspect-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>{t.error}</span>
          </div>
        )}

        {/* I/O Sections */}
        <div className="bs-inspect-sections">
          {/* Per-handle Inputs */}
          {t.inputsByHandle && Object.keys(t.inputsByHandle).length > 0 && (
            <InspectSection
              title="Connected Inputs"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>}
              color="#60a5fa"
            >
              <div className="bs-inspect-table">
                <div className="bs-inspect-table-head">
                  <span>Handle</span><span>Type</span><span>Value</span>
                </div>
                {Object.entries(t.inputsByHandle).map(([key, val]) => {
                  const portType = cfg?.inputs?.[key]?.type || guessType(val)
                  const tc = getTypeColor(portType)
                  return (
                    <div key={key} className="bs-inspect-table-row">
                      <span className="bs-inspect-table-key">{key}</span>
                      <span className="bs-inspect-type-pill" style={{ background: tc.bg, borderColor: tc.border, color: tc.text }}>{portType}</span>
                      <div className="bs-inspect-table-val">
                        <JsonView value={val} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </InspectSection>
          )}

          {/* Flat input (legacy / single-input blocks) */}
          {t.input !== undefined && t.input !== null && (!t.inputsByHandle || Object.keys(t.inputsByHandle).length === 0) && (
            <InspectSection
              title="Input"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>}
              color="#60a5fa"
            >
              <div className="bs-inspect-json"><JsonView value={t.input} /></div>
            </InspectSection>
          )}

          {/* Output */}
          {t.output !== undefined && (
            <InspectSection
              title="Output"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
              color="#22c55e"
            >
              {t.output && typeof t.output === 'object' && !Array.isArray(t.output) ? (
                <div className="bs-inspect-table">
                  <div className="bs-inspect-table-head">
                    <span>Key</span><span>Type</span><span>Value</span>
                  </div>
                  {Object.entries(t.output).map(([key, val]) => {
                    const portType = cfg?.outputs?.[key]?.type || guessType(val)
                    const tc = getTypeColor(portType)
                    return (
                      <div key={key} className="bs-inspect-table-row">
                        <span className="bs-inspect-table-key">{key}</span>
                        <span className="bs-inspect-type-pill" style={{ background: tc.bg, borderColor: tc.border, color: tc.text }}>{portType}</span>
                        <div className="bs-inspect-table-val">
                          <JsonView value={val} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="bs-inspect-json"><JsonView value={t.output} /></div>
              )}
            </InspectSection>
          )}

          {/* Configured Values */}
          {t.values && Object.keys(t.values).length > 0 && (
            <InspectSection
              title="Configured Values"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
              color="#a78bfa"
            >
              <div className="bs-inspect-table">
                <div className="bs-inspect-table-head">
                  <span>Field</span><span>Value</span>
                </div>
                {Object.entries(t.values).filter(([, v]) => v != null && v !== '').map(([key, val]) => (
                  <div key={key} className="bs-inspect-table-row bs-inspect-table-row-2col">
                    <span className="bs-inspect-table-key">{key}</span>
                    <div className="bs-inspect-table-val">
                      {typeof val === 'object' ? <JsonView value={val} /> : <span>{String(val)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </InspectSection>
          )}

          {/* Metadata */}
          {t.meta && Object.keys(t.meta).length > 0 && (
            <InspectSection
              title="Runtime Metadata"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              color="#fbbf24"
            >
              <div className="bs-inspect-json"><JsonView value={t.meta} /></div>
            </InspectSection>
          )}
        </div>

        {/* No data */}
        {!traceEntry && (
          <div className="bs-inspect-empty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>No run data yet. Execute the workflow first, then inspect nodes.</span>
          </div>
        )}
      </div>
    </div>
  )
}

function InspectSection({ title, icon, color, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`bs-inspect-section ${open ? 'is-open' : ''}`}>
      <button className="bs-inspect-section-head" onClick={() => setOpen((v) => !v)}>
        <span className="bs-inspect-section-caret">{open ? '▾' : '▸'}</span>
        {icon}
        <span className="bs-inspect-section-title" style={{ color }}>{title}</span>
      </button>
      {open && <div className="bs-inspect-section-body">{children}</div>}
    </div>
  )
}

function guessType(v) {
  if (v == null) return 'any'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'string') return 'string'
  return 'json'
}
