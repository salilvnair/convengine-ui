/**
 * SwiftUI/Claude-Code-style side navigation.
 *
 *   ┌──┬────────────────────┬─┐
 *   │🗂│  Panel title       │║│  rail + resizable panel + splitter
 *   │👥│  scrollable body   │║│  - click splitter = toggle collapse
 *   │🤖│                    │║│  - drag splitter = resize pane
 *   │⭐│                    │║│  - all rows have right-click menus
 *   │🧩│                    │║│
 *   │⟨⟩│                    │ │
 *   └──┴────────────────────┴─┘
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useTabsStore, agentTabId, skillTabId } from '../stores/tabs-store'
import BlockPalette from './BlockPalette'
import ContextMenu from './ContextMenu'
import {
  WorkflowsIcon,
  TeamsIcon,
  AgentsIcon,
  SkillsIcon,
  BlocksIcon,
  PanelLeftIcon,
  PlusIcon,
  TrashIcon,
  ChevronRightIcon,
  FolderIcon,
  LinkIcon,
} from '../components/icons'

const TABS = [
  { id: 'workflows', label: 'Workflows', Icon: WorkflowsIcon },
  { id: 'teams', label: 'Teams', Icon: TeamsIcon },
  { id: 'agents', label: 'Agents', Icon: AgentsIcon },
  { id: 'skills', label: 'Skills', Icon: SkillsIcon },
  { id: 'blocks', label: 'Blocks', Icon: BlocksIcon },
]

const MIN_W = 220
const MAX_W = 480
const DEFAULT_W = 288

export default function SideNav() {
  const [activeTab, setActiveTab] = useState('blocks')
  const [open, setOpen] = useState(true)
  const [width, setWidth] = useState(DEFAULT_W)
  const [dragging, setDragging] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startW: DEFAULT_W, moved: false })

  const panel = useMemo(() => TABS.find((t) => t.id === activeTab), [activeTab])

  function onRailClick(id) {
    if (!open) { setOpen(true); setActiveTab(id); return }
    if (id === activeTab) { setOpen(false); return }
    setActiveTab(id)
  }

  // ----- Splitter: drag to resize, click (no movement) to toggle collapse ----
  const onSplitterPointerDown = useCallback((e) => {
    dragRef.current = { active: true, startX: e.clientX, startW: width, moved: false }
    setDragging(true)
    e.preventDefault()
  }, [width])

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.startX
      if (Math.abs(dx) > 3) dragRef.current.moved = true
      const next = Math.max(MIN_W, Math.min(MAX_W, dragRef.current.startW + dx))
      setWidth(next)
    }
    function onUp() {
      if (!dragRef.current.active) return
      const moved = dragRef.current.moved
      dragRef.current.active = false
      setDragging(false)
      if (!moved) setOpen((o) => !o) // bare click = toggle
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Keyboard: Cmd/Ctrl+B toggles, matching Claude Code convention
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <aside
      className={`bs-sidenav ${open ? 'is-open' : 'is-closed'} ${dragging ? 'is-dragging' : ''}`}
      style={{ '--bs-pane-w': `${open ? width : 0}px` }}
    >
      <nav className="bs-rail" aria-label="Workspace sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`bs-rail-btn ${open && activeTab === t.id ? 'is-active' : ''}`}
            onClick={() => onRailClick(t.id)}
            title={t.label}
            aria-pressed={open && activeTab === t.id}
          >
            <t.Icon className="bs-rail-ico" />
            <span className="bs-rail-label">{t.label}</span>
          </button>
        ))}
        <div className="bs-rail-spacer" />
        <button
          className="bs-rail-btn"
          onClick={() => setOpen((o) => !o)}
          title={open ? 'Collapse panel (⌘B)' : 'Expand panel (⌘B)'}
        >
          <PanelLeftIcon className="bs-rail-ico" />
        </button>
      </nav>

      <section className="bs-pane" aria-hidden={!open}>
        <header className="bs-pane-head">
          <h2 className="bs-pane-title">{panel?.label}</h2>
        </header>
        <div className="bs-pane-body">
          {activeTab === 'workflows' && <WorkflowsPanel />}
          {activeTab === 'teams' && <TeamsPanel />}
          {activeTab === 'agents' && <AgentsPanel />}
          {activeTab === 'skills' && <SkillsPanel />}
          {activeTab === 'blocks' && <BlockPalette />}
        </div>
      </section>

      <div
        className="bs-splitter"
        onPointerDown={onSplitterPointerDown}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        title=""
        aria-label="Resize or collapse panel"
      >
        <div className="bs-splitter-grip" />
        {showTip && !dragging && (
          <div className="bs-splitter-tip">
            <div>Click to {open ? 'collapse' : 'expand'} <kbd>⌘B</kbd></div>
            <div>Drag to resize</div>
          </div>
        )}
      </div>
    </aside>
  )
}

/* =========================================================================
 * Sections
 * ====================================================================== */

