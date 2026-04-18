/**
 * Confirm-before-destructive-action modal.
 *
 * Clean, modern design — centered vertically with subtle backdrop blur,
 * no oversized icons, tight spacing, proper typography hierarchy.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function ConfirmModal({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)

  useEffect(() => {
    confirmRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
      if (e.key === 'Enter')  { e.preventDefault(); onConfirm?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return createPortal(
    <div className="bs-modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="bs-modal bs-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-confirm-title"
      >
        <div className="bs-confirm-header">
          <div className="bs-confirm-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 id="bs-confirm-title" className="bs-confirm-title">{title}</h3>
        </div>
        {message && <p className="bs-confirm-message">{message}</p>}
        <div className="bs-confirm-actions">
          <button type="button" className="bs-btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? 'bs-btn-danger' : 'bs-btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
