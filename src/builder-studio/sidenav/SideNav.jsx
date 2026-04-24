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
import { useTabsStore, agentTabId, skillTabId, teamTabId, workflowTabId } from '../stores/tabs-store'
import BlockPalette from './BlockPalette'
import ContextMenu from './ContextMenu'
import ConfirmModal from '../components/ConfirmModal'
import CreateWorkflowModal from '../components/CreateWorkflowModal'
import ImportWorkflowModal from '../components/ImportWorkflowModal'
import StyledSelect from '../components/StyledSelect'
import { pickAndParseWorkflowJSON } from '../utils/import-workflow'
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
  SettingsIcon,
} from '../components/icons'
import { BookIcon } from '../tabs/WikiGuide'

function ImportIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor"/>
      <polyline points="17 8 12 3 7 8" stroke="currentColor"/>
      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor"/>
    </svg>
  )
}

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
  const [importPending, setImportPending] = useState(null) // parsed workflow waiting for team pick
  const [importError, setImportError]   = useState(null)
  const dragRef = useRef({ active: false, startX: 0, startW: DEFAULT_W, moved: false })

  const panel = useMemo(() => TABS.find((t) => t.id === activeTab), [activeTab])
  const openWiki = useTabsStore((s) => s.openWiki)
  const openSettings = useTabsStore((s) => s.openSettings)
  const openWorkflowTab = useTabsStore((s) => s.openWorkflowTab)
  const teams = useWorkspaceStore((s) => s.teams)
  const importWorkflow = useWorkspaceStore((s) => s.importWorkflow)

  async function handleImportClick() {
    setImportError(null)
    try {
      const wf = await pickAndParseWorkflowJSON()
      setImportPending(wf)
    } catch (err) {
      if (err.message !== 'cancelled') setImportError(err.message)
    }
  }

  function handleImportConfirm(name, teamId) {
    if (!importPending) return
    const wf = importWorkflow(name, teamId, {
      nodes: importPending.nodes,
      edges: importPending.edges,
      subBlockValues: importPending.subBlockValues,
    })
    openWorkflowTab(wf.id, wf.name)
    setImportPending(null)
  }

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
      const next = Math.max(MIN_W, Math.min(MAX_W,
        _isExtension ? dragRef.current.startW - dx : dragRef.current.startW + dx
      ))
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

  // Keyboard: Cmd/Ctrl+\ (browser) or Alt/Option+\ (extension) toggles left panel
  const _isExtension = typeof window !== 'undefined' && window.__BS_MODE__ === 'vscode-extension'
  useEffect(() => {
    function onKey(e) {
      const mod = _isExtension ? e.altKey : (e.metaKey || e.ctrlKey)
      // Use e.code for physical key — Alt changes e.key on macOS (produces «)
      if (mod && e.code === 'Backslash') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [_isExtension])

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
          onClick={handleImportClick}
          title="Import workflow JSON"
        >
          <ImportIcon className="bs-rail-ico" />
          <span className="bs-rail-label">Import</span>
        </button>
        <button
          className="bs-rail-btn"
          onClick={() => openWiki()}
          title="Wiki — Agent Builder Studio Guide"
        >
          <BookIcon className="bs-rail-ico" />
          <span className="bs-rail-label">Wiki</span>
        </button>
        <button
          className="bs-rail-btn"
          onClick={() => openSettings()}
          title={_isExtension ? 'Settings & shortcuts (⌥,)' : 'Settings & shortcuts (⌘,)'}
        >
          <SettingsIcon className="bs-rail-ico" />
          <span className="bs-rail-label">Settings</span>
        </button>
        <div style={{ height: 8 }} />
        <button
          className="bs-rail-btn"
          onClick={() => setOpen((o) => !o)}
          title={open
            ? (_isExtension ? 'Collapse panel (⌥\\)' : 'Collapse panel (⌘\\)')
            : (_isExtension ? 'Expand panel (⌥\\)' : 'Expand panel (⌘\\)')}
        >
          <PanelLeftIcon className="bs-rail-ico" />
          <span className="bs-rail-label">{open ? 'Hide' : 'Show'}</span>
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
            <div>Click to {open ? 'collapse' : 'expand'} <kbd>{_isExtension ? '⌥\\' : '⌘\\'}</kbd></div>
            <div>Drag to resize</div>
          </div>
        )}
      </div>

      {/* ── Import error toast ── */}
      {importError && (
        <div className="bs-import-error-toast" onClick={() => setImportError(null)}>
          <span>⚠ {importError}</span>
          <button className="bs-import-error-close">×</button>
        </div>
      )}

      {/* ── Import workflow modal ── */}
      {importPending && (
        <ImportWorkflowModal
          teams={teams}
          defaultName={importPending.name}
          defaultTeamId={teams[0]?.id}
          onCancel={() => setImportPending(null)}
          onImport={handleImportConfirm}
        />
      )}
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
  const openWorkflowTab = useTabsStore((s) => s.openWorkflowTab)
  const renameTab = useTabsStore((s) => s.renameTab)
  const closeTab = useTabsStore((s) => s.closeTab)
  const [menu, setMenu] = useCtxMenu()
  const [editing, setEditing] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // { id, name }

  return (
    <div className="bs-sec">
      <button
        className="bs-add-btn"
        onClick={() => setNewOpen(true)}
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
            onClick={() => openWorkflowTab(w.id, w.name)}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(w.id) }}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { id: 'open', label: 'Open in Tab', icon: LinkIcon, onSelect: () => openWorkflowTab(w.id, w.name) },
                  { id: 'rename', label: 'Rename', onSelect: () => setEditing(w.id) },
                  { id: 'dup', label: 'Duplicate', onSelect: () => { const copy = duplicateWorkflow(w.id); if (copy) openWorkflowTab(copy.id, copy.name) } },
                  { separator: true },
                  { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => setPendingDelete({ id: w.id, name: w.name }) },
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
                  onBlur={(e) => { const v = e.target.value.trim() || w.name; renameWorkflow(w.id, v); renameTab(workflowTabId(w.id), v); setEditing(null) }}
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
              onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: w.id, name: w.name }) }}
              title="Delete workflow"
            >
              <TrashIcon className="bs-ico-xs" />
            </button>
          </li>
        ))}
      </ul>
      {menu}

      {newOpen && (
        <CreateWorkflowModal
          teams={teams}
          onCancel={() => setNewOpen(false)}
          onCreate={(name, teamId) => { const wf = createWorkflow(name, teamId); openWorkflowTab(wf.id, wf.name); setNewOpen(false) }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete workflow?"
          message={`"${pendingDelete.name}" and all its blocks will be removed. This cannot be undone.`}
          confirmLabel="Delete workflow"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { closeTab(workflowTabId(pendingDelete.id)); deleteWorkflow(pendingDelete.id); setPendingDelete(null) }}
        />
      )}
    </div>
  )
}