function WorkflowsPanel() {
  const workflows = useWorkspaceStore((s) => s.workflows)
  const activeId = useWorkspaceStore((s) => s.activeWorkflowId)
  const teams = useWorkspaceStore((s) => s.teams)
  const createWorkflow = useWorkspaceStore((s) => s.createWorkflow)
  const openWorkflow = useWorkspaceStore((s) => s.openWorkflow)
  const deleteWorkflow = useWorkspaceStore((s) => s.deleteWorkflow)
  const renameWorkflow = useWorkspaceStore((s) => s.renameWorkflow)
  const duplicateWorkflow = useWorkspaceStore((s) => s.duplicateWorkflow)
  const focusWorkflowTab = useTabsStore((s) => s.setActive)
  const [menu, setMenu] = useCtxMenu()
  const [editing, setEditing] = useState(null)

  return (
    <div className="bs-sec">
      <button
        className="bs-add-btn"
        onClick={() => createWorkflow('Untitled workflow', teams[0]?.id)}
      >
        <PlusIcon className="bs-ico-sm" />
        <span>New workflow</span>
      </button>
      <ul className="bs-rows">
        {workflows.length === 0 && <li className="bs-empty">No workflows yet.</li>}
        {workflows.map((w) => (
          <li
            key={w.id}
            className={`bs-row ${w.id === activeId ? 'is-active' : ''}`}
            onClick={() => { openWorkflow(w.id); focusWorkflowTab('workflow') }}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { id: 'open', label: 'Open', icon: LinkIcon, onSelect: () => { openWorkflow(w.id); focusWorkflowTab('workflow') } },
                  { id: 'rename', label: 'Rename', onSelect: () => setEditing(w.id) },
                  { id: 'dup', label: 'Duplicate', onSelect: () => duplicateWorkflow(w.id) },
                  { separator: true },
                  { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => deleteWorkflow(w.id) },
                ],
              })
            }}
          >
            <FolderIcon className="bs-ico-sm bs-row-lead" />
            <div className="bs-row-main">
              {editing === w.id ? (
                <input
                  autoFocus
                  className="bs-inline-edit"
                  defaultValue={w.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { renameWorkflow(w.id, e.target.value.trim() || w.name); setEditing(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <>
                  <div className="bs-row-title">{w.name}</div>
                  <div className="bs-row-meta">{teams.find((t) => t.id === w.teamId)?.name || '—'}</div>
                </>
              )}
            </div>
            <button
              className="bs-row-action"
              onClick={(e) => { e.stopPropagation(); deleteWorkflow(w.id) }}
              title="Delete workflow"
            >
              <TrashIcon className="bs-ico-xs" />
            </button>
          </li>
        ))}
      </ul>
      {menu}
    </div>
  )
}

function TeamsPanel() {
  const teams = useWorkspaceStore((s) => s.teams)
  const createTeam = useWorkspaceStore((s) => s.createTeam)
  const deleteTeam = useWorkspaceStore((s) => s.deleteTeam)
  const renameTeam = useWorkspaceStore((s) => s.renameTeam)
  const duplicateTeam = useWorkspaceStore((s) => s.duplicateTeam)
  const [name, setName] = useState('')
  const [menu, setMenu] = useCtxMenu()
  const [editing, setEditing] = useState(null)

  return (
    <div className="bs-sec">
      <div className="bs-inline-form">
        <input
          className="bs-input"
          placeholder="e.g. fullstack builders"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { createTeam(name.trim()); setName('') } }}
        />
        <button
          className="bs-icon-btn"
          onClick={() => { if (name.trim()) { createTeam(name.trim()); setName('') } }}
          title="Add team"
        >
          <PlusIcon className="bs-ico-sm" />
        </button>
      </div>
      <ul className="bs-rows">
        {teams.map((t) => (
          <li
            key={t.id}
            className="bs-row"
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { id: 'rename', label: 'Rename', onSelect: () => setEditing(t.id) },
                  { id: 'dup', label: 'Duplicate', onSelect: () => duplicateTeam(t.id) },
                  { separator: true },
                  { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => deleteTeam(t.id) },
                ],
              })
            }}
          >
            <TeamsIcon className="bs-ico-sm bs-row-lead" />
            <div className="bs-row-main">
              {editing === t.id ? (
                <input
                  autoFocus className="bs-inline-edit" defaultValue={t.name}
                  onBlur={(e) => { renameTeam(t.id, e.target.value.trim() || t.name); setEditing(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null) }}
                />
              ) : (
                <>
                  <div className="bs-row-title">{t.name}</div>
                  <div className="bs-row-meta">{t.agentPoolIds.length} pool{t.agentPoolIds.length === 1 ? '' : 's'}</div>
                </>
              )}
            </div>
            <button className="bs-row-action" onClick={() => deleteTeam(t.id)} title="Delete"><TrashIcon className="bs-ico-xs" /></button>
          </li>
        ))}
      </ul>
      {menu}
    </div>
  )
}

