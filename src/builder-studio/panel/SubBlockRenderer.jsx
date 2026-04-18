/**
 * SubBlock renderer — renders a SubBlockConfig as an inspector control.
 *
 * Handles every SubBlockType value present in sim's types.ts. Types that
 * require dedicated selector UIs (file-selector, channel-selector, etc.)
 * fall back to a short-input so the field is still editable; the shape is
 * preserved so serialization stays compatible with sim's tool runners.
 */
import { useCallback } from 'react'
import CodeEditor from '../components/CodeEditor'
import JsonEditor from '../components/JsonEditor'

export default function SubBlockRenderer({ sub, value, onChange, blockValues }) {
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
    case 'mcp-server-selector':
    case 'mcp-tool-selector':
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
      // JSON-schema authoring → tree editor with text fallback. Edits stay
      // as a stringified JSON in subBlockValues so the backend contract is
      // unchanged.
      return (
        <JsonEditor
          value={defaultValue}
          onChange={(text) => set(text)}
          defaultMode="tree"
          height="260px"
        />
      )

    case 'code':
    case 'mcp-dynamic-args':
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
          onChange={(e) => set(e.target.value)}
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

    default:
      return <div className="bs-hint">Unsupported subBlock type: {sub.type}</div>
  }
}

function safeCall(fn) {
  try {
    return fn()
  } catch {
    return []
  }
}