function TeamsPanel() {
  const teams = useWorkspaceStore((s) => s.teams)
  const createTeam = useWorkspaceStore((s) => s.createTeam)
  const deleteTeam = useWorkspaceStore((s) => s.deleteTeam)
  const renameTeam = useWorkspaceStore((s) => s.renameTeam)
  const duplicateTeam = useWorkspaceStore((s) => s.duplicateTeam)
  const openTab = useTabsStore((s) => s.openTab)
  const [name, setName] = useState('')
  const [menu, setMenu] = useCtxMenu()
  const [editing, setEditing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null) // { id, name }

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
            onClick={() => openTab({ id: teamTabId(t.id), kind: 'team', entityId: t.id, title: t.name })}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { id: 'open', label: 'Open', icon: LinkIcon, onSelect: () => openTab({ id: teamTabId(t.id), kind: 'team', entityId: t.id, title: t.name }) },
                  { id: 'rename', label: 'Rename', onSelect: () => setEditing(t.id) },
                  { id: 'dup', label: 'Duplicate', onSelect: () => duplicateTeam(t.id) },
                  { separator: true },
                  { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => setPendingDelete({ id: t.id, name: t.name }) },
                ],
              })
            }}
          >
            <TeamsIcon className="bs-ico-sm bs-row-lead" />
            <div className="bs-row-main">
              {editing === t.id ? (
                <input
                  autoFocus className="bs-inline-edit" defaultValue={t.name}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
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
            <button className="bs-row-action" onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: t.id, name: t.name }) }} title="Delete"><TrashIcon className="bs-ico-xs" /></button>
          </li>
        ))}
      </ul>
      {menu}
      {pendingDelete && (
        <ConfirmModal
          title="Delete team?"
          message={`"${pendingDelete.name}" will be removed. Agent pools and agents belonging to this team remain, but become orphaned.`}
          confirmLabel="Delete team"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { deleteTeam(pendingDelete.id); setPendingDelete(null) }}
        />
      )}
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
  const [pendingDelete, setPendingDelete] = useState(null) // { kind: 'pool'|'agent', id, name }

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
        <div className="bs-create-pool-form">
          <input
            className="bs-input"
            placeholder="Pool name"
            value={poolName}
            onChange={(e) => setPoolName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && poolName.trim()) {
                createAgentPool(poolTeam, poolName.trim())
                setPoolName('')
              }
            }}
          />
          <div className="bs-create-pool-row">
            <StyledSelect
              value={poolTeam}
              options={teams.map((t) => ({ id: t.id, label: t.name }))}
              onChange={(id) => setPoolTeam(id)}
              placeholder="Select team"
              className="bs-create-pool-team"
            />
            <button
              className="bs-icon-btn"
              onClick={() => { if (poolName.trim()) { createAgentPool(poolTeam, poolName.trim()); setPoolName('') } }}
              title="Create pool"
            >
              <PlusIcon className="bs-ico-sm" />
            </button>
          </div>
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
                      { id: 'del', label: 'Delete pool', icon: TrashIcon, danger: true, onSelect: () => setPendingDelete({ kind: 'pool', id: p.id, name: p.name }) },
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
                <button className="bs-row-action" onClick={(e) => { e.stopPropagation(); setPendingDelete({ kind: 'pool', id: p.id, name: p.name }) }} title="Delete pool"><TrashIcon className="bs-ico-xs" /></button>
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
                              { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => setPendingDelete({ kind: 'agent', id: a.id, name: a.name }) },
                            ],
                          })
                        }}
                      >
                        <AgentsIcon className="bs-ico-sm bs-row-lead" />
                        <div className="bs-row-main">
                          <div className="bs-row-title">{a.name}</div>
                          <div className="bs-row-meta">{a.model}</div>
                        </div>
                        <button className="bs-row-action" onClick={(e) => { e.stopPropagation(); setPendingDelete({ kind: 'agent', id: a.id, name: a.name }) }} title="Delete"><TrashIcon className="bs-ico-xs" /></button>
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
      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.kind === 'pool' ? 'Delete agent pool?' : 'Delete agent?'}
          message={
            pendingDelete.kind === 'pool'
              ? `"${pendingDelete.name}" will be removed. Agents inside the pool remain, but become orphaned until reassigned.`
              : `"${pendingDelete.name}" will be removed from its pool. Workflows referencing this agent will need to be re-wired.`
          }
          confirmLabel={pendingDelete.kind === 'pool' ? 'Delete pool' : 'Delete agent'}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete.kind === 'pool') deleteAgentPool(pendingDelete.id)
            else deleteAgent(pendingDelete.id)
            setPendingDelete(null)
          }}
        />
      )}
    </div>
  )
}

