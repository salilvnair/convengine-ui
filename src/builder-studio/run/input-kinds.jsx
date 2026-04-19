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
    <input className="bs-input" type="password" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
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
  render: ({ value, onChange, placeholder, disabled }) => (
    <input className="bs-input" type="tel" value={value} placeholder={placeholder || '+1 (555) 000-0000'} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
})

// ─── Number / Range ─────────────────────────────────────────────────

registerRunInputKind('number', {
  defaultValue: '',
  isEmpty: (v) => v === '' || v == null,
  validate: (v) => (v !== '' && isNaN(Number(v))) ? 'Must be a number' : null,
  coerce: (v) => (v === '' ? '' : Number(v)),
  render: ({ value, onChange, placeholder, disabled, config }) => (
    <input className="bs-input" type="number" value={value} placeholder={placeholder} disabled={disabled}
      min={config?.min} max={config?.max} step={config?.step}
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
  render: ({ value, onChange, placeholder, disabled, options }) => (
    <select className="bs-input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || 'Select\u2026'}</option>
      {(options || []).map((opt) => {
        const label = typeof opt === 'object' ? opt.label : opt
        const val = typeof opt === 'object' ? (opt.value ?? opt.id ?? opt.label) : opt
        return <option key={val} value={val}>{label}</option>
      })}
    </select>
  ),
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
  coerce: (v) => v === true || v === 'true',
  render: ({ value, onChange, disabled, config }) => (
    <label className="bs-checkbox-item">
      <input type="checkbox" checked={value === true || value === 'true'}
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
  coerce: (v) => v === true || v === 'true',
  render: ({ value, onChange, disabled }) => (
    <label className="bs-toggle">
      <input type="checkbox" checked={value === true || value === 'true'}
        disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="bs-toggle-track"><span className="bs-toggle-thumb" /></span>
      <span className="bs-toggle-label">{value ? 'On' : 'Off'}</span>
    </label>
  ),
})

// ─── Date / Time ────────────────────────────────────────────────────

registerRunInputKind('date', {
  defaultValue: '',
  render: ({ value, onChange, placeholder, disabled }) => (
    <input className="bs-input" type="date" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
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
  render: ({ value, onChange, placeholder, disabled }) => (
    <input className="bs-input" type="datetime-local" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
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
