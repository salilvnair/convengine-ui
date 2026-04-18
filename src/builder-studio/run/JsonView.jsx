/**
 * Postman-style JSON viewer. Tokenizes a JSON value and renders each part
 * with a semantic color (key / string / number / boolean / null / punctuation).
 * Accepts either a raw JSON string or an already-parsed object/array.
 *
 * Falls back to rendering the value as plain text if it isn't valid JSON,
 * so trace rows that carry truncated strings or errors still display.
 */
export default function JsonView({ value, className = '' }) {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return <pre className={`bs-json-view ${className}`}>{value}</pre> }
  }
  if (parsed == null) return <pre className={`bs-json-view ${className}`}>null</pre>
  return (
    <pre className={`bs-json-view ${className}`}>
      {renderValue(parsed, 0)}
    </pre>
  )
}

function renderValue(v, depth) {
  if (v === null) return <span className="bs-json-null">null</span>
  if (typeof v === 'boolean') return <span className="bs-json-bool">{String(v)}</span>
  if (typeof v === 'number') return <span className="bs-json-num">{String(v)}</span>
  if (typeof v === 'string') return <span className="bs-json-str">"{v}"</span>
  if (Array.isArray(v)) return renderArray(v, depth)
  if (typeof v === 'object') return renderObject(v, depth)
  return <span>{String(v)}</span>
}

function renderArray(arr, depth) {
  if (arr.length === 0) return <span className="bs-json-punct">[]</span>
  const pad = indent(depth + 1)
  const close = indent(depth)
  return (
    <>
      <span className="bs-json-punct">[</span>
      {arr.map((v, i) => (
        <div key={i} className="bs-json-line">
          {pad}
          {renderValue(v, depth + 1)}
          {i < arr.length - 1 && <span className="bs-json-punct">,</span>}
        </div>
      ))}
      <div className="bs-json-line">{close}<span className="bs-json-punct">]</span></div>
    </>
  )
}

function renderObject(obj, depth) {
  const entries = Object.entries(obj)
  if (entries.length === 0) return <span className="bs-json-punct">{'{}'}</span>
  const pad = indent(depth + 1)
  const close = indent(depth)
  return (
    <>
      <span className="bs-json-punct">{'{'}</span>
      {entries.map(([k, v], i) => (
        <div key={k} className="bs-json-line">
          {pad}
          <span className="bs-json-key">"{k}"</span>
          <span className="bs-json-punct">: </span>
          {renderValue(v, depth + 1)}
          {i < entries.length - 1 && <span className="bs-json-punct">,</span>}
        </div>
      ))}
      <div className="bs-json-line">{close}<span className="bs-json-punct">{'}'}</span></div>
    </>
  )
}

function indent(depth) {
  return <span className="bs-json-indent">{'  '.repeat(depth)}</span>
}
