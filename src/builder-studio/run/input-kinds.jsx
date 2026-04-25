/**
 * Core run-input kinds — JSX render functions for every built-in kind.
 *
 * This file is imported as a side-effect by input-registry.js.
 * Each call to registerRunInputKind() self-registers the kind into the
 * central registry so the RunPanel can render it without any switch/case.
 *
 * To add a new kind:
 *   1. registerRunInputKind('my-kind', { render, isEmpty?, validate?, coerce?, defaultValue? })
 *   2. Add 'my-kind' to user_input block's `kind` dropdown in blocks/user_input.js
 *   3. (optional) Add CSS in builder-studio.css
 *
 * render(props) receives:
 *   { value, onChange, placeholder, disabled, options, label, config }
 *   `config` is the full InputNode object (id, kind, min, max, step, accept, …)
 */
import { registerRunInputKind } from './input-registry'
import { useState } from 'react'
import MiniCalendar from '../components/MiniCalendar'
import StyledSelect from '../components/StyledSelect'
import JsonEditor from '../components/JsonEditor'

// ─── Password input with eye toggle ─────────────────────────────────
function PasswordInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false)
  return (
    <div className="bs-password-wrap">
      <input
        className="bs-input"
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder || '••••••••'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
      <button
        type="button"
        className="bs-password-eye"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  )
}

// ─── Text inputs ────────────────────────────────────────────────────

