/**
 * Slim JSON editor — CodeMirror-based JSON editing with inline linting and a
 * Format button. Replaces the heavy vanilla-jsoneditor tree editor with a
 * clean, fast approach that reuses the CodeMirror stack already bundled by
 * CodeEditor.
 *
 * Features:
 *  - CodeMirror 6 JSON syntax highlighting + bracket matching
 *  - Inline parse-error bar (yellow) shown below the editor
 *  - Format / pretty-print button in the toolbar
 *  - Fully controlled: accepts string `value`, fires `onChange(string)`
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import CodeEditor from './CodeEditor'

function tryParse(text) {
  if (!text || !text.trim()) return { ok: true, error: null }
  try { JSON.parse(text); return { ok: true, error: null } }
  catch (e) { return { ok: false, error: e.message } }
}

function normalize(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch { return '' }
}

export default function JsonEditor({
  value,
  onChange,
  readOnly = false,
  // defaultMode kept for API compat but ignored (always text/code view)
  // eslint-disable-next-line no-unused-vars
  defaultMode,
  height,
  className = '',
  placeholder = '{}',
}) {
  const [localValue, setLocalValue] = useState(() => normalize(value))
  const [parseError, setParseError] = useState(() => tryParse(normalize(value)).error)
  const lastEmittedRef = useRef(normalize(value))

  // Sync external value changes in without clobbering active edits
  useEffect(() => {
    const next = normalize(value)
    if (next !== lastEmittedRef.current) {
      setLocalValue(next)
      setParseError(tryParse(next).error)
    }
  }, [value])

  const handleChange = useCallback((text) => {
    setLocalValue(text)
    setParseError(tryParse(text).error)
    lastEmittedRef.current = text
    onChange?.(text)
  }, [onChange])

  const handleFormat = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(localValue), null, 2)
      setLocalValue(formatted)
      setParseError(null)
      lastEmittedRef.current = formatted
      onChange?.(formatted)
    } catch { /* already invalid — don't format */ }
  }, [localValue, onChange])

  return (
    <div className={`bs-slim-json-editor ${className}`}>
      <div className="bs-slim-json-header">
        {!readOnly && (
          <button
            type="button"
            className="bs-slim-json-fmt-btn"
            onClick={handleFormat}
            title="Format JSON (pretty-print)"
            disabled={!!parseError || !localValue.trim()}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 7 4 4 20 4 20 7"/>
              <line x1="9" y1="20" x2="15" y2="20"/>
              <line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
            Format
          </button>
        )}
        {parseError && (
          <span className="bs-slim-json-err-badge" title={parseError}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Invalid JSON
          </span>
        )}
      </div>
      <div className={`bs-slim-json-body ${parseError ? 'has-error' : ''}`}>
        <CodeEditor
          language="json"
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          readOnly={readOnly}
          minHeight={height || '160px'}
          maxHeight={height || '400px'}
        />
      </div>
      {parseError && (
        <div className="bs-slim-json-errmsg">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {parseError}
        </div>
      )}
    </div>
  )
}
