import AuditTimeline from "../../AuditTimeline";
import { CheckIcon, CloseIcon, CopyIcon } from "./AppIcons.jsx";

export function AuditDrawer({
  conversationId,
  auditOpen,
  auditResizing,
  auditDrawerWidth,
  onAuditResizeMouseDown,
  onAuditResizeDoubleClick,
  copiedConvId,
  onCopyConversationId,
  onClose,
  auditEvents,
  auditLoading,
  auditError,
}) {
  return (
    <aside className={`audit-drawer ${auditOpen ? "open" : ""} ${auditResizing ? "resizing" : ""}`} style={{ width: `${auditDrawerWidth}px` }}>
      <div className="audit-resize-handle" onMouseDown={onAuditResizeMouseDown} onDoubleClick={onAuditResizeDoubleClick} title="Drag to resize (double-click to toggle max/default)" />
      <div className="audit-head">
        <h3>Audit Timeline</h3>
        <div className="audit-head-actions">
          <span className="audit-conv-id" title={conversationId}>{conversationId}</span>
          <button
            type="button"
            className={`audit-icon-btn audit-copy ${copiedConvId ? "is-copied" : ""}`}
            onClick={onCopyConversationId}
            title={copiedConvId ? "Conversation ID copied" : "Copy Conversation ID"}
            aria-label={copiedConvId ? "Conversation ID copied" : "Copy Conversation ID"}
          >
            {copiedConvId ? <CheckIcon /> : <CopyIcon />}
          </button>
          <button type="button" className="audit-icon-btn audit-close" onClick={onClose} title="Close Audit Timeline" aria-label="Close Audit Timeline">
            <CloseIcon />
          </button>
        </div>
      </div>
      <AuditTimeline audits={auditEvents} loading={auditLoading} error={auditError} />
    </aside>
  );
}
