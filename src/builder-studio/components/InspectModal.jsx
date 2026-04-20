/**
 * InspectModal — wide panel matching the trace-panel Disclosure style.
 * Opened via right-click → "Inspect" on any node after a run.
 */
import { useRef, useState } from 'react'
import { getBlock } from '../blocks/registry'
import { getTypeColor } from '../panel/io-registry'
import JsonView from '../run/JsonView'

export default function InspectModal({ nodeId, nodeData, traceEntry, onClose }) {
  const cfg = getBlock(nodeData?.blockType)
  const Icon = nodeData?.icon || cfg?.icon
  const title = nodeData?.title || cfg?.name || nodeData?.blockType
  const t = traceEntry || {}
  const skillRunsRef = useRef(null)
  const llmRunsRef = useRef(null)

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
              {/* Jump chips for agent blocks */}
              {(t.meta?.skillRuns?.length > 0 || t.meta?.llmRequest) && (
                <div className="bs-inspect-card-jumps">
                  {t.meta?.skillRuns?.length > 0 && (
                    <button className="bs-inspect-jump-chip is-skill" onClick={() => skillRunsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                      Skills ({t.meta.skillRuns.length})
                    </button>
                  )}
                  {t.meta?.llmRequest && (
                    <button className="bs-inspect-jump-chip is-llm" onClick={() => llmRunsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      LLM
                    </button>
                  )}
                </div>
              )}
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
                          <div className="bs-inspect-kv-val"><SmartValue value={val} /></div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="bs-debug-json"><SmartValue value={t.output} expand={2} /></div>
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

            {/* Skill Runs */}
            {t.meta?.skillRuns?.length > 0 && (
              <Disclosure label={`Skill Runs (${t.meta.skillRuns.length})`} defaultOpen anchorRef={skillRunsRef}>
                {t.meta.skillRuns.map((sr, i) => (
                  <div key={i} className="bs-inspect-skill-run">
                    <div className="bs-inspect-skill-header">
                      <span className="bs-inspect-badge is-type">{sr.name || sr.skillId}</span>
                      {sr.error && <span className="bs-inspect-badge is-error">Error</span>}
                      {!sr.error && <span className="bs-inspect-badge is-ok">OK</span>}
                    </div>
                    <div className="bs-inspect-skill-section">
                      <div className="bs-inspect-skill-label">Params</div>
                      <div className="bs-debug-json"><JsonView value={sr.params} collapsible defaultExpanded={2} /></div>
                    </div>
                    {sr.output !== undefined && (
                      <div className="bs-inspect-skill-section">
                        <div className="bs-inspect-skill-label">Output</div>
                        <div className="bs-debug-json"><JsonView value={sr.output} collapsible defaultExpanded={2} /></div>
                      </div>
                    )}
                    {sr.error && (
                      <div className="bs-inspect-skill-section">
                        <div className="bs-inspect-skill-label" style={{ color: '#f87171' }}>Error</div>
                        <div className="bs-debug-json" style={{ color: '#f87171' }}>{sr.error}</div>
                      </div>
                    )}
                  </div>
                ))}
              </Disclosure>
            )}

            {/* LLM Runs */}
            {t.meta?.llmRequest && (
              <Disclosure label="LLM Runs (1)" defaultOpen anchorRef={llmRunsRef}>
                <div className="bs-inspect-llm-run">
                  <div className="bs-inspect-llm-section">
                    <div className="bs-inspect-skill-label">Request → Spring Boot</div>
                    <div className="bs-debug-json"><JsonView value={t.meta.llmRequest} collapsible defaultExpanded={2} /></div>
                  </div>
                  <div className="bs-inspect-llm-section">
                    <div className="bs-inspect-skill-label">Response ← Spring Boot</div>
                    <div className="bs-debug-json"><JsonView value={t.meta.llmResponse} collapsible defaultExpanded={2} /></div>
                  </div>
                </div>
              </Disclosure>
            )}

            {/* Template Bag */}
            {t.meta?.templateBag && Object.keys(t.meta.templateBag).length > 0 && (
              <Disclosure label="Template Bag">
                <div className="bs-inspect-kv-grid is-2col">
                  <div className="bs-inspect-kv-head is-2col">
                    <span>Key</span><span>Value</span>
                  </div>
                  {Object.entries(t.meta.templateBag).map(([key, val]) => (
                    <div key={key} className="bs-inspect-kv-row is-2col">
                      <span className="bs-inspect-kv-key"><code>{`{{${key}}}`}</code></span>
                      <div className="bs-inspect-kv-val">
                        {typeof val === 'object' ? <JsonView value={val} collapsible defaultExpanded={1} /> : <span>{String(val ?? '')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Disclosure>
            )}

            {/* Runtime Metadata */}
            {t.meta && Object.keys(t.meta).length > 0 && (
              <Disclosure label="Runtime Metadata">
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
function Disclosure({ label, defaultOpen = false, children, anchorRef }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div ref={anchorRef} className={`bs-disclosure ${open ? 'is-open' : ''}`}>
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

/**
 * Render a value as-is — no automatic type coercion:
 * - Objects/arrays → collapsible JsonView tree
 * - Strings → plain <pre> block (never parsed as JSON — use a mapper block for that)
 * - Primitives → inline text
 */
function SmartValue({ value, expand = 2 }) {
  if (value == null) return <span className="bs-inspect-null">null</span>
  if (typeof value === 'object') {
    return <JsonView value={value} collapsible defaultExpanded={expand} />
  }
  if (typeof value === 'string') {
    return <pre className="bs-inspect-plain-text">{value}</pre>
  }
  return <span>{String(value)}</span>
}