function SkillsPanel() {
  const skills = useWorkspaceStore((s) => s.skills)
  const createSkill = useWorkspaceStore((s) => s.createSkill)
  const deleteSkill = useWorkspaceStore((s) => s.deleteSkill)
  const duplicateSkill = useWorkspaceStore((s) => s.duplicateSkill)
  const openTab = useTabsStore((s) => s.openTab)
  const [name, setName] = useState('')
  const [menu, setMenu] = useCtxMenu()
  const [pendingDelete, setPendingDelete] = useState(null) // { id, name }

  return (
    <div className="bs-sec">
      <div className="bs-inline-form">
        <input className="bs-input" placeholder="Skill name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="bs-icon-btn"
          onClick={() => { if (name.trim()) { const s = createSkill({ name: name.trim() }); openTab({ id: skillTabId(s.id), kind: 'skill', entityId: s.id, title: name.trim() }); setName('') } }}
          title="Add skill"
        >
          <PlusIcon className="bs-ico-sm" />
        </button>
      </div>
      <ul className="bs-rows">
        {skills.map((k) => (
          <li
            key={k.id}
            className="bs-row"
            onClick={() => openTab({ id: skillTabId(k.id), kind: 'skill', entityId: k.id, title: k.name })}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { id: 'edit', label: 'Open editor', icon: LinkIcon, onSelect: () => openTab({ id: skillTabId(k.id), kind: 'skill', entityId: k.id, title: k.name }) },
                  { id: 'dup', label: 'Duplicate', onSelect: () => duplicateSkill(k.id) },
                  { separator: true },
                  { id: 'del', label: 'Delete', icon: TrashIcon, danger: true, onSelect: () => setPendingDelete({ id: k.id, name: k.name }) },
                ],
              })
            }}
          >
            <SkillsIcon className="bs-ico-sm bs-row-lead" />
            <div className="bs-row-main">
              <div className="bs-row-title">{k.name}</div>
              <div className="bs-row-meta">{k.language}</div>
            </div>
            <button className="bs-row-action" onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: k.id, name: k.name }) }} title="Delete"><TrashIcon className="bs-ico-xs" /></button>
          </li>
        ))}
        {skills.length === 0 && <li className="bs-empty">No skills yet.</li>}
      </ul>
      {menu}
      {pendingDelete && (
        <ConfirmModal
          title="Delete skill?"
          message={`"${pendingDelete.name}" will be removed. Agents or workflows that reference this skill will silently skip it on the next run.`}
          confirmLabel="Delete skill"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteSkill(pendingDelete.id)
            setPendingDelete(null)
          }}
        />
      )}
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
