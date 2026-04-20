/**
 * StyledSelect — themed floating-menu dropdown, used everywhere native
 * <select> would be. Keeps brand accent colors and both light/dark themes.
 *
 * Props:
 *   value      — currently selected option id (string)
 *   options    — [{ id, label }]
 *   onChange   — (id: string) => void
 *   placeholder — shown when nothing is selected
 *   className  — extra class on the wrapper
 */
import { useEffect, useRef, useState } from 'react'

export default function StyledSelect({ value, options = [], onChange, placeholder, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // If the stored value isn't in the list, show it verbatim so it's never lost.
  const selected = options.find((o) => o.id === value) || (value ? { id: value, label: value } : null)

  useEffect(() => {
    if (!open) return
    function onOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  return (
    <div ref={ref} className={`bs-styled-select ${className}`}>
      <button
        type="button"
        className={`bs-styled-select-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`bs-styled-select-value ${!selected ? 'is-placeholder' : ''}`}>
          {selected ? selected.label : (placeholder || 'Select…')}
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

      {open && (
        <div className="bs-styled-select-menu">
          {options.length === 0 ? (
            <div className="bs-styled-select-empty">No options</div>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`bs-styled-select-option ${o.id === value ? 'is-active' : ''}`}
                onClick={() => { onChange(o.id); setOpen(false) }}
              >
                <span className="bs-styled-select-option-label">{o.label}</span>
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
        </div>
      )}
    </div>
  )
}
