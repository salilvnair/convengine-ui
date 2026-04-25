/**
 * SubBlock renderer — renders a SubBlockConfig as an inspector control.
 *
 * Handles every SubBlockType value present in sim's types.ts. Types that
 * require dedicated selector UIs (file-selector, channel-selector, etc.)
 * fall back to a short-input so the field is still editable; the shape is
 * preserved so serialization stays compatible with sim's tool runners.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import CodeEditor from '../components/CodeEditor'
import JsonEditor from '../components/JsonEditor'
import FullscreenWrapper from '../components/FullscreenWrapper'
import StyledSelect from '../components/StyledSelect'
import { changeRuntimeProvider } from '../api/llm-provider-client'
import { useMcpStore } from '../mcp/mcp-store'
import { useWorkflowStore } from '../stores/workflow-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { getConfiguredProviderForModel, useLlmConfigStore } from '../stores/llm-config-store'
import JsonView from '../run/JsonView'

// Password field with show/hide toggle used when sub.password === true
function PasswordInputField({ value, onChange, placeholder, readOnly }) {
  const [show, setShow] = useState(false)
  return (
    <div className="bs-password-wrap">
      <input
        type={show ? 'text' : 'password'}
        className="bs-input"
        placeholder={placeholder || '••••••••'}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
      <button
        type="button"
        className="bs-password-eye"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        aria-label={show ? 'Hide' : 'Show'}
      >
        {show ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  )
}

export default function SubBlockRenderer({ sub, value, onChange, blockValues, nodeId }) {
  const set = useCallback((v) => onChange(sub.id, v), [onChange, sub.id])
  const defaultValue =
    value !== undefined && value !== null
      ? value
      : typeof sub.value === 'function'
        ? sub.value(blockValues || {})
        : sub.defaultValue

  // Subscribe to llm store so model comboboxes re-render when active provider changes
  useLlmConfigStore((s) => s.activeProvider)

  const options = typeof sub.options === 'function' ? safeCall(sub.options) : sub.options

  switch (sub.type) {
    case 'short-input':
    case 'oauth-input':
    case 'file-selector':
    case 'sheet-selector':
    case 'project-selector':
    case 'channel-selector':
    case 'user-selector':
    case 'folder-selector':
    case 'knowledge-base-selector':
    case 'document-selector':
    case 'workflow-selector':
    case 'table-selector':
      if (sub.password) return (
        <PasswordInputField
          value={defaultValue ?? ''}
          onChange={set}
          placeholder={sub.placeholder}
          readOnly={sub.readOnly}
        />
      )
      return (
        <input
          type="text"
          className="bs-input"
          placeholder={sub.placeholder}
          value={defaultValue ?? ''}
          readOnly={sub.readOnly}
          onChange={(e) => set(e.target.value)}
        />
      )

    case 'mcp-server-selector':
      return <McpServerSelector value={defaultValue} onChange={set} placeholder={sub.placeholder} />

    case 'mcp-tool-selector':
      return (
        <McpToolSelector
          value={defaultValue}
          onChange={set}
          placeholder={sub.placeholder}
          serverId={blockValues?.server}
        />
      )

    case 'long-input':
    case 'text':
    case 'eval-input':
      return (
        <textarea
          className="bs-textarea"
          rows={sub.rows || 4}
          placeholder={sub.placeholder}
          value={defaultValue ?? ''}
          onChange={(e) => set(e.target.value)}
        />
      )

    case 'json-editor':
      return (
        <JsonEditor
          value={defaultValue ?? '{}'}
          onChange={set}
          height="200px"
          placeholder="{}"
        />
      )

    case 'response-format':
      // JSON-schema authoring → tree editor with text fallback. Wrapped in
      // FullscreenWrapper so large schemas can be edited against the full
      // viewport without fighting the narrow Inspector column. Edits stay
      // as a stringified JSON in subBlockValues so the backend contract is
      // unchanged.
      return (
        <FullscreenWrapper label={sub.title || 'Response format'}>
          <JsonEditor
            value={defaultValue}
            onChange={(text) => set(text)}
            defaultMode="tree"
            height="260px"
          />
        </FullscreenWrapper>
      )

    case 'mcp-dynamic-args':
      return (
        <McpArgsEditor
          value={defaultValue}
          onChange={set}
          serverId={blockValues?.server}
          toolName={blockValues?.tool}
        />
      )

    case 'code':
    case 'input-format':
    case 'filter-builder':
    case 'sort-builder':
    case 'condition-input':
    case 'router-input':
    case 'variables-input':
    case 'messages-input':
    case 'webhook-config':
    case 'workflow-input-mapper':
    case 'input-mapping':
    case 'knowledge-tag-filters':
    case 'document-tag-entry':
      // All code/JSON-shaped fields render through CodeMirror. The language
      // comes from the SubBlockConfig (`language: 'javascript' | 'json' |
      // 'python'`); default is javascript.
      return (
        <CodeEditor
          language={sub.language || (sub.type === 'code' ? 'javascript' : 'json')}
          value={defaultValue}
          onChange={(v) => set(v)}
          placeholder={sub.placeholder || '// JSON or code...'}
          minHeight="160px"
        />
      )

    case 'dropdown':
    case 'combobox':
      return (
        <StyledSelect
          value={defaultValue ?? ''}
          options={options || []}
          placeholder={sub.placeholder}
          onChange={(nextValue) => {
            set(nextValue)
            if (sub.id === 'model' && nextValue) {
              void changeRuntimeProvider({
                provider: getConfiguredProviderForModel(nextValue) || undefined,
                model: nextValue,
              }).then((config) => useLlmConfigStore.getState().setConfig(config)).catch(() => {})
            }
          }}
        />
      )

    case 'switch':
      return (
        <label className="bs-switch">
          <input type="checkbox" checked={Boolean(defaultValue)} onChange={(e) => set(e.target.checked)} />
          <span />
        </label>
      )

    case 'slider':
      return (
        <div className="bs-slider-row">
          <input
            type="range"
            min={sub.min ?? 0}
            max={sub.max ?? 1}
            step={sub.step ?? (sub.integer ? 1 : 0.01)}
            value={Number(defaultValue ?? sub.min ?? 0)}
            onChange={(e) => set(Number.parseFloat(e.target.value))}
          />
          <span className="bs-slider-value">{Number(defaultValue ?? 0)}</span>
        </div>
      )

    case 'checkbox-list':
    case 'grouped-checkbox-list': {
      const arr = Array.isArray(defaultValue) ? defaultValue : []
      return (
        <div className="bs-checklist">
          {(options || []).map((o) => (
            <label key={o.id} className="bs-checklist-row">
              <input
                type="checkbox"
                checked={arr.includes(o.id)}
                onChange={(e) => {
                  const next = e.target.checked ? [...arr, o.id] : arr.filter((x) => x !== o.id)
                  set(next)
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )
    }

    case 'table': {
      const rows = Array.isArray(defaultValue) ? defaultValue : []
      const cols = sub.columns || ['Key', 'Value']
      return (
        <div className="bs-table">
          <div className="bs-table-head">
            {cols.map((c) => (
              <div key={c}>{c}</div>
            ))}
            <div />
          </div>
          {rows.map((row, i) => (
            <div className="bs-table-row" key={i}>
              {cols.map((c, j) => (
                <input
                  key={c}
                  className="bs-input"
                  value={row[j] || ''}
                  onChange={(e) => {
                    const next = rows.map((r, ri) => (ri === i ? r.map((cell, ci) => (ci === j ? e.target.value : cell)) : r))
                    set(next)
                  }}
                />
              ))}
              <button className="bs-btn-ghost" onClick={() => set(rows.filter((_, ri) => ri !== i))}>
                ×
              </button>
            </div>
          ))}
          <button className="bs-btn-ghost" onClick={() => set([...rows, cols.map(() => '')])}>
            + Add row
          </button>
        </div>
      )
    }

    case 'skill-picker': {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const skills = useWorkspaceStore((s) => s.skills || [])
      return <SkillPickerChip skills={skills} value={defaultValue} onChange={set} placeholder={sub.placeholder} />
    }

    case 'skill-input': {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const skills = useWorkspaceStore((s) => s.skills || [])
      return <MultiSkillPickerChip skills={skills} value={defaultValue} onChange={set} />
    }

    case 'tool-input':
      return (
        <div className="bs-hint">
          Attach tools via JSON (list of IDs).
          <textarea
            className="bs-code"
            rows={4}
            value={typeof defaultValue === 'string' ? defaultValue : JSON.stringify(defaultValue || [], null, 2)}
            onChange={(e) => set(e.target.value)}
          />
        </div>
      )

    case 'file-upload':
      return (
        <input
          type="file"
          className="bs-input"
          multiple={sub.multiple}
          accept={sub.acceptedTypes}
          onChange={(e) => set(Array.from(e.target.files || []).map((f) => ({ name: f.name, size: f.size, type: f.type })))}
        />
      )

    case 'schedule-info':
    case 'time-input':
      return (
        <input
          type="datetime-local"
          className="bs-input"
          value={defaultValue ?? ''}
          onChange={(e) => set(e.target.value)}
        />
      )

    case 'json-preview':
      return <JsonPreviewInspector nodeId={nodeId} />

    default:
      return <div className="bs-hint">Unsupported subBlock type: {sub.type}</div>
  }
}

function JsonPreviewInspector({ nodeId }) {
  const lastOutput = useWorkflowStore((s) => s.lastOutputs?.[nodeId])
  if (lastOutput == null) {
    return (
      <div className="bs-json-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        <span style={{ color: '#475569', fontSize: 12, fontStyle: 'italic' }}>No run output yet. Run the workflow to see the preview.</span>
      </div>
    )
  }
  // Plain strings: render as preformatted text with the json-string colour so
  // it doesn't accidentally get wrapped in a JsonView object explorer.
  if (typeof lastOutput === 'string') {
    return (
      <div className="bs-json-wrap bs-json-wrap-wordwrap" style={{ flex: '1 1 auto' }}>
        <pre className="bs-preview-plain-text">{lastOutput}</pre>
      </div>
    )
  }
  return (
    <div className="bs-json-wrap bs-json-wrap-wordwrap" style={{ flex: '1 1 auto' }}>
      <JsonView value={lastOutput} />
    </div>
  )
}

function safeCall(fn) {
  try {
    return fn()
  } catch {
    return []
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Multi-skill picker — for agent blocks that store an array of skill IDs    */
/* ─────────────────────────────────────────────────────────────────────────── */

