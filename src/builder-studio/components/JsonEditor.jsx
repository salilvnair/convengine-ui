/**
 * JSON editor with a proper tree view + text mode toggle.
 *
 * Backed by `vanilla-jsoneditor` (the modern successor to `jsoneditor` by
 * josdejong, zero-jQuery, ES module). It gives us:
 *
 *   - tree mode: expand/collapse nodes, inline-edit keys/values, add/remove
 *     entries via the hover menu on each node. Ideal for editing a response
 *     schema visually.
 *   - text mode: raw JSON with syntax highlight + parse errors surfaced.
 *   - transform / query are disabled to keep the footprint small.
 *
 * The editor stores values as strings in the subBlockValues map (so the
 * existing serialization is untouched). If the incoming value isn't valid
 * JSON we fall back to the text view automatically.
 */
import { useEffect, useRef } from 'react'
import { JSONEditor, Mode } from 'vanilla-jsoneditor'

export default function JsonEditor({
  value,
  onChange,
  readOnly = false,
  defaultMode = 'tree', // 'tree' | 'text'
  height = '420px',
  className = '',
}) {
  const holderRef = useRef(null)
  const editorRef = useRef(null)
  const lastEmittedRef = useRef(null)

  useEffect(() => {
    if (!holderRef.current) return
    const initialText = normalizeToText(value)
    editorRef.current = new JSONEditor({
      target: holderRef.current,
      props: {
        content: { text: initialText },
        readOnly,
        mode: defaultMode === 'text' ? Mode.text : Mode.tree,
        mainMenuBar: true,
        navigationBar: false,
        statusBar: true,
        askToFormat: false,
        onChange: (content /*, previous, status */) => {
          const out = 'text' in content ? content.text : JSON.stringify(content.json)
          lastEmittedRef.current = out
          onChange?.(out)
        },
      },
    })
    return () => {
      editorRef.current?.destroy?.()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push external value changes in (but don't loop when the change originated here).
  useEffect(() => {
    if (!editorRef.current) return
    const next = normalizeToText(value)
    if (next === lastEmittedRef.current) return
    editorRef.current.update({ text: next })
  }, [value])

  return (
    <div
      ref={holderRef}
      className={`bs-jsoneditor jse-theme-dark ${className}`}
      style={{ height }}
    />
  )
}

function normalizeToText(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
