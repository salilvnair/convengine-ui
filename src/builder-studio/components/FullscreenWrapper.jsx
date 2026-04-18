/**
 * FullscreenWrapper — drops an expand/collapse button above any child and,
 * when expanded, portals the child into a full-viewport overlay so the user
 * can edit large JSON / code comfortably. Collapsing returns the child to
 * its original slot with state intact (same React subtree — we just swap
 * the surrounding div classes, no remount).
 *
 * Why a portal only in fullscreen mode? Some editors (vanilla-jsoneditor,
 * CodeMirror) mount once and are sensitive to being ripped out of the DOM.
 * Keeping the child mounted inline and simply styling its outer container
 * avoids re-initialization flicker.
 */
import { useEffect, useState } from 'react'

export default function FullscreenWrapper({ label = 'Editor', children, className = '' }) {
  const [full, setFull] = useState(false)

  // Esc exits fullscreen; lock body scroll while expanded.
  useEffect(() => {
    if (!full) return
    function onKey(e) { if (e.key === 'Escape') setFull(false) }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [full])

  return (
    <div className={`bs-fsw ${full ? 'is-fullscreen' : ''} ${className}`}>
      <div className="bs-fsw-toolbar">
        <span className="bs-fsw-label">{label}</span>
        <button
          type="button"
          className="bs-fsw-btn"
          onClick={() => setFull((v) => !v)}
          title={full ? 'Collapse (Esc)' : 'Expand to fullscreen'}
          aria-label={full ? 'Collapse' : 'Expand'}
        >
          {full ? <CollapseIcon /> : <ExpandIcon />}
          <span className="bs-fsw-btn-text">{full ? 'Collapse' : 'Fullscreen'}</span>
        </button>
      </div>
      <div className="bs-fsw-body">{children}</div>
    </div>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}
function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}
