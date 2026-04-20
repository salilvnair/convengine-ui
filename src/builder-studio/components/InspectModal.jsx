/**
 * InspectModal — wide panel matching the trace-panel Disclosure style.
 * Opened via right-click → "Inspect" on any node after a run.
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
        {/* Sticky close — stays visible when content scrolls */}
        <div className="bs-inspect-topbar">
          <button className="bs-inspect-close" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="bs-inspect-body">
          {/* Block identity header */}
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

          {/* Summary KV bar */}
          <div className="bs-run-log-kv" style={{ marginBottom: 10 }}>
            <KV k="Node" v={title} />
            <KV k="Node ID" v={<code>{nodeId}</code>} />
            <KV k="Block type" v={<code>{nodeData?.blockType}</code>} />
            {t.ms != null && <KV k="Duration" v={`${t.ms}ms`} />}
          </div>

          {/* Error banner */}
          {t.error && (
            <div className="bs-inspect-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>{t.error}</span>
            </div>
          )}

          {/* Disclosure sections */}
          <div className="bs-inspect-disclosures">

            {/* Per-handle Inputs */}
            {t.inputsByHandle && Object.keys(t.inputsByHandle).length > 0 && (
              <Disclosure label="Connected Inputs" defaultOpen>
                <div className="bs-inspect-kv-grid">
                  <div className="bs-inspect-kv-head">
                    <span>Handle</span><span>Type</span><span>Value</span>
                  </div>
                  {Object.entries(t.inputsByHandle).map(([key, val]) => {
                    const portType = cfg?.inputs?.[key]?.type || guessType(val)
                    const tc = getTypeColor(portType)
                    return (
                      <div key={key} className="bs-inspect-kv-row">
                        <span className="bs-inspect-kv-key">{key}</span>
                        <span className="bs-inspect-type-pill" style={{ background: tc.bg, borderColor: tc.border, color: tc.text }}>{portType}</span>
                        <div className="bs-inspect-kv-val"><JsonView value={val} collapsible defaultExpanded={2} /></div>
                      </div>
                    )
                  })}
                </div>
              </Disclosure>
            )}

            {/* Flat input (single-input blocks) */}
            {t.input !== undefined && t.input !== null && (!t.inputsByHandle || Object.keys(t.inputsByHandle).length === 0) && (
              <Disclosure label="Input" defaultOpen>
                <div className="bs-debug-json"><JsonView value={t.input} collapsible defaultExpanded={2} /></div>
              </Disclosure>
            )}

            {/* Output */}
            {t.output !== undefined && (
              <Disclosure label="Output" defaultOpen>
                {t.output && typeof t.output === 'object' && !Array.isArray(t.output) ? (
                  <div className="bs-inspect-kv-grid">
                    <div className="bs-inspect-kv-head">
                      <span>Key</span><span>Type</span><span>Value</span>
                    </div>
                    {Object.entries(t.output).map(([key, val]) => {
                      const portType = cfg?.outputs?.[key]?.type || guessType(val)
                      const tc = getTypeColor(portType)
                      return (
                        <div key={key} className="bs-inspect-kv-row">
                          <span className="bs-inspect-kv-key">{key}</span>
                          <span className="bs-inspect-type-pill" style={{ background: tc.bg, borderColor: tc.border, color: tc.text }}>{portType}</span>
                          <div className="bs-inspect-kv-val"><JsonView value={val} collapsible defaultExpanded={2} /></div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="bs-debug-json"><JsonView value={t.output} collapsible defaultExpanded={2} /></div>
                )}
              </Disclosure>
            )}

            {/* Configured Values */}
            {t.values && Object.keys(t.values).length > 0 && (
              <Disclosure label="Configured Values" defaultOpen>
                <div className="bs-inspect-kv-grid is-2col">
                  <div className="bs-inspect-kv-head is-2col">
                    <span>Field</span><span>Value</span>
                  </div>
                  {Object.entries(t.values).filter(([, v]) => v != null && v !== '').map(([key, val]) => (
                    <div key={key} className="bs-inspect-kv-row is-2col">
                      <span className="bs-inspect-kv-key">{key}</span>
                      <div className="bs-inspect-kv-val">
                        {typeof val === 'object' ? <JsonView value={val} collapsible defaultExpanded={1} /> : <span>{String(val)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Disclosure>
            )}

            {/* Runtime Metadata */}
            {t.meta && Object.keys(t.meta).length > 0 && (
              <Disclosure label="Runtime Metadata" defaultOpen>
                <div className="bs-debug-json"><JsonView value={t.meta} collapsible defaultExpanded={1} /></div>
              </Disclosure>
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
    </div>
  )
}

/** Disclosure — reuses the exact trace-panel look & feel. */
function Disclosure({ label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`bs-disclosure ${open ? 'is-open' : ''}`}>
      <button className="bs-disclosure-head" onClick={() => setOpen((v) => !v)}>
        <span className="bs-disclosure-caret">{open ? '▾' : '▸'}</span>
        <span className="bs-disclosure-label">{label}</span>
      </button>
      {open && <div className="bs-disclosure-body">{children}</div>}
    </div>
  )
}

function KV({ k, v }) {
  return (
    <div className="bs-run-log-kv-row">
      <span className="bs-run-log-kv-k">{k}</span>
      <span className="bs-run-log-kv-v">{v}</span>
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
