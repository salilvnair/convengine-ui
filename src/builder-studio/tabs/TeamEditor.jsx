/**
 * Team editor — opens as a tab when a team row is clicked in the SideNav.
 *
 * Tree: Pool (folder, expand/collapse) → Agents (expand/collapse) → Skills (top 3)
 *       Workflows (expand/collapse) → node/edge summary
 *
 * Each level has trash + open icons.
 */
import { useMemo, useState, useCallback } from 'react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useTabsStore, agentTabId, skillTabId } from '../stores/tabs-store'
import ConfirmModal from '../components/ConfirmModal'
import {
  TeamsIcon,
  AgentsIcon,
  SkillsIcon,
  WorkflowsIcon,
  FolderIcon,
  PlusIcon,
  LinkIcon,
  TrashIcon,
  ChevronDownIcon,
} from '../components/icons'

const MAX_SKILLS_SHOWN = 3

// Small chevron that rotates when open
function Chevron({ open }) {
  return (
    <ChevronDownIcon
      className="bs-ico-xs"
      style={{
        flexShrink: 0,
        color: 'var(--text-secondary, #94a3b8)',
        transition: 'transform 140ms ease',
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
      }}
    />
  )
}

export default function TeamEditor({ teamId }) {
  // IMPORTANT: don't .filter() or .find() on arrays inside the selector —
  // that returns a new reference every render and Zustand's
  // useSyncExternalStore will treat each call as a changed snapshot, causing
  // an infinite render loop ("The result of getSnapshot should be cached").
  // Select raw arrays + the scalar we care about, and derive filtered views
  // with useMemo.
  const teams       = useWorkspaceStore((s) => s.teams)
  const allPools    = useWorkspaceStore((s) => s.agentPools)
  const agents      = useWorkspaceStore((s) => s.agents)
  const allSkills   = useWorkspaceStore((s) => s.skills)
  const allWorkflows = useWorkspaceStore((s) => s.workflows)

  const renameTeam      = useWorkspaceStore((s) => s.renameTeam)
  const createAgentPool = useWorkspaceStore((s) => s.createAgentPool)
  const deleteAgentPool = useWorkspaceStore((s) => s.deleteAgentPool)
  const createAgent     = useWorkspaceStore((s) => s.createAgent)
  const deleteAgent     = useWorkspaceStore((s) => s.deleteAgent)
  const deleteWorkflow  = useWorkspaceStore((s) => s.deleteWorkflow)

  const openTab         = useTabsStore((s) => s.openTab)
  const openWorkflowTab = useTabsStore((s) => s.openWorkflowTab)

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

  // expand/collapse sets — pools open by default, workflows collapsed
  const [openPools,     setOpenPools]     = useState(() => new Set())   // pool ids that are expanded
  const [openAgents,    setOpenAgents]    = useState(() => new Set())   // agent ids whose skill list is expanded
  const [openWorkflows, setOpenWorkflows] = useState(() => new Set())   // workflow ids that are expanded

  const togglePool     = useCallback((id) => setOpenPools((s)     => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }), [])
  const toggleAgent    = useCallback((id) => setOpenAgents((s)    => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }), [])
  const toggleWorkflow = useCallback((id) => setOpenWorkflows((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }), [])

  // pending deletes
  const [pendingDeletePool,     setPendingDeletePool]     = useState(null) // { id, name }
  const [pendingDeleteAgent,    setPendingDeleteAgent]    = useState(null) // { id, name }
  const [pendingDeleteWorkflow, setPendingDeleteWorkflow] = useState(null) // { id, name }

  const totalAgents = useMemo(
    () => agents.filter((a) => pools.some((p) => p.id === a.poolId)).length,
    [agents, pools]
  )

  const openAgent = useCallback((a) => {
    openTab({ id: agentTabId(a.id), kind: 'agent', entityId: a.id, title: a.name })
  }, [openTab])

  const openSkill = useCallback((sk) => {
    openTab({ id: skillTabId(sk.id), kind: 'skill', entityId: sk.id, title: sk.name })
  }, [openTab])

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

      {/* ── Agent pools tree ── */}
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
          <ul className="bs-rows" style={{ gap: 4 }}>
            {pools.map((p) => {
              const poolAgents = agents.filter((a) => a.poolId === p.id)
              const isPoolOpen = openPools.has(p.id)
              return (
                <li key={p.id} className="bs-tree">
                  {/* Pool row (folder) */}
                  <div
                    className="bs-row bs-row-header bs-te-pool-row"
                    onClick={() => togglePool(p.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Chevron open={isPoolOpen} />
                    <FolderIcon className="bs-ico-sm bs-row-lead" style={{ color: '#f59e0b' }} />
                    <div className="bs-row-main">
                      <div className="bs-row-title">{p.name}</div>
                      <div className="bs-row-meta">{poolAgents.length} agent{poolAgents.length === 1 ? '' : 's'}</div>
                    </div>
                    <button
                      className="bs-row-action"
                      title="Add agent"
                      onClick={(e) => {
                        e.stopPropagation()
                        createAgent(p.id, { name: 'New Agent' })
                        // Auto-open pool so user sees the new agent
                        setOpenPools((s) => { const n = new Set(s); n.add(p.id); return n })
                      }}
                    >
                      <PlusIcon className="bs-ico-xs" />
                    </button>
                    <button
                      className="bs-row-action bs-row-action-danger"
                      title="Delete pool"
                      onClick={(e) => { e.stopPropagation(); setPendingDeletePool({ id: p.id, name: p.name }) }}
                    >
                      <TrashIcon className="bs-ico-xs" />
                    </button>
                  </div>

                  {/* Agents — only when pool is open */}
                  {isPoolOpen && (
                    <ul className="bs-tree-children">
                      {poolAgents.length === 0 ? (
                        <li className="bs-row-meta" style={{ padding: '4px 0', fontSize: 12 }}>No agents yet</li>
                      ) : poolAgents.map((a) => {
                        const isAgentOpen = openAgents.has(a.id)
                        const attachedSkills = (a.attachedSkillIds || [])
                          .map((sid) => allSkills.find((sk) => sk.id === sid))
                          .filter(Boolean)
                        const topSkills = attachedSkills.slice(0, MAX_SKILLS_SHOWN)
                        const extra = attachedSkills.length - topSkills.length

                        return (
                          <li key={a.id} className="bs-tree">
                            {/* Agent row */}
                            <div
                              className="bs-row bs-te-agent-row"
                              onClick={() => toggleAgent(a.id)}
                              style={{ cursor: 'pointer' }}
                            >
                              <Chevron open={isAgentOpen} />
                              <AgentsIcon className="bs-ico-sm bs-row-lead" style={{ color: '#818cf8' }} />
                              <div className="bs-row-main">
                                <div className="bs-row-title">{a.name}</div>
                                <div className="bs-row-meta">{a.model}</div>
                              </div>
                              <button
                                className="bs-row-action"
                                title="Open agent"
                                onClick={(e) => { e.stopPropagation(); openAgent(a) }}
                              >
                                <LinkIcon className="bs-ico-xs" />
                              </button>
                              <button
                                className="bs-row-action bs-row-action-danger"
                                title="Delete agent"
                                onClick={(e) => { e.stopPropagation(); setPendingDeleteAgent({ id: a.id, name: a.name }) }}
                              >
                                <TrashIcon className="bs-ico-xs" />
                              </button>
                            </div>

                            {/* Skills — only when agent is open */}
                            {isAgentOpen && (
                              <ul className="bs-tree-children">
                                {topSkills.length === 0 ? (
                                  <li className="bs-row-meta" style={{ padding: '4px 0', fontSize: 12 }}>No skills attached</li>
                                ) : topSkills.map((sk) => (
                                  <li key={sk.id} className="bs-row bs-te-skill-row" onClick={() => openSkill(sk)}>
                                    <SkillsIcon className="bs-ico-sm bs-row-lead" style={{ color: '#34d399' }} />
                                    <div className="bs-row-main">
                                      <div className="bs-row-title">{sk.name}</div>
                                      <div className="bs-row-meta">{sk.language || 'js'}</div>
                                    </div>
                                    <button
                                      className="bs-row-action"
                                      title="Open skill"
                                      onClick={(e) => { e.stopPropagation(); openSkill(sk) }}
                                    >
                                      <LinkIcon className="bs-ico-xs" />
                                    </button>
                                  </li>
                                ))}
                                {extra > 0 && (
                                  <li
                                    className="bs-row-meta"
                                    style={{ padding: '3px 4px', fontSize: 11, cursor: 'pointer' }}
                                    onClick={() => openAgent(a)}
                                  >
                                    +{extra} more — open agent to see all
                                  </li>
                                )}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Workflows tree ── */}
      <section className="bs-editor-section">
        <div className="bs-settings-section-head">
          <WorkflowsIcon className="bs-ico-sm" />
          <h3 className="bs-settings-h3">Workflows</h3>
        </div>
        {workflows.length === 0 ? (
          <div className="bs-hint">No workflows assigned to this team yet.</div>
        ) : (
          <ul className="bs-rows" style={{ gap: 4 }}>
            {workflows.map((w) => {
              const isWfOpen = openWorkflows.has(w.id)
              const nodeCount = w.nodes?.length ?? 0
              const edgeCount = w.edges?.length ?? 0
              return (
                <li key={w.id} className="bs-tree">
                  <div
                    className="bs-row bs-te-wf-row"
                    onClick={() => toggleWorkflow(w.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Chevron open={isWfOpen} />
                    <WorkflowsIcon className="bs-ico-sm bs-row-lead" style={{ color: '#38bdf8' }} />
                    <div className="bs-row-main">
                      <div className="bs-row-title">{w.name}</div>
                      <div className="bs-row-meta">{nodeCount} node{nodeCount === 1 ? '' : 's'} · {edgeCount} edge{edgeCount === 1 ? '' : 's'}</div>
                    </div>
                    <button
                      className="bs-row-action"
                      title="Open on canvas"
                      onClick={(e) => { e.stopPropagation(); openWorkflowTab(w.id, w.name) }}
                    >
                      <LinkIcon className="bs-ico-xs" />
                    </button>
                    <button
                      className="bs-row-action bs-row-action-danger"
                      title="Delete workflow"
                      onClick={(e) => { e.stopPropagation(); setPendingDeleteWorkflow({ id: w.id, name: w.name }) }}
                    >
                      <TrashIcon className="bs-ico-xs" />
                    </button>
                  </div>

                  {isWfOpen && (
                    <ul className="bs-tree-children">
                      {nodeCount === 0 ? (
                        <li className="bs-row-meta" style={{ padding: '4px 0', fontSize: 12 }}>Empty workflow</li>
                      ) : (w.nodes || []).map((n) => (
                        <li key={n.id} className="bs-row bs-te-node-row" style={{ cursor: 'default' }}>
                          <span
                            className="bs-ico-xs"
                            style={{
                              width: 8, height: 8, borderRadius: 2,
                              background: 'var(--bs-accent, #6366f1)',
                              flexShrink: 0,
                            }}
                          />
                          <div className="bs-row-main">
                            <div className="bs-row-title" style={{ fontSize: 12 }}>
                              {n.data?.title || n.data?.blockType || n.id}
                            </div>
                            <div className="bs-row-meta">{n.data?.blockType}</div>
                          </div>
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

      {/* ── Confirm modals ── */}
      {pendingDeletePool && (
        <ConfirmModal
          title="Delete agent pool?"
          message={`"${pendingDeletePool.name}" will be removed. Agents inside the pool remain, but become orphaned until reassigned.`}
          confirmLabel="Delete pool"
          onCancel={() => setPendingDeletePool(null)}
          onConfirm={() => { deleteAgentPool(pendingDeletePool.id); setPendingDeletePool(null) }}
        />
      )}
      {pendingDeleteAgent && (
        <ConfirmModal
          title="Delete agent?"
          message={`"${pendingDeleteAgent.name}" will be permanently removed from this pool.`}
          confirmLabel="Delete agent"
          onCancel={() => setPendingDeleteAgent(null)}
          onConfirm={() => { deleteAgent(pendingDeleteAgent.id); setPendingDeleteAgent(null) }}
        />
      )}
      {pendingDeleteWorkflow && (
        <ConfirmModal
          title="Delete workflow?"
          message={`"${pendingDeleteWorkflow.name}" and all its nodes and edges will be permanently removed.`}
          confirmLabel="Delete workflow"
          onCancel={() => setPendingDeleteWorkflow(null)}
          onConfirm={() => { deleteWorkflow(pendingDeleteWorkflow.id); setPendingDeleteWorkflow(null) }}
        />
      )}
    </div>
  )
}
