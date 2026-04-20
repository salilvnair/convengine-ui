/**
 * Icons used by ported sim blocks. Each is a minimal SVG React component
 * with the same name as sim's icons in apps/sim/components/icons.tsx.
 * Only icons referenced by the ported block set are defined here.
 */

function I({ children, ...props }) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  )
}

export const StartIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
  </I>
)

export const AgentIcon = (p) => (
  <I {...p}>
    <rect x="4" y="6" width="16" height="12" rx="3" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" />
    <path d="M12 3v3" />
  </I>
)

export const CodeIcon = (p) => (
  <I {...p}>
    <polyline points="8,7 3,12 8,17" />
    <polyline points="16,7 21,12 16,17" />
    <line x1="14" y1="5" x2="10" y2="19" />
  </I>
)

export const ConditionalIcon = (p) => (
  <I {...p}>
    <path d="M12 3v6" />
    <path d="M12 9 L5 18" />
    <path d="M12 9 L19 18" />
    <circle cx="5" cy="19" r="1.5" />
    <circle cx="19" cy="19" r="1.5" />
  </I>
)

export const ConnectIcon = (p) => (
  <I {...p}>
    <circle cx="6" cy="12" r="2" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="18" cy="18" r="2" />
    <path d="M8 12 L16 7" />
    <path d="M8 12 L16 17" />
  </I>
)

export const ApiIcon = (p) => (
  <I {...p}>
    <path d="M4 7h16" />
    <path d="M4 12h10" />
    <path d="M4 17h16" />
    <circle cx="18" cy="12" r="2" />
  </I>
)

export const ResponseIcon = (p) => (
  <I {...p}>
    <path d="M4 4h12l4 4v12H4z" />
    <path d="M16 4v4h4" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
  </I>
)

export const LoopIcon = (p) => (
  <I {...p}>
    <path d="M4 12a8 8 0 0 1 14-5" />
    <path d="M20 12a8 8 0 0 1-14 5" />
    <polyline points="18,3 18,7 14,7" />
    <polyline points="6,21 6,17 10,17" />
  </I>
)

