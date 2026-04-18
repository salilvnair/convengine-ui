/**
 * Lightweight right-click context menu. Renders a floating item list at the
 * cursor in viewport coordinates.
 *
 * Rendered through a React portal to {@code document.body} because callers
 * (notably {@code WorkflowNode} inside the ReactFlow viewport) live under
 * ancestors that apply a {@code transform}. Per CSS spec, a transformed
 * ancestor becomes the containing block for {@code position: fixed}
 * descendants — so without the portal, the menu would snap to the
 * transformed frame instead of the viewport cursor position.
 *
 * Dismissal: click outside, Escape, or any action selection.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  // Measure after first paint so we can clamp using the real size rather
  // than a guessed height (items may wrap).
  const [pos, setPos] = useState(() => clamp(x, y, 200, items.length * 32 + 8))

  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(clamp(x, y, rect.width, rect.height))
  }, [x, y])

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    function onScroll() { onClose() }
    function onGlobalClose() { onClose() }
    // Close on any click or right-click outside the menu
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('contextmenu', onDocClick)
    document.addEventListener('keydown', onKey)
    // Global event: another context menu is opening, close this one
    window.addEventListener('bs:close-context-menus', onGlobalClose)
    // If anything scrolls under the menu (canvas pan, panel scroll), close it.
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('contextmenu', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('bs:close-context-menus', onGlobalClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const menu = (
    <div
      ref={ref}
      className="bs-ctxmenu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="bs-ctxmenu-sep" />
        ) : (
          <button
            key={it.id || i}
            role="menuitem"
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

  // Portal to body so we escape any transformed ancestor (ReactFlow viewport)
  // and so stacking-context battles with the canvas / inspector disappear.
  if (typeof document === 'undefined') return null
  return createPortal(menu, document.body)
}

function clamp(x, y, w, h) {
  const pad = 8
  const left = Math.max(pad, Math.min(x, window.innerWidth - w - pad))
  const top = Math.max(pad, Math.min(y, window.innerHeight - h - pad))
  return { left, top }
}
