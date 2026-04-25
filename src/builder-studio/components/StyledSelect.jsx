/**
 * StyledSelect — themed floating-menu dropdown, used everywhere native
 * <select> would be. Keeps brand accent colors and both light/dark themes.
 *
 * Props:
 *   value      — currently selected option id (string)
 *   options    — [{ id, label, icon?: ReactElement, badge?: ReactElement }]
 *   onChange   — (id: string) => void
 *   placeholder — shown when nothing is selected
 *   className  — extra class on the wrapper
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function StyledSelect({ value, options = [], onChange, placeholder, className = '', iconSize = 16, menuMinWidth = 0 }) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState({})
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  // If the stored value isn't in the list, show it verbatim so it's never lost.
  const selected = options.find((o) => o.id === value) || (value ? { id: value, label: value } : null)

  // Position the portal menu relative to the trigger button
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const menuH = Math.min(240, options.length * 36 + 8)
    const spaceBelow = viewportH - r.bottom
    const goUp = spaceBelow < menuH + 8 && r.top > menuH + 8
    setMenuStyle({
      position: 'fixed',
      top: goUp ? r.top - menuH - 4 : r.bottom + 4,
      left: r.left,
      minWidth: Math.max(r.width, menuMinWidth),
      width: 'max-content',
      zIndex: 99999,
    })
  }, [open, options.length])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onOut(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  // Close on scroll (so menu doesn't float away)
  useEffect(() => {
    if (!open) return
    const onScroll = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  return (
    <div ref={triggerRef} className={`bs-styled-select nowheel ${className}`}>
      <button
        type="button"
        className={`bs-styled-select-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`bs-styled-select-value ${!selected ? 'is-placeholder' : ''}`}>
          {selected?.icon && (
            <span className="bs-styled-select-opt-icon" style={{ width: iconSize, height: iconSize }}>
              {selected.icon}
            </span>
          )}
          {selected ? selected.label : (placeholder || 'Select…')}
          {selected?.badge && <span className="bs-styled-select-opt-badge">{selected.badge}</span>}
        </span>
        <svg
          className="bs-styled-select-chevron"
          width="12"
          height="7"
          viewBox="0 0 12 7"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && createPortal(
        <div ref={menuRef} className="bs-styled-select-menu nowheel" style={menuStyle}>
          {options.length === 0 ? (
            <div className="bs-styled-select-empty">No options</div>
          ) : (
            options.map((o) => (
              <button
                key={o.id || '__clear__'}
                type="button"
                className={`bs-styled-select-option ${o.id === value ? 'is-active' : ''} ${o.id === '' ? 'is-clear' : ''}`}
                onClick={() => { onChange(o.id); setOpen(false) }}
              >
                {o.icon && (
                  <span className="bs-styled-select-opt-icon" style={{ width: iconSize, height: iconSize }}>
                    {o.icon}
                  </span>
                )}
                <span className="bs-styled-select-option-label">{o.label}</span>
                {o.badge && <span className="bs-styled-select-opt-badge">{o.badge}</span>}
                {o.id === value && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    aria-hidden="true"
                    style={{ flexShrink: 0, color: 'var(--bs-dropdown-check-color, var(--bs-accent))' }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