function MultiSkillPickerChip({ skills, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Parse current value into an array of IDs
  const selectedIds = (() => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string' && value.trim()) {
      try { return JSON.parse(value) } catch { return [] }
    }
    return []
  })()

  const emit = (ids) => onChange(JSON.stringify(ids))

  const remove = (id) => emit(selectedIds.filter((x) => x !== id))
  const add = (id) => { if (!selectedIds.includes(id)) emit([...selectedIds, id]) }

  useEffect(() => {
    if (!open) return
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  const available = skills.filter((s) => !selectedIds.includes(s.id))

  return (
    <div ref={ref} className="bs-multi-skill-picker">
      {selectedIds.length > 0 && (
        <div className="bs-multi-skill-chips">
          {selectedIds.map((id) => {
            const sk = skills.find((s) => s.id === id)
            return (
              <span key={id} className="bs-skill-chip-badge">
                <span className="bs-skill-chip-icon">⚡</span>
                <span className="bs-skill-chip-name">{sk ? sk.name : id}</span>
                {sk?.language && <span className="bs-skill-chip-lang">{sk.language}</span>}
                <button
                  className="bs-skill-chip-remove"
                  onClick={() => remove(id)}
                  title="Remove"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </span>
            )
          })}
        </div>
      )}
      <button
        className="bs-skill-chip-empty"
        onClick={() => setOpen((o) => !o)}
        disabled={available.length === 0 && selectedIds.length > 0 && skills.length > 0 && available.length === 0}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {selectedIds.length === 0 ? 'Select skill' : 'Add skill'}
      </button>
      {open && (
        <div className="bs-skill-chip-popover">
          {skills.length === 0 ? (
            <div className="bs-skill-chip-empty-msg">No skills defined yet</div>
          ) : available.length === 0 ? (
            <div className="bs-skill-chip-empty-msg">All skills added</div>
          ) : (
            available.map((sk) => (
              <button
                key={sk.id}
                className="bs-skill-chip-option"
                onClick={() => { add(sk.id); setOpen(false) }}
              >
                <span className="bs-skill-chip-icon">⚡</span>
                <span className="bs-skill-chip-option-name">{sk.name}</span>
                {sk.language && <span className="bs-skill-chip-lang">{sk.language}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Skill picker chip — single-skill variant for the Skill block inspector   */
/* ─────────────────────────────────────────────────────────────────────────── */

function SkillPickerChip({ skills, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = skills.find((s) => s.id === value) || null

  useEffect(() => {
    if (!open) return
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  return (
    <div ref={ref} className="bs-skill-picker-chip">
      {selected ? (
        <div className="bs-skill-chip-row">
          <span className="bs-skill-chip-badge">
            <span className="bs-skill-chip-icon">⚡</span>
            <span className="bs-skill-chip-name">{selected.name}</span>
            {selected.language && <span className="bs-skill-chip-lang">{selected.language}</span>}
          </span>
          <button
            className="bs-skill-chip-change"
            onClick={() => setOpen((o) => !o)}
            title="Change skill"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path d="M17.5 2.5a2.12 2.12 0 0 1 3 3L12 14l-4 1 1-4 7.5-7.5z"/>
            </svg>
          </button>
          <button
            className="bs-skill-chip-remove"
            onClick={() => onChange(null)}
            title="Remove skill"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ) : (
        <button className="bs-skill-chip-empty" onClick={() => setOpen((o) => !o)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {placeholder || 'Select skill'}
        </button>
      )}
      {open && (
        <div className="bs-skill-chip-popover">
          {skills.length === 0 ? (
            <div className="bs-skill-chip-empty-msg">No skills defined yet</div>
          ) : (
            skills.map((sk) => (
              <button
                key={sk.id}
                className={`bs-skill-chip-option${sk.id === value ? ' is-selected' : ''}`}
                onClick={() => { onChange(sk.id); setOpen(false) }}
              >
                <span className="bs-skill-chip-icon">⚡</span>
                <span className="bs-skill-chip-option-name">{sk.name}</span>
                {sk.language && <span className="bs-skill-chip-lang">{sk.language}</span>}
                {sk.id === value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ marginLeft: 'auto', color: '#818cf8', flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------- */
/* MCP selectors — backed by the live convengine MCP registry via useMcpStore */
/* ------------------------------------------------------------------------- */

function McpServerSelector({ value, onChange, placeholder }) {
  const servers = useMcpStore((s) => s.servers)
  const loading = useMcpStore((s) => s.loading)
  const ensureLoaded = useMcpStore((s) => s.ensureLoaded)

  useEffect(() => { ensureLoaded() }, [ensureLoaded])

  const serverOptions = servers.map((s) => ({
    id: s.id,
    label: `${s.name || s.id}${s.transport ? ` (${s.transport.toLowerCase()})` : ''}`,
  }))
  const options = value
    ? [{ id: '', label: '— Clear selection —' }, ...serverOptions]
    : serverOptions

  return (
    <StyledSelect
      value={value ?? ''}
      placeholder={loading ? 'Loading…' : (placeholder || 'Select an MCP server')}
      options={options}
      onChange={onChange}
    />
  )
}

/**
 * Dynamic arguments editor for an MCP tool call.
 *
 * When a server + tool are selected we look up the tool's {@code inputSchema}
 * from the store and:
 *   1. render a read-only hint summarizing the expected parameters (so the
 *      user doesn't have to guess shapes);
 *   2. if the field is currently empty, prefill it with a skeleton object
 *      containing each required property keyed to a type-appropriate default.
 *
 * Editing happens in the JSON tree editor (same as `response-format`), so
 * structure mistakes are caught at author time.
 */
function McpArgsEditor({ value, onChange, serverId, toolName }) {
  const tools = useMcpStore((s) => (serverId ? s.toolsByServer[serverId] : null))
  const loadTools = useMcpStore((s) => s.loadTools)

  useEffect(() => {
    if (serverId && !tools) loadTools(serverId)
  }, [serverId, tools, loadTools])

  const tool = (tools || []).find((t) => t.name === toolName)
  const schema = tool?.inputSchema

  // Seed an empty value from the schema the first time a tool is picked so the
  // tree editor has something to chew on. We only auto-fill if the field is
  // empty/null — never clobber user edits.
  useEffect(() => {
    if (!schema) return
    const isEmpty = value == null || value === '' || value === '{}'
    if (!isEmpty) return
    const skeleton = skeletonFromSchema(schema)
    if (skeleton && Object.keys(skeleton).length > 0) {
      onChange(JSON.stringify(skeleton, null, 2))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, toolName])

  return (
    <div className="bs-mcp-args">
      {!serverId || !toolName ? (
        <div className="bs-hint">Pick a server and tool first.</div>
      ) : (
        <>
          {schema && <McpSchemaHint schema={schema} />}
          <JsonEditor
            value={value}
            onChange={onChange}
            defaultMode="tree"
            height="240px"
          />
        </>
      )}
    </div>
  )
}

function McpSchemaHint({ schema }) {
  const props = schema?.properties || {}
  const required = new Set(schema?.required || [])
  const entries = Object.entries(props)
  if (entries.length === 0) return null
  return (
    <div className="bs-mcp-schema-hint">
      <div className="bs-mcp-schema-title">Expected arguments</div>
      <table className="bs-mcp-schema-table">
        <tbody>
          {entries.map(([name, spec]) => (
            <tr key={name}>
              <td className="bs-mcp-schema-key">
                <code>{name}</code>{required.has(name) && <span className="bs-mcp-req">*</span>}
              </td>
              <td className="bs-mcp-schema-type"><code>{spec?.type || 'any'}</code></td>
              <td className="bs-mcp-schema-desc">{spec?.description || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Build a plausible default object from a JSON Schema's `required` list. */
function skeletonFromSchema(schema) {
  const out = {}
  const props = schema?.properties || {}
  const required = schema?.required || []
  for (const name of required) {
    const spec = props[name] || {}
    out[name] = defaultForType(spec)
  }
  return out
}
function defaultForType(spec) {
  if (spec.default !== undefined) return spec.default
  switch (spec.type) {
    case 'string':  return ''
    case 'number':
    case 'integer': return 0
    case 'boolean': return false
    case 'array':   return []
    case 'object':  return {}
    default:        return null
  }
}

function McpToolSelector({ value, onChange, placeholder, serverId }) {
  const tools = useMcpStore((s) => (serverId ? s.toolsByServer[serverId] : null))
  const loadTools = useMcpStore((s) => s.loadTools)

  useEffect(() => {
    if (!serverId) return
    if (!tools) loadTools(serverId)
  }, [serverId, tools, loadTools])

  if (!serverId) {
    return <div className="bs-hint">Pick an MCP server first.</div>
  }

  const list = tools || []
  const toolOptions = list.map((t) => ({
    id: t.name,
    label: t.name + (t.description ? ` — ${t.description.slice(0, 55)}` : ''),
  }))
  const options = value
    ? [{ id: '', label: '— Clear selection —' }, ...toolOptions]
    : toolOptions

  return (
    <div className="bs-mcp-tool-picker">
      <StyledSelect
        value={value ?? ''}
        placeholder={tools == null ? 'Loading tools…' : (placeholder || 'Select a tool')}
        options={options}
        onChange={onChange}
      />
      <button
        type="button"
        className="bs-btn-ghost bs-mcp-refresh"
        title="Re-fetch tool list"
        onClick={() => loadTools(serverId, { refresh: true })}
      >
        ⟳
      </button>
    </div>
  )
}
