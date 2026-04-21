/**
 * IntelliJ IDEA–style bottom tool-window bar.
 *
 * Always visible at the foot of `bs-center-wrap`. Each tab can toggle the
 * run dock open/closed and switch its active panel. The toolbar also shows
 * a mini status strip (last run state, node count, etc.).
 */
import { useEffect, useMemo, useState } from 'react'
import { getRunPanels, onRunPanelsChange } from './panel-registry'
import { useWorkflowStore } from '../stores/workflow-store'

/* ── tiny inline icons (16×16, stroke-only) ── */
const PlayIco = (p) => (
  <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5,3 13,8 5,13" fill="currentColor" stroke="none" />
  </svg>
)
const BugIco = (p) => (
  <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="6" height="8" rx="3" />
    <path d="M8 1v4" /><path d="M3 7h2" /><path d="M11 7h2" /><path d="M3 11h2" /><path d="M11 11h2" />
  </svg>
)
const TraceIco = (p) => (
  <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,12 5,5 8,9 11,3 14,8" />
  </svg>
)
const ProblemsIco = (p) => (
  <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5L1.5 13h13L8 1.5z" /><line x1="8" y1="6" x2="8" y2="9" /><circle cx="8" cy="11" r=".6" fill="currentColor" />
  </svg>
)
const TodoIco = (p) => (
  <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,8.5 5,11.5 9,4.5" /><line x1="11" y1="4" x2="14" y2="4" /><line x1="11" y1="8" x2="14" y2="8" /><line x1="11" y1="12" x2="14" y2="12" />
  </svg>
)
const MinimapIco = (p) => (
  <svg {...p} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="14" height="14" rx="1.5" />
    <rect x="4" y="4" width="2.5" height="2.5" rx="0.4" opacity="0.7" />
    <rect x="8" y="6" width="2.5" height="2.5" rx="0.4" opacity="0.5" />
    <rect x="5" y="9.5" width="2.5" height="2" rx="0.4" opacity="0.6" />
  </svg>
)

/** Icon lookup keyed by panel id */
const PANEL_ICONS = {
  run: PlayIco,
  debug: BugIco,
  trace: TraceIco,
  problems: ProblemsIco,
  todo: TodoIco,
}

/** Panels shown on the right side of the toolbar */
const RIGHT_PANEL_IDS = new Set(['todo'])
/** Standalone toggle buttons shown to the left of right-cluster panels */
const TOGGLE_BUTTONS = [
  { id: 'minimap', label: 'Minimap', Icon: MinimapIco },
]

export default function BottomToolbar({ activeTab, dockOpen, onTabClick }) {
  const [panels, setPanels] = useState(() => getRunPanels())
  const showMinimap = useWorkflowStore((s) => s.showMinimap)
  const toggleMinimap = useWorkflowStore((s) => s.toggleMinimap)
  // Compute isChatMode from store so Chat tab only shows when starter is in chat mode
  const nodes = useWorkflowStore((s) => s.nodes)
  const subBlockValues = useWorkflowStore((s) => s.subBlockValues)
  const isChatMode = useMemo(() => {
    const starterNode = nodes?.find((n) => n.data?.blockType === 'starter')
    if (!starterNode) return false
    const sbv = subBlockValues?.[starterNode.id] || {}
    return sbv.startWorkflow === 'chat'
  }, [nodes, subBlockValues])

  useEffect(() => onRunPanelsChange(() => setPanels(getRunPanels())), [])

  // Filter panels: respect isVisible() (e.g. chat tab only in chat mode)
  const visiblePanels = useMemo(
    () => panels.filter((p) => typeof p.isVisible === 'function' ? p.isVisible({ isChatMode }) : true),
    [panels, isChatMode]
  )
  const leftPanels = visiblePanels.filter((p) => !RIGHT_PANEL_IDS.has(p.id))
  const rightPanels = visiblePanels.filter((p) => RIGHT_PANEL_IDS.has(p.id))

  return (
    <div className="bs-bottombar" role="toolbar" aria-label="Tool windows">
      {/* ── Left cluster: run panels + problems ── */}
      <div className="bs-bottombar-left">
        {leftPanels.map((p) => {
          const Icon = PANEL_ICONS[p.id] || PlayIco
          const active = dockOpen && activeTab === p.id
          return (
            <button
              key={p.id}
              className={`bs-bottombar-tab ${active ? 'is-active' : ''}`}
              onClick={() => onTabClick(p.id)}
              title={p.label}
            >
              <Icon className="bs-bottombar-ico" />
              <span>{p.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Right cluster ── */}
      <div className="bs-bottombar-right">
        {TOGGLE_BUTTONS.map((tb) => {
          const active = tb.id === 'minimap' ? showMinimap : false
          return (
            <button
              key={tb.id}
              className={`bs-bottombar-tab ${active ? 'is-active' : ''}`}
              onClick={() => tb.id === 'minimap' && toggleMinimap()}
              title={tb.label}
            >
              <tb.Icon className="bs-bottombar-ico" />
              <span>{tb.label}</span>
            </button>
          )
        })}
        {rightPanels.map((p) => {
          const Icon = PANEL_ICONS[p.id] || PlayIco
          const active = dockOpen && activeTab === p.id
          return (
            <button
              key={p.id}
              className={`bs-bottombar-tab ${active ? 'is-active' : ''}`}
              onClick={() => onTabClick(p.id)}
              title={p.label}
            >
              <Icon className="bs-bottombar-ico" />
              <span>{p.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
