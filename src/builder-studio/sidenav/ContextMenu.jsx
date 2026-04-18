/**
 * Lightweight right-click context menu. Renders a fixed-position floating
 * list of items at the cursor. Click outside, Escape, or action selection
 * dismisses it. No portal, no dependencies — keeps the builder self-contained.
 */
import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp inside viewport
  const W = 200, H = items.length * 32 + 8
  const left = Math.min(x, window.innerWidth - W - 8)
  const top = Math.min(y, window.innerHeight - H - 8)

  return (
    <div
      ref={ref}
      className="bs-ctxmenu"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="bs-ctxmenu-sep" />
        ) : (
          <button
            key={it.id || i}
            className={`bs-ctxmenu-item ${it.danger ? 'is-danger' : ''}`}
            onClick={() => { it.onSelect?.(); onClose() }}
            disabled={it.disabled}
          >
            {it.icon ? <it.icon className="bs-ico-xs" /> : <span className="bs-ico-xs" />}
            <span className="bs-ctxmenu-label">{it.label}</span>
            {it.shortcut && <span className="bs-ctxmenu-kbd">{it.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}