export const ParallelIcon = (p) => (
  <I {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </I>
)

export const PostgresIcon = (p) => (
  <I {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="2.5" />
    <path d="M4 6v12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6" />
    <path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
  </I>
)

export const McpIcon = (p) => (
  <I {...p}>
    <path d="M4 17 L9 7 L12 13 L15 7 L20 17" />
    <path d="M8 17h8" />
  </I>
)

export const SmtpIcon = (p) => (
  <I {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 8l9 6 9-6" />
  </I>
)

export const VariableIcon = (p) => (
  <I {...p}>
    <path d="M7 4c-3 4-3 12 0 16" />
    <path d="M17 4c3 4 3 12 0 16" />
    <path d="M10 12 L14 12" />
    <path d="M12 10 L12 14" />
  </I>
)

export const WebhookIcon = (p) => (
  <I {...p}>
    <circle cx="7" cy="17" r="2.5" />
    <circle cx="17" cy="7" r="2.5" />
    <circle cx="15" cy="17" r="2.5" />
    <path d="M9 16 L14 16" />
    <path d="M17 10 L12 17" />
    <path d="M10 16 L8 8" />
  </I>
)

export const ScheduleIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12,7 12,12 16,14" />
  </I>
)

export const WaitIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5l3 2" />
  </I>
)

export const TableIcon = (p) => (
  <I {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="5" x2="9" y2="19" />
    <line x1="15" y1="5" x2="15" y2="19" />
  </I>
)

export const ExtensionIcon = (p) => (
  <I {...p}>
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M4 4h10l6 6v10H4z" />
    <path d="M8 14h4" />
  </I>
)

// ---------- UI icons (side nav, buttons) ----------

export const ChevronRightIcon = (p) => (
  <I {...p}><polyline points="9,6 15,12 9,18" /></I>
)
export const ChevronLeftIcon = (p) => (
  <I {...p}><polyline points="15,6 9,12 15,18" /></I>
)
export const ChevronDownIcon = (p) => (
  <I {...p}><polyline points="6,9 12,15 18,9" /></I>
)
export const PlusIcon = (p) => (
  <I {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></I>
)
export const SearchIcon = (p) => (
  <I {...p}><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></I>
)
export const TrashIcon = (p) => (
  <I {...p}><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 13h12l1-13" /><path d="M9 7V4h6v3" /></I>
)
export const WorkflowsIcon = (p) => (
  <I {...p}><rect x="3" y="4" width="7" height="6" rx="1.5" /><rect x="14" y="4" width="7" height="6" rx="1.5" /><rect x="8" y="14" width="8" height="6" rx="1.5" /><path d="M6.5 10v2a2 2 0 0 0 2 2" /><path d="M17.5 10v2a2 2 0 0 1-2 2" /></I>
)
export const TeamsIcon = (p) => (
  <I {...p}><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" /><path d="M15 19c0-2 1.5-3.5 4-3.5s2 0 2 0" /></I>
)
export const AgentsIcon = (p) => (
  <I {...p}><rect x="4" y="6" width="16" height="12" rx="3" /><circle cx="9" cy="12" r="1.3" fill="currentColor" /><circle cx="15" cy="12" r="1.3" fill="currentColor" /><path d="M12 3v3" /><path d="M8 18v2" /><path d="M16 18v2" /></I>
)
export const SkillsIcon = (p) => (
  <I {...p}><path d="M12 2 L14 8 L20 8.5 L15.5 13 L17 19 L12 16 L7 19 L8.5 13 L4 8.5 L10 8 Z" /></I>
)
export const BlocksIcon = (p) => (
  <I {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></I>
)
export const PanelLeftIcon = (p) => (
  <I {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <rect x="3" y="4" width="6" height="16" rx="2" fill="currentColor" opacity="0.25" />
    <line x1="9" y1="4" x2="9" y2="20" />
  </I>
)
export const FolderIcon = (p) => (
  <I {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></I>
)
export const PlayIcon = (p) => (
  <I {...p}><polygon points="7,5 19,12 7,19" fill="currentColor" stroke="none" /></I>
)
export const LinkIcon = (p) => (
  <I {...p}><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" /><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></I>
)
export const XIcon = (p) => (
  <I {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></I>
)
export const MinimizeIcon = (p) => (
  <I {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <rect x="3" y="14" width="18" height="6" rx="2" fill="currentColor" opacity="0.25" />
    <line x1="3" y1="14" x2="21" y2="14" />
  </I>
)
export const PanelRightIcon = (p) => (
  <I {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <rect x="15" y="4" width="6" height="16" rx="2" fill="currentColor" opacity="0.25" />
    <line x1="15" y1="4" x2="15" y2="20" />
  </I>
)
export const SettingsIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </I>
)
export const KeyboardIcon = (p) => (
  <I {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <line x1="6" y1="10" x2="6" y2="10" />
    <line x1="10" y1="10" x2="10" y2="10" />
    <line x1="14" y1="10" x2="14" y2="10" />
    <line x1="18" y1="10" x2="18" y2="10" />
    <line x1="7" y1="14" x2="17" y2="14" />
  </I>
)

// Aliases for blocks that use different icon names in sim but share our base set
export const RouterIcon = ConnectIcon

// ── Utility block icons ──
export const JsonMapIcon = (p) => (
  <I {...p}>
    <path d="M4 6h6" /><path d="M14 6h6" /><circle cx="12" cy="6" r="1.2" fill="currentColor" />
    <path d="M4 12h6" /><path d="M14 12h6" /><circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <path d="M4 18h6" /><path d="M14 18h6" /><circle cx="12" cy="18" r="1.2" fill="currentColor" />
  </I>
)

export const TextTemplateIcon = (p) => (
  <I {...p}>
    <path d="M4 6h16" /><path d="M4 10h12" /><path d="M4 14h14" /><path d="M4 18h8" />
  </I>
)

export const JsonPathIcon = (p) => (
  <I {...p}>
    <path d="M8 3v4a2 2 0 0 1-2 2H4" /><path d="M20 9h-2a2 2 0 0 1-2-2V3" />
    <path d="M4 15h2a2 2 0 0 1 2 2v4" /><path d="M16 21v-4a2 2 0 0 1 2-2h2" />
    <circle cx="12" cy="12" r="2" />
  </I>
)

export const MapperIcon = (p) => (
  <I {...p}>
    <path d="M4 8h4l4 4 4-4h4" /><path d="M4 16h4l4-4 4 4h4" />
  </I>
)

/** Colorful rocket deploy icon — dark blue stroke, light blue body, yellow window, red exhaust. */
export const DeployIcon = ({ className, ...rest }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
    {/* Exhaust flames */}
    <path data-flame="1" d="M10 20l2 3 2-3" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="#fbbf24" />
    <line data-flame="2" x1="12" y1="20" x2="12" y2="22" stroke="#ef4444" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
    {/* Fins */}
    <path d="M7.5 16.5L5 20l3-1.5" fill="#6366f1" stroke="#312e81" strokeWidth="1" strokeLinejoin="round" />
    <path d="M16.5 16.5L19 20l-3-1.5" fill="#6366f1" stroke="#312e81" strokeWidth="1" strokeLinejoin="round" />
    {/* Rocket body */}
    <path d="M12 2C12 2 8 6.5 8 13a8.5 8.5 0 0 0 1 4h6a8.5 8.5 0 0 0 1-4c0-6.5-4-11-4-11z" fill="#dbeafe" stroke="#1e3a5f" strokeWidth="1.5" strokeLinejoin="round" />
    {/* Base plate */}
    <rect x="9" y="17" width="6" height="2" rx="0.5" fill="#f87171" stroke="#1e3a5f" strokeWidth="0.8" />
    {/* Window */}
    <circle cx="12" cy="10" r="2" fill="#1e3a5f" stroke="#1e3a5f" strokeWidth="1" />
    <circle cx="12" cy="10" r="1.1" fill="#fbbf24" />
    {/* Nose tip highlight */}
    <path d="M12 3c-.5 1-1.5 3.5-1.8 6h3.6C13.5 6.5 12.5 4 12 3z" fill="rgba(255,255,255,0.25)" />
  </svg>
)
