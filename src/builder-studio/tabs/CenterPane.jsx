/**
 * Postman-style tab bar + body for the builder studio center pane.
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ [Workflow]  [🤖 URL Data Extractor ×]  [⭐ Skill ×] │ tab bar
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │   (active tab's content — Canvas or entity editor)  │
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 *
 * The `workflow` tab is always present and renders the ReactFlow canvas.
 * Agent/Skill tabs render their editors. Closing a tab drops it; closing
 * the active tab falls back to the one that was before it.
 */
import { useTabsStore } from '../stores/tabs-store'
import Canvas from '../canvas/Canvas'
import AgentEditor from './AgentEditor'
import SkillEditor from './SkillEditor'
import SettingsTab from './SettingsTab'
import TeamEditor from './TeamEditor'
import { WorkflowsIcon, AgentsIcon, SkillsIcon, TeamsIcon, SettingsIcon, XIcon } from '../components/icons'

const ICONS = {
  workflow: WorkflowsIcon,
  agent: AgentsIcon,
  skill: SkillsIcon,
  team: TeamsIcon,
  settings: SettingsIcon,
}

export default function CenterPane() {
  const tabs = useTabsStore((s) => s.tabs)
  const activeId = useTabsStore((s) => s.activeId)
  const setActive = useTabsStore((s) => s.setActive)
  const closeTab = useTabsStore((s) => s.closeTab)

  const active = tabs.find((t) => t.id === activeId) || tabs[0]

  return (
    <div className="bs-center">
      <div className="bs-tabbar" role="tablist">
        {tabs.map((t) => {
          const Icon = ICONS[t.kind] || WorkflowsIcon
          const isActive = t.id === activeId
          const pinned = t.id === 'workflow'
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              className={`bs-tab ${isActive ? 'is-active' : ''} ${pinned ? 'is-pinned' : ''}`}
              onClick={() => setActive(t.id)}
              onAuxClick={(e) => { if (e.button === 1 && !pinned) closeTab(t.id) }}
            >
              <Icon className="bs-ico-xs" />
              <span className="bs-tab-label">{t.title}</span>
              {!pinned && (
                <span
                  className="bs-tab-close"
                  role="button"
                  tabIndex={0}
                  title="Close tab"
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(t.id) } }}
                >
                  <XIcon className="bs-ico-xs" />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="bs-tab-body">
        {active?.kind === 'workflow' && <Canvas />}
        {active?.kind === 'agent' && <AgentEditor agentId={active.entityId} />}
        {active?.kind === 'skill' && <SkillEditor skillId={active.entityId} />}
        {active?.kind === 'team' && <TeamEditor teamId={active.entityId} />}
        {active?.kind === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
