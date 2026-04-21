/**
 * MiniCalendar — SwiftUI-inspired date/datetime picker.
 *
 * Props:
 *   value      — ISO date string "YYYY-MM-DD" or "" (controlled)
 *   onChange   — (isoString: string) => void
 *   disabled   — boolean
 *   showTime   — boolean  (datetime mode)
 *   dateFormat — "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY"  (display only)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function pad(n) { return String(n).padStart(2, '0') }

function parseISO(val) {
  if (!val) return null
  const d = new Date(val + (val.includes('T') ? '' : 'T00:00:00'))
  return isNaN(d) ? null : d
}

function toISO(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

function formatDisplay(isoDate, fmt) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  switch (fmt) {
    case 'MM/DD/YYYY': return `${m}/${d}/${y}`
    case 'DD/MM/YYYY': return `${d}/${m}/${y}`
    default: return isoDate
  }
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function MiniCalendar({ value, onChange, disabled, showTime = false, dateFormat = 'YYYY-MM-DD' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const parsed = parseISO(value)
  const today = new Date()

  const [view, setView] = useState(() => ({
    year: parsed ? parsed.getFullYear() : today.getFullYear(),
    month: parsed ? parsed.getMonth() : today.getMonth(),
  }))

  // time state (only used in datetime mode)
  const [time, setTime] = useState(() => {
    if (parsed) return { h: parsed.getHours(), m: parsed.getMinutes() }
    return { h: 0, m: 0 }
  })

  // sync view when external value changes
  useEffect(() => {
    if (parsed) {
      setView({ year: parsed.getFullYear(), month: parsed.getMonth() })
      setTime({ h: parsed.getHours(), m: parsed.getMinutes() })
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectDay = useCallback((d) => {
    const iso = toISO(view.year, view.month, d)
    if (showTime) {
      onChange(`${iso}T${pad(time.h)}:${pad(time.m)}`)
    } else {
      onChange(iso)
      setOpen(false)
    }
  }, [view, time, showTime, onChange])

  const prevMonth = () => setView((v) => {
    if (v.month === 0) return { year: v.year - 1, month: 11 }
    return { year: v.year, month: v.month - 1 }
  })
  const nextMonth = () => setView((v) => {
    if (v.month === 11) return { year: v.year + 1, month: 0 }
    return { year: v.year, month: v.month + 1 }
  })

  const cells = useMemo(() => {
    const total = daysInMonth(view.year, view.month)
    const start = firstDayOfMonth(view.year, view.month)
    const arr = []
    for (let i = 0; i < start; i++) arr.push(null)
    for (let d = 1; d <= total; d++) arr.push(d)
    return arr
  }, [view])

  const selectedDay = parsed && parsed.getFullYear() === view.year && parsed.getMonth() === view.month
    ? parsed.getDate() : null

  const todayDay = today.getFullYear() === view.year && today.getMonth() === view.month
    ? today.getDate() : null

  const displayVal = value
    ? (showTime
        ? (() => {
            const iso = value.split('T')[0]
            const t = value.split('T')[1]?.slice(0, 5) || ''
            return `${formatDisplay(iso, dateFormat)}${t ? ' ' + t : ''}`
          })()
        : formatDisplay(value.split('T')[0], dateFormat))
    : ''

  const onTimeChange = (field, val) => {
    const newTime = { ...time, [field]: Number(val) }
    setTime(newTime)
    const iso = value ? value.split('T')[0] : toISO(view.year, view.month, parsed?.getDate() || 1)
    onChange(`${iso}T${pad(newTime.h)}:${pad(newTime.m)}`)
  }

  return (
    <div className="mc-wrap nowheel" ref={ref}>
      <button
        type="button"
        className={`mc-trigger ${open ? 'is-open' : ''}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <svg className="mc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className={`mc-trigger-val ${!displayVal ? 'is-placeholder' : ''}`}>
          {displayVal || (dateFormat === 'MM/DD/YYYY' ? 'MM/DD/YYYY' : dateFormat === 'DD/MM/YYYY' ? 'DD/MM/YYYY' : 'YYYY-MM-DD')}
        </span>
        {value && (
          <button
            type="button"
            className="mc-clear"
            onClick={(e) => { e.stopPropagation(); onChange('') }}
          >×</button>
        )}
      </button>

      {open && (
        <div className="mc-popover nowheel">
          {/* Month header */}
          <div className="mc-header">
            <button type="button" className="mc-nav" onClick={prevMonth}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="mc-month-label">{MONTHS[view.month]} {view.year}</span>
            <button type="button" className="mc-nav" onClick={nextMonth}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="mc-grid">
            {DAYS.map((d) => (
              <div key={d} className="mc-dow">{d}</div>
            ))}
            {cells.map((day, i) => (
              day === null
                ? <div key={`e${i}`} />
                : (
                  <button
                    type="button"
                    key={day}
                    className={[
                      'mc-day',
                      day === selectedDay ? 'is-selected' : '',
                      day === todayDay && day !== selectedDay ? 'is-today' : '',
                    ].join(' ')}
                    onClick={() => selectDay(day)}
                  >
                    {day}
                  </button>
                )
            ))}
          </div>

          {/* Time row (datetime mode) */}
          {showTime && (
            <div className="mc-time-row">
              <span className="mc-time-label">Time</span>
              <input
                className="mc-time-input"
                type="number"
                min={0} max={23}
                value={pad(time.h)}
                onChange={(e) => onTimeChange('h', Math.max(0, Math.min(23, Number(e.target.value))))}
              />
              <span className="mc-time-sep">:</span>
              <input
                className="mc-time-input"
                type="number"
                min={0} max={59}
                value={pad(time.m)}
                onChange={(e) => onTimeChange('m', Math.max(0, Math.min(59, Number(e.target.value))))}
              />
              <button type="button" className="mc-time-ok" onClick={() => setOpen(false)}>Done</button>
            </div>
          )}

          {/* Today shortcut */}
          <div className="mc-footer">
            <button type="button" className="mc-today-btn" onClick={() => {
              const t = new Date()
              setView({ year: t.getFullYear(), month: t.getMonth() })
              selectDay(t.getDate())
            }}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}
