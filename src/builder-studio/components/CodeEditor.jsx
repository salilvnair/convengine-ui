/**
 * CodeMirror 6 wrapper used across the builder studio for any multi-line
 * code/JSON input. Swaps out the plain <textarea.bs-code> with proper syntax
 * highlighting, bracket matching, auto-indent, line numbers and the
 * `one-dark` theme so the editor actually reads like an editor.
 *
 * Usage:
 *   <CodeEditor language="javascript" value={src} onChange={setSrc} />
 *   <CodeEditor language="json" value={schema} onChange={setSchema} minHeight="240px" />
 *
 * Language is auto-normalized: 'js' -> javascript, 'py' -> python, etc.
 */
import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'

function resolveLanguage(lang) {
  const key = String(lang || '').toLowerCase()
  if (key === 'js' || key === 'javascript' || key === 'ts' || key === 'typescript') return javascript({ jsx: false, typescript: key.startsWith('t') })
  if (key === 'json' || key === 'jsonschema') return json()
  if (key === 'py' || key === 'python') return python()
  return javascript()
}

export default function CodeEditor({
  value,
  onChange,
  language = 'javascript',
  minHeight = '160px',
  maxHeight,
  placeholder,
  readOnly = false,
  className = '',
}) {
  const extensions = useMemo(() => [resolveLanguage(language)], [language])

  return (
    <div className={`bs-cm ${className}`}>
      <CodeMirror
        value={typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2)}
        minHeight={minHeight}
        maxHeight={maxHeight}
        theme={oneDark}
        extensions={extensions}
        readOnly={readOnly}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          indentOnInput: true,
          tabSize: 2,
        }}
        onChange={(v) => onChange?.(v)}
      />
    </div>
  )
}