registerRunInputKind('short-text', {
  defaultValue: '',
  render: ({ value, onChange, placeholder, disabled }) => (
    <input className="bs-input" type="text" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
})

registerRunInputKind('long-text', {
  defaultValue: '',
  render: ({ value, onChange, placeholder, disabled }) => (
    <textarea className="bs-textarea" rows={3} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
})

registerRunInputKind('password', {
  defaultValue: '',
  render: ({ value, onChange, placeholder, disabled }) => (
    <PasswordInput value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
  ),
})

// ─── Typed text inputs ──────────────────────────────────────────────

registerRunInputKind('url', {
  defaultValue: '',
  validate: (v) => {
    if (!v) return null
    try { new URL(v); return null } catch { return 'Must be a valid URL' }
  },
  render: ({ value, onChange, placeholder, disabled }) => (
    <input className="bs-input" type="url" value={value} placeholder={placeholder || 'https://...'} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
})

registerRunInputKind('email', {
  defaultValue: '',
  validate: (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? 'Must be a valid email' : null,
  render: ({ value, onChange, placeholder, disabled }) => (
    <input className="bs-input" type="email" value={value} placeholder={placeholder || 'user@example.com'} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
})

registerRunInputKind('tel', {
  defaultValue: '',
  validate: (v) => {
    if (!v) return null
    const clean = v.replace(/[\s\-().+]/g, '')
    return /^\d{7,15}$/.test(clean) ? null : 'Must be a valid phone number'
  },
  render: ({ value, onChange, placeholder, disabled }) => (
    <input
      className="bs-input"
      type="tel"
      inputMode="tel"
      value={value}
      placeholder={placeholder || '+1 (555) 000-0000'}
      disabled={disabled}
      onChange={(e) => {
        // Allow only digits, spaces, dashes, parens, plus sign
        const filtered = e.target.value.replace(/[^\d\s\-().+]/g, '')
        onChange(filtered)
      }}
    />
  ),
})

// ─── Number / Range ─────────────────────────────────────────────────

registerRunInputKind('number', {
  defaultValue: '',
  isEmpty: (v) => v === '' || v == null,
  validate: (v) => (v !== '' && isNaN(Number(v))) ? 'Must be a number' : null,
  coerce: (v) => (v === '' ? '' : Number(v)),
  render: ({ value, onChange, placeholder, disabled, config }) => (
    <input className="bs-input" type="number" inputMode="numeric" value={value} placeholder={placeholder}
      disabled={disabled} min={config?.min} max={config?.max} step={config?.step ?? 'any'}
      onKeyDown={(e) => { if (['-','e','E','+'].includes(e.key) && !config?.allowSigned) e.preventDefault() }}
      onChange={(e) => onChange(e.target.value)} />
  ),
})

registerRunInputKind('range', {
  defaultValue: 50,
  isEmpty: () => false,
  coerce: (v) => Number(v),
  render: ({ value, onChange, disabled, config }) => {
    const min = config?.min ?? 0
    const max = config?.max ?? 100
    const step = config?.step ?? 1
    return (
      <div className="bs-range-wrap">
        <input type="range" className="bs-range" min={min} max={max} step={step}
          value={value ?? min} disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="bs-range-value">{value ?? min}</span>
      </div>
    )
  },
})

// ─── Selection inputs ───────────────────────────────────────────────

registerRunInputKind('dropdown', {
  defaultValue: '',
  render: ({ value, onChange, placeholder, disabled, options }) => {
    const opts = [{ id: '', label: placeholder || 'Select…' }, ...(options || []).map((opt) => ({
      id: typeof opt === 'object' ? String(opt.value ?? opt.id ?? opt.label) : String(opt),
      label: typeof opt === 'object' ? opt.label : opt,
    }))]
    return (
      <StyledSelect
        value={String(value ?? '')}
        options={opts}
        onChange={(id) => onChange(id === '' ? '' : id)}
        placeholder={placeholder || 'Select…'}
      />
    )
  },
})

registerRunInputKind('radio', {
  defaultValue: '',
  render: ({ value, onChange, disabled, options, config }) => (
    <div className="bs-radio-group">
      {(options || []).map((opt) => {
        const label = typeof opt === 'object' ? opt.label : opt
        const val = typeof opt === 'object' ? (opt.value ?? opt.id ?? opt.label) : opt
        return (
          <label key={val} className="bs-radio-item">
            <input type="radio" name={config?.id || 'radio'} value={val}
              checked={value === val} disabled={disabled} onChange={() => onChange(val)} />
            <span>{label}</span>
          </label>
        )
      })}
    </div>
  ),
})

// ─── Boolean inputs ─────────────────────────────────────────────────

registerRunInputKind('checkbox', {
  defaultValue: false,
  isEmpty: () => false,
  coerce: (v, node) => mapBooleanOutput(v, node),
  render: ({ value, onChange, disabled, config }) => (
    <label className="bs-checkbox-item">
      <input type="checkbox" checked={isCheckedValue(value, config)}
        disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{config?.label || ''}</span>
    </label>
  ),
})

registerRunInputKind('checkbox-group', {
  defaultValue: [],
  isEmpty: (v) => !Array.isArray(v) || v.length === 0,
  coerce: (v) => (Array.isArray(v) ? v : []),
  render: ({ value, onChange, disabled, options }) => {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="bs-checkbox-group">
        {(options || []).map((opt) => {
          const label = typeof opt === 'object' ? opt.label : opt
          const val = typeof opt === 'object' ? (opt.value ?? opt.id ?? opt.label) : opt
          const checked = selected.includes(val)
          return (
            <label key={val} className="bs-checkbox-item">
              <input type="checkbox" checked={checked} disabled={disabled}
                onChange={() => onChange(checked ? selected.filter((s) => s !== val) : [...selected, val])} />
              <span>{label}</span>
            </label>
          )
        })}
      </div>
    )
  },
})

registerRunInputKind('toggle', {
  defaultValue: false,
  isEmpty: () => false,
  coerce: (v, node) => mapBooleanOutput(v, node),
  render: ({ value, onChange, disabled }) => (
    <label className="bs-toggle">
      <input type="checkbox" checked={isCheckedValue(value)}
        disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="bs-toggle-track"><span className="bs-toggle-thumb" /></span>
      <span className="bs-toggle-label">{isCheckedValue(value) ? 'On' : 'Off'}</span>
    </label>
  ),
})

// ─── Date / Time ────────────────────────────────────────────────────

registerRunInputKind('date', {
  defaultValue: '',
  render: ({ value, onChange, disabled, config }) => (
    <MiniCalendar
      value={value}
      onChange={onChange}
      disabled={disabled}
      dateFormat={config?.dateFormat || 'YYYY-MM-DD'}
      showTime={false}
    />
  ),
})

registerRunInputKind('time', {
  defaultValue: '',
  render: ({ value, onChange, placeholder, disabled }) => (
    <input className="bs-input" type="time" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
})

registerRunInputKind('datetime', {
  defaultValue: '',
  render: ({ value, onChange, disabled, config }) => (
    <MiniCalendar
      value={value}
      onChange={onChange}
      disabled={disabled}
      dateFormat={config?.dateFormat || 'YYYY-MM-DD'}
      showTime={true}
    />
  ),
})

// ─── Special inputs ─────────────────────────────────────────────────

registerRunInputKind('color', {
  defaultValue: '#000000',
  isEmpty: () => false,
  render: ({ value, onChange, disabled }) => (
    <div className="bs-color-wrap">
      <input type="color" className="bs-color-swatch" value={value || '#000000'}
        disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <input type="text" className="bs-input bs-color-hex" value={value || '#000000'}
        disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="#000000" />
    </div>
  ),
})

registerRunInputKind('file', {
  defaultValue: null,
  isEmpty: (v) => !v,
  coerce: (v) => v,
  render: ({ value, onChange, disabled, config }) => {
    const accept = config?.accept || ''
    return (
      <div className="bs-file-wrap">
        <input type="file" className="bs-file-input" accept={accept} disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) { onChange(null); return }
            const reader = new FileReader()
            reader.onload = () => onChange({ name: file.name, type: file.type, size: file.size, data: reader.result })
            reader.readAsDataURL(file)
          }} />
        {value?.name && <span className="bs-file-name">{value.name}</span>}
      </div>
    )
  },
})

registerRunInputKind('hidden', {
  defaultValue: '',
  isEmpty: (v) => !String(v ?? '').trim(),
  render: () => null,
})

registerRunInputKind('json', {
  defaultValue: '{}',
  isEmpty: (v) => !v || !String(v).trim(),
  validate: (v) => {
    if (!v || !String(v).trim()) return null
    try { JSON.parse(v); return null } catch (e) { return `Invalid JSON: ${e.message}` }
  },
  coerce: (v) => {
    if (v == null || v === '' || v === '{}') return {}
    if (typeof v === 'object') return v
    try { return JSON.parse(v) } catch { return v }
  },
  render: ({ value, onChange, disabled }) => {
    const strVal = typeof value === 'object' ? JSON.stringify(value, null, 2) : (value ?? '{}')
    return (
      <JsonEditor
        value={strVal}
        onChange={onChange}
        readOnly={disabled}
        height="160px"
        placeholder="{}"
      />
    )
  },
})

function mapBooleanOutput(value, node) {
  const checked = isCheckedValue(value, node)
  if (checked) return node?.checkedValue != null && node.checkedValue !== '' ? node.checkedValue : true
  return node?.uncheckedValue != null && node.uncheckedValue !== '' ? node.uncheckedValue : false
}

function isCheckedValue(value, node) {
  if (value === true) return true
  if (value === false || value == null) return false

  if (node?.checkedValue != null && node.checkedValue !== '' && value === node.checkedValue) {
    return true
  }
  if (node?.uncheckedValue != null && node.uncheckedValue !== '' && value === node.uncheckedValue) {
    return false
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (lower === 'true') return true
    if (lower === 'false') return false
  }
  return Boolean(value)
}