function AgentsPanel() {
  const agents = useWorkspaceStore((s) => s.agents)
  const pools = useWorkspaceStore((s) => s.agentPools)
  const teams = useWorkspaceStore((s) => s.teams)
  const createAgentPool = useWorkspaceStore((s) => s.createAgentPool)
  const createAgent = useWorkspaceStore((s) => s.createAgent)
  const deleteAgent = useWorkspaceStore((s) => s.deleteAgent)
  const deleteAgentPool = useWorkspaceStore((s) => s.deleteAgentPool)
  const duplicateAgent = useWorkspaceStore((s) => s.duplicateAgent)
  const openTab = useTabsStore((s) => s.openTab)

  const [expanded, setExpanded] = useState(() => new Set(pools.map((p) => p.id)))
  const [poolName, setPoolName] = useState('')
  const [poolTeam, setPoolTeam] = useState(teams[0]?.id || '')
  const [name, setName] = useState('')
  const [menu, setMenu] = useCtxMenu()

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="bs-sec">
      <Collapsible title="Create pool" defaultOpen>
        <div className="bs-inline-form">
          <input className="bs-input" placeholder="Pool name" value={poolName} onChange={(e) => setPoolName(e.target.value)} />
          <select className="bs-input bs-input-sm" value={poolTeam} onChange={(e) => setPoolTeam(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="bs-icon-btn" onClick={() => { if (poolName.trim()) { createAgentPool(poolTeam, poolName.trim()); setPoolName('') } }}><PlusIcon className="bs-ico-sm" /></button>
        </div>
      </Collapsible>

      <ul className="bs-rows">
        {pools.map((p) => {
          const poolAgents = agents.filter((a) => a.poolId === p.id)
          const open = expanded.has(p.id)
          return (
            <li key={p.id} className="bs-tree">
              <div
                className="bs-row bs-row-header"
                onClick={() => toggle(p.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({
                    x: e.clientX, y: e.clientY,
                    items: [
                      { id: 'add', label: 'New agent…', icon: PlusIcon, onSelect: () => createAgent(p.id, { name: 'New Agent' }) },
                      { separator: true },
                      { id: 'del', label: 'Delete pool', icon: TrashIcon, danger: true, onSelect: () => deleteAgentPool(p.id) },
                    ],
                  })
                }}
              >
                <ChevronRightIcon className={`bs-ico-xs bs-chevron ${open ? 'is-open' : ''}`} />
                <FolderIcon className="bs-ico-sm bs-row-lead" />
                <div className="bs-row-main">
                  <div className="bs-row-title">{p.name}</div>
                  <div className="bs-row-meta">{poolAgents.length} agent{poolAgents.length === 1 ? '' : 's'}</div>
                </div>
                <button className="bs-row-action" onClick={(e) => { e.stopPropagation(); deleteAgentPool(p.id) }} title="Delete pool"><TrashIcon className="bs-ico-xs" /></button>
              </div>
              {open && (
                <div className="bs-tree-children">
                  <div className="bs-inline-form">
                    <input className="bs-input" placeholder="Agent name" value={name} onChange={(e) => setName(e.target.value)} />
                    <button className="bs-icon-btn" onClick={() => { if (name.trim()) { createAgent(p.id, { name: name.trim() }); setName('') } }}><PlusIcon className="bs-ico-sm" /></button>
                  </div>
                  <ul className="bs-rows bs-rows-nested">
                    {poolAgents.map((a) => (
                      <li
                        key={a.id}
                        className="bs-row"
                        onClick={() => openTab({ id: agentTabId(a.id), kind: 'agent', entityId: a.id, title: a.name })}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setMenu({
                            x: e.clientX, y: e.clientY,
                            items: [
                              { id: 'open', label: 'Open', icon: LinkIcon, onSelect: () => openTab({ id: agentTabId(a.id), kind: 'agent', entityId: a.id, title: a.name }) },
                              { id: 'dup', label: 'Duplicate', onSelect: () => duplicateAgent(a.id) },
                              { separator: true },
                              { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => deleteAgent(a.id) },
                            ],
                          })
                        }}
                      >
                        <AgentsIcon className="bs-ico-sm bs-row-lead" />
                        <div className="bs-row-main">
                          <div className="bs-row-title">{a.name}</div>
                          <div className="bs-row-meta">{a.model}</div>
                        </div>
                        <button className="bs-row-action" onClick={() => deleteAgent(a.id)} title="Delete"><TrashIcon className="bs-ico-xs" /></button>
                      </li>
                    ))}
                    {poolAgents.length === 0 && <li className="bs-empty">No agents in this pool.</li>}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {menu}
    </div>
  )
}

function SkillsPanel() {
  const skills = useWorkspaceStore((s) => s.skills)
  const createSkill = useWorkspaceStore((s) => s.createSkill)
  const updateSkill = useWorkspaceStore((s) => s.updateSkill)
  const deleteSkill = useWorkspaceStore((s) => s.deleteSkill)
  const duplicateSkill = useWorkspaceStore((s) => s.duplicateSkill)
  const openTab = useTabsStore((s) => s.openTab)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [menu, setMenu] = useCtxMenu()
  const editing = skills.find((k) => k.id === editingId)

  return (
    <div className="bs-sec">
      <div className="bs-inline-form">
        <input className="bs-input" placeholder="Skill name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="bs-icon-btn"
          onClick={() => { if (name.trim()) { const s = createSkill({ name: name.trim() }); setEditingId(s.id); setName('') } }}
          title="Add skill"
        >
          <PlusIcon className="bs-ico-sm" />
        </button>
      </div>
      <ul className="bs-rows">
        {skills.map((k) => (
          <li
            key={k.id}
            className={`bs-row ${k.id === editingId ? 'is-active' : ''}`}
            onClick={() => { setEditingId(k.id); openTab({ id: skillTabId(k.id), kind: 'skill', entityId: k.id, title: k.name }) }}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { id: 'edit', label: 'Open editor', icon: LinkIcon, onSelect: () => openTab({ id: skillTabId(k.id), kind: 'skill', entityId: k.id, title: k.name }) },
                  { id: 'dup', label: 'Duplicate', onSelect: () => duplicateSkill(k.id) },
                  { separator: true },
                  { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => deleteSkill(k.id) },
                ],
              })
            }}
          >
            <SkillsIcon className="bs-ico-sm bs-row-lead" />
            <div className="bs-row-main">
              <div className="bs-row-title">{k.name}</div>
              <div className="bs-row-meta">{k.language}</div>
            </div>
            <button className="bs-row-action" onClick={(e) => { e.stopPropagation(); deleteSkill(k.id) }} title="Delete"><TrashIcon className="bs-ico-xs" /></button>
          </li>
        ))}
        {skills.length === 0 && <li className="bs-empty">No skills yet.</li>}
      </ul>
      {editing && (
        <Collapsible title={`Edit · ${editing.name}`} defaultOpen>
          <input className="bs-input" value={editing.name} onChange={(e) => updateSkill(editing.id, { name: e.target.value })} />
          <select className="bs-input" value={editing.language} onChange={(e) => updateSkill(editing.id, { language: e.target.value })}>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
          </select>
          <textarea
            className="bs-code"
            rows={10}
            value={editing.source}
            onChange={(e) => updateSkill(editing.id, { source: e.target.value })}
          />
        </Collapsible>
      )}
      {menu}
    </div>
  )
}

/* =========================================================================
 * Helpers
 * ====================================================================== */

function Collapsible({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`bs-collap ${open ? 'is-open' : ''}`}>
      <button className="bs-collap-head" onClick={() => setOpen((o) => !o)}>
        <ChevronRightIcon className={`bs-ico-xs bs-chevron ${open ? 'is-open' : ''}`} />
        <span>{title}</span>
      </button>
      {open && <div className="bs-collap-body">{children}</div>}
    </div>
  )
}

/** Hook returning [rendered menu element, openMenu(state)] */
function useCtxMenu() {
  const [state, setState] = useState(null)
  const node = state ? (
    <ContextMenu x={state.x} y={state.y} items={state.items} onClose={() => setState(null)} />
  ) : null
  return [node, setState]
}
