/**
 * Team editor — opens as a tab when a team row is clicked in the SideNav.
 *
 * Shows:
 *   - Team name (rename inline)
 *   - Agent pools that belong to the team, each expandable to reveal its agents
 *   - Workflows bound to the team (with an "Open" shortcut that activates the
 *     workflow canvas)
 *
 * Creating pools or renaming the team writes through to the workspace store;
 * opening an agent/workflow focuses the corresponding tab via the tabs store.
 */
import { useMemo, useState } from 'react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useTabsStore, agentTabId } from '../stores/tabs-store'
import {
  TeamsIcon,
  AgentsIcon,
  WorkflowsIcon,
  FolderIcon,
  PlusIcon,
  LinkIcon,
  TrashIcon,
} from '../components/icons'

export default function TeamEditor({ teamId }) {
  // IMPORTANT: don't .filter() or .find() on arrays inside the selector —
  // that returns a new reference every render and Zustand's
  // useSyncExternalStore will treat each call as a changed snapshot, causing
  // an infinite render loop ("The result of getSnapshot should be cached").
  // Select raw arrays + the scalar we care about, and derive filtered views
  // with useMemo.
  const teams = useWorkspaceStore((s) => s.teams)
  const allPools = useWorkspaceStore((s) => s.agentPools)
  const agents = useWorkspaceStore((s) => s.agents)
  const allWorkflows = useWorkspaceStore((s) => s.workflows)
  const renameTeam = useWorkspaceStore((s) => s.renameTeam)
  const createAgentPool = useWorkspaceStore((s) => s.createAgentPool)
  const deleteAgentPool = useWorkspaceStore((s) => s.deleteAgentPool)
  const createAgent = useWorkspaceStore((s) => s.createAgent)
  const openWorkflow = useWorkspaceStore((s) => s.openWorkflow)
  const openTab = useTabsStore((s) => s.openTab)
  const setActive = useTabsStore((s) => s.setActive)

  const team = useMemo(() => teams.find((t) => t.id === teamId), [teams, teamId])
  const pools = useMemo(
    () => allPools.filter((p) => p.teamId === teamId),
    [allPools, teamId]
  )
  const workflows = useMemo(
    () => allWorkflows.filter((w) => w.teamId === teamId),
    [allWorkflows, teamId]
  )

  const [newPoolName, setNewPoolName] = useState('')
  const totalAgents = useMemo(
    () => agents.filter((a) => pools.some((p) => p.id === a.poolId)).length,
    [agents, pools]
  )

  if (!team) return <div className="bs-editor-empty">Team not found.</div>

  return (
    <div className="bs-editor">
      <header className="bs-editor-head">
        <TeamsIcon className="bs-editor-ico" />
        <div className="bs-editor-heading">
          <div className="bs-editor-title">{team.name}</div>
          <div className="bs-editor-sub">
            {pools.length} pool{pools.length === 1 ? '' : 's'} · {totalAgents} agent{totalAgents === 1 ? '' : 's'} · {workflows.length} workflow{workflows.length === 1 ? '' : 's'}
          </div>
        </div>
      </header>

      <section className="bs-editor-section">
        <label className="bs-label">Team name</label>
        <input
          className="bs-input"
          value={team.name}
          onChange={(e) => renameTeam(team.id, e.target.value)}
        />
      </section>

      <section className="bs-editor-section">
        <div className="bs-settings-section-head">
          <FolderIcon className="bs-ico-sm" />
          <h3 className="bs-settings-h3">Agent pools</h3>
        </div>

        <div className="bs-inline-form" style={{ marginBottom: 8 }}>
          <input
            className="bs-input"
            placeholder="New pool name"
            value={newPoolName}
            onChange={(e) => setNewPoolName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newPoolName.trim()) {
                createAgentPool(team.id, newPoolName.trim())
                setNewPoolName('')
              }
            }}
          />
          <button
            className="bs-btn bs-btn-accent"
            onClick={() => {
              if (!newPoolName.trim()) return
              createAgentPool(team.id, newPoolName.trim())
              setNewPoolName('')
            }}
          >
            <PlusIcon className="bs-ico-xs" />
            <span>Add pool</span>
          </button>
        </div>

        {pools.length === 0 ? (
          <div className="bs-hint">No pools yet — create one to group agents.</div>
        ) : (
          <ul className="bs-rows">
            {pools.map((p) => {
              const poolAgents = agents.filter((a) => a.poolId === p.id)
              return (
                <li key={p.id} className="bs-tree">
                  <div className="bs-row bs-row-header">
                    <FolderIcon className="bs-ico-sm bs-row-lead" />
                    <div className="bs-row-main">
                      <div className="bs-row-title">{p.name}</div>
                      <div className="bs-row-meta">{poolAgents.length} agent{poolAgents.length === 1 ? '' : 's'}</div>
                    </div>
                    <button
                      className="bs-btn-ghost"
                      onClick={() => createAgent(p.id, { name: 'New Agent' })}
                      title="Add an agent to this pool"
                    >
                      <PlusIcon className="bs-ico-xs" />
                      <span>Agent</span>
                    </button>
                    <button
                      className="bs-btn-ghost bs-danger"
                      onClick={() => deleteAgentPool(p.id)}
                      title="Delete pool"
                    >
                      <TrashIcon className="bs-ico-xs" />
                    </button>
                  </div>
                  {poolAgents.length > 0 && (
                    <ul className="bs-rows bs-rows-nested">
                      {poolAgents.map((a) => (
                        <li
                          key={a.id}
                          className="bs-row"
                          onClick={() =>
                            openTab({ id: agentTabId(a.id), kind: 'agent', entityId: a.id, title: a.name })
                          }
                        >
                          <AgentsIcon className="bs-ico-sm bs-row-lead" />
                          <div className="bs-row-main">
                            <div className="bs-row-title">{a.name}</div>
                            <div className="bs-row-meta">{a.model}</div>
                          </div>
                          <button
                            className="bs-btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              openTab({ id: agentTabId(a.id), kind: 'agent', entityId: a.id, title: a.name })
                            }}
                            title="Open agent"
                          >
                            <LinkIcon className="bs-ico-xs" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="bs-editor-section">
        <div className="bs-settings-section-head">
          <WorkflowsIcon className="bs-ico-sm" />
          <h3 className="bs-settings-h3">Workflows</h3>
        </div>
        {workflows.length === 0 ? (
          <div className="bs-hint">No workflows assigned to this team yet.</div>
        ) : (
          <ul className="bs-rows">
            {workflows.map((w) => (
              <li
                key={w.id}
                className="bs-row"
                onClick={() => { openWorkflow(w.id); setActive('workflow') }}
              >
                <WorkflowsIcon className="bs-ico-sm bs-row-lead" />
                <div className="bs-row-main">
                  <div className="bs-row-title">{w.name}</div>
                  <div className="bs-row-meta">
                    {(w.nodes?.length ?? 0)} nodes · {(w.edges?.length ?? 0)} edges
                  </div>
                </div>
                <button
                  className="bs-btn-ghost"
                  onClick={(e) => { e.stopPropagation(); openWorkflow(w.id); setActive('workflow') }}
                  title="Open on canvas"
                >
                  <LinkIcon className="bs-ico-xs" />
                  <span>Open</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
