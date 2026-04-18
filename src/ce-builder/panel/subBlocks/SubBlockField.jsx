import { SUB_BLOCK_TYPES as T } from "../../blocks/subBlockTypes.js";

// SubBlock renderer — the equivalent of Sim's components/panel/components/editor
// sub-block switch. Each ConvEngine SubBlock type maps to one primitive input.

export default function SubBlockField({ def, value, onChange }) {
  const labelId = `ce-sb-${def.id}`;
  switch (def.type) {
    case T.SHORT_INPUT:
      return (
        <label className="ce-sb" htmlFor={labelId}>
          <span className="ce-sb-title">
            {def.title || def.id}
            {def.required ? <span className="ce-sb-required">*</span> : null}
          </span>
          <input
            id={labelId}
            className="ce-sb-input"
            value={value ?? ""}
            placeholder={def.placeholder || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case T.LONG_INPUT:
      return (
        <label className="ce-sb" htmlFor={labelId}>
          <span className="ce-sb-title">{def.title || def.id}</span>
          <textarea
            id={labelId}
            className="ce-sb-textarea"
            rows={def.rows || 4}
            value={value ?? ""}
            placeholder={def.placeholder || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case T.DROPDOWN:
      return (
        <label className="ce-sb" htmlFor={labelId}>
          <span className="ce-sb-title">{def.title || def.id}</span>
          <select
            id={labelId}
            className="ce-sb-input"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            {!def.required ? <option value="">—</option> : null}
            {(def.options || []).map((opt) => {
              const o = typeof opt === "string" ? { id: opt, label: opt } : opt;
              return (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              );
            })}
          </select>
        </label>
      );

    case T.SWITCH:
      return (
        <label className="ce-sb ce-sb-inline">
          <span className="ce-sb-title">{def.title || def.id}</span>
          <span
            className={`ce-sb-switch${value ? " is-on" : ""}`}
            role="switch"
            aria-checked={Boolean(value)}
            tabIndex={0}
            onClick={() => onChange(!value)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onChange(!value);
              }
            }}
          >
            <span className="ce-sb-switch-thumb" />
          </span>
        </label>
      );

    case T.SLIDER: {
      const min = def.min ?? 0;
      const max = def.max ?? 1;
      const step = def.step ?? 0.1;
      const v = typeof value === "number" ? value : def.defaultValue ?? min;
      return (
        <label className="ce-sb" htmlFor={labelId}>
          <span className="ce-sb-title">
            {def.title || def.id}
            <span className="ce-sb-slider-value">{v}</span>
          </span>
          <input
            id={labelId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={v}
            className="ce-sb-slider"
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
        </label>
      );
    }

    case T.JSON:
      return (
        <label className="ce-sb" htmlFor={labelId}>
          <span className="ce-sb-title">{def.title || def.id}</span>
          <textarea
            id={labelId}
            className="ce-sb-textarea ce-sb-code"
            rows={def.rows || 5}
            value={typeof value === "string" ? value : value ? JSON.stringify(value, null, 2) : ""}
            placeholder={def.placeholder || "{}"}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
          />
        </label>
      );

    case T.TAGS: {
      const items = Array.isArray(value) ? value : [];
      const addTag = (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onChange([...items, trimmed]);
      };
      const removeTag = (idx) => onChange(items.filter((_, i) => i !== idx));
      return (
        <div className="ce-sb">
          <span className="ce-sb-title">{def.title || def.id}</span>
          <div className="ce-sb-tags">
            {items.map((t, i) => (
              <span key={`${t}-${i}`} className="ce-sb-tag">
                {t}
                <button type="button" onClick={() => removeTag(i)} aria-label={`Remove ${t}`}>
                  ×
                </button>
              </span>
            ))}
            <input
              className="ce-sb-tag-input"
              placeholder={def.placeholder || "type and press Enter"}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(e.currentTarget.value);
                  e.currentTarget.value = "";
                }
              }}
            />
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="ce-sb">
          <span className="ce-sb-title">{def.title || def.id}</span>
          <span className="ce-sb-unsupported">Unsupported field type: {def.type}</span>
        </div>
      );
  }
}
