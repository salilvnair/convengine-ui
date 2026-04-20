/**
 * SubBlock renderer — renders a SubBlockConfig as an inspector control.
 *
 * Handles every SubBlockType value present in sim's types.ts. Types that
 * require dedicated selector UIs (file-selector, channel-selector, etc.)
 * fall back to a short-input so the field is still editable; the shape is
 * preserved so serialization stays compatible with sim's tool runners.
 */
import { useCallback, useEffect } from 'react'
import CodeEditor from '../components/CodeEditor'
import JsonEditor from '../components/JsonEditor'
import FullscreenWrapper from '../components/FullscreenWrapper'
import { changeRuntimeProvider } from '../api/llm-provider-client'
import { useMcpStore } from '../mcp/mcp-store'
import { useWorkflowStore } from '../stores/workflow-store'
import { getConfiguredProviderForModel, useLlmConfigStore } from '../stores/llm-config-store'
import JsonView from '../run/JsonView'

export default function SubBlockRenderer({ sub, value, onChange, blockValues, nodeId }) {
  const set = useCallback((v) => onChange(sub.id, v), [onChange, sub.id])
  const defaultValue =
    value !== undefined && value !== null
      ? value
      : typeof sub.value === 'function'
        ? sub.value(blockValues || {})
        : sub.defaultValue

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
      return (
        <input
          type={sub.password ? 'password' : 'text'}
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
        <select
          className="bs-input"
          value={defaultValue ?? ''}
          onChange={(e) => {
            const nextValue = e.target.value
            set(nextValue)
            if (sub.id === 'model' && nextValue) {
              void changeRuntimeProvider({
                provider: getConfiguredProviderForModel(nextValue) || undefined,
                model: nextValue,
              }).then((config) => useLlmConfigStore.getState().setConfig(config)).catch(() => {})
            }
          }}
        >
          {!defaultValue && <option value="">{sub.placeholder || 'Select...'}</option>}
          {(options || []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
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

    case 'tool-input':
    case 'skill-input':
      return (
        <div className="bs-hint">
          {sub.type === 'skill-input' ? 'Attach skills' : 'Attach tools'} via JSON (list of IDs).
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

/* ------------------------------------------------------------------------- */
/* MCP selectors — backed by the live convengine MCP registry via useMcpStore */
/* ------------------------------------------------------------------------- */

function McpServerSelector({ value, onChange, placeholder }) {
  const servers = useMcpStore((s) => s.servers)
  const loading = useMcpStore((s) => s.loading)
  const ensureLoaded = useMcpStore((s) => s.ensureLoaded)

  useEffect(() => { ensureLoaded() }, [ensureLoaded])

  return (
    <select
      className="bs-input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{loading ? 'Loading…' : (placeholder || 'Select an MCP server')}</option>
      {servers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name || s.id} {s.transport ? `(${s.transport.toLowerCase()})` : ''}
        </option>
      ))}
    </select>
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
  return (
    <div className="bs-mcp-tool-picker">
      <select
        className="bs-input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{tools == null ? 'Loading tools…' : (placeholder || 'Select a tool')}</option>
        {list.map((t) => (
          <option key={t.name} value={t.name} title={t.description || ''}>
            {t.name}{t.description ? ` — ${t.description.slice(0, 60)}` : ''}
          </option>
        ))}
      </select>
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
