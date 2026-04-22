/**
 * Settings tab — keyboard shortcuts + LLM provider config.
 *
 * The table is grouped by context (canvas, rename, inspector, etc.) and
 * driven by `SHORTCUTS` so adding a new binding in Canvas.jsx /
 * AgentBuilderPage.jsx only needs a corresponding row here.
 */
import { useState, useEffect, useCallback } from 'react'
import { SettingsIcon, KeyboardIcon, McpIcon } from '../components/icons'
import { changeRuntimeProvider, fetchAvailableProviders } from '../api/llm-provider-client'
import McpServersPanel from './McpServersPanel'
import { useLlmConfigStore } from '../stores/llm-config-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useWorkflowStore } from '../stores/workflow-store'

const MOD = /Mac|iPhone|iPad/.test(typeof navigator !== 'undefined' ? navigator.platform : '') ? '⌘' : 'Ctrl'

const RunShortcutIcon = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polygon points="8,6 18,12 8,18" fill="currentColor" stroke="none" />
  </svg>
)

const SaveShortcutIcon = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
)

const ExportShortcutIcon = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const SHORTCUTS = [
  {
    group: 'Actions',
    items: [
      { keys: [MOD, '1'], desc: 'Run active workflow', icon: RunShortcutIcon, tone: 'run' },
      { keys: [MOD, '2'], desc: 'Save active workflow', icon: SaveShortcutIcon, tone: 'save' },
      { keys: [MOD, 'S'], desc: 'Save active workflow (alt)', icon: SaveShortcutIcon, tone: 'save' },
      { keys: [MOD, '3'], desc: 'Export active workflow as JSON', icon: ExportShortcutIcon, tone: 'export' },
    ],
  },
  {
    group: 'Canvas',
    items: [
      { keys: ['Delete'], or: ['Backspace'], desc: 'Delete selected node(s) — confirm dialog' },
      { keys: [MOD, 'D'], desc: 'Duplicate selected node(s)' },
      { keys: [MOD, 'B'], desc: 'Toggle disable / enable selected node' },
      { keys: [MOD, 'I'], desc: 'Inspect the selected node (after run)' },
      { keys: [MOD, 'C'], desc: 'Copy selected node ID to clipboard' },
      { keys: [MOD, 'F'], desc: 'Fit all nodes into view' },
      { keys: [MOD, 'R'], desc: 'Reset zoom to 1:1' },
      { keys: [MOD, 'Z'], desc: 'Undo last canvas action' },
      { keys: [MOD, '⇧', 'Z'], or: [MOD, 'Y'], desc: 'Redo last undone action' },
      { keys: ['F2'], or: ['Enter'], desc: 'Rename the selected node' },
      { keys: ['Esc'], desc: 'Deselect / cancel rename' },
      { keys: ['↑', '↓', '←', '→'], desc: 'Nudge selected node(s) by 10px' },
      { keys: ['Shift', '+', 'Arrow'], desc: 'Nudge by 50px' },
      { keys: ['Double-click'], desc: 'Inline rename the node title' },
      { keys: ['Right-click'], desc: 'Open canvas / block context menu' },
      { keys: ['H'], desc: 'Switch to Pan mode — drag canvas to pan' },
      { keys: ['V'], desc: 'Switch to Select mode — drag to rubber-band select' },
      { keys: ['Left-drag'], desc: 'Rubber-band select multiple nodes (Select mode)' },
      { keys: [MOD, 'Click'], desc: 'Add / remove a node from selection' },
    ],
  },
  {
    group: 'Workspace',
    items: [
      { keys: [MOD, '\\'], desc: 'Toggle left panel (block palette)', extensionKeys: ['⌥', '\\'] },
      { keys: [MOD, '/'], desc: 'Toggle inspector panel', extensionKeys: ['⌥', '/'] },
      { keys: [MOD, '.'], desc: 'Toggle bottom panel', extensionKeys: ['⌥', '.'] },
      { keys: [MOD, ','], desc: 'Open Settings', extensionKeys: ['⌥', ','] },
      { keys: ['?'], desc: 'Open Settings (shortcuts cheat-sheet)' },
    ],
  },
  {
    group: 'Edges',
    items: [
      { keys: ['Click'], desc: 'Select an edge' },
      { keys: ['Delete'], desc: 'Delete the selected edge' },
      { keys: ['Drag handle'], desc: 'Connect two blocks' },
    ],
  },
]

/* Extension-only shortcuts — shown only when running inside VS Code */
const EXTENSION_SHORTCUTS = [
  {
    group: 'VS Code Extension',
    items: [
      { keys: [MOD, 'M'], desc: 'Toggle light / dark theme' },
      { keys: ['⌥', '\\'], desc: 'Toggle left panel (replaces ⌘\\)' },
      { keys: ['⌥', '/'], desc: 'Toggle inspector panel (replaces ⌘/)' },
      { keys: ['⌥', '.'], desc: 'Toggle bottom panel (replaces ⌘.)' },
      { keys: ['⌥', ','], desc: 'Open Settings (replaces ⌘,)' },
    ],
  },
]

/* ── Sidebar tab definitions ─────────────────────────────────────────── */
const TipsIcon = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)

const LlmIcon = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="4" y="6" width="16" height="12" rx="3" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" />
    <path d="M12 3v3" />
  </svg>
)

const AppConfigIcon = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
)

const DatabaseIcon = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
  </svg>
)

const FolderOpenIcon = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

const CopyPathIcon = (p) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const CheckPathIcon = (p) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const SETTINGS_TABS = [
  { id: 'shortcuts', label: 'Keyboard Shortcuts', Icon: KeyboardIcon },
  { id: 'mcp', label: 'MCP Servers', Icon: McpIcon },
  { id: 'tips', label: 'Tips & Tricks', Icon: TipsIcon },
  { id: 'llm', label: 'LLM Provider Configuration', Icon: LlmIcon },
  { id: 'appconfig', label: 'App Config', Icon: AppConfigIcon, extensionOnly: true },
]

export default function SettingsTab() {
  const [activeSection, setActiveSection] = useState('shortcuts')
  const isExtension = typeof window !== 'undefined' && window.__BS_MODE__ === 'vscode-extension'
  const visibleTabs = SETTINGS_TABS.filter(t => !t.extensionOnly || isExtension)

  return (
    <div className="bs-settings-layout">
      {/* Left sidebar */}
      <nav className="bs-settings-sidebar">
        <div className="bs-settings-sidebar-head">
          <SettingsIcon className="bs-ico-sm" />
          <span>Settings</span>
        </div>
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            className={`bs-settings-sidebar-item ${activeSection === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveSection(tab.id)}
          >
            <tab.Icon className="bs-ico-sm" />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Right content area */}
      <div className="bs-settings-content">
        {activeSection === 'shortcuts' && <KeyboardShortcutsSection />}
        {activeSection === 'mcp' && <McpServersPanel />}
        {activeSection === 'tips' && <TipsAndTricksSection />}
        {activeSection === 'llm' && <LlmConfigPanel />}
        {activeSection === 'appconfig' && <AppConfigPanel />}
      </div>
    </div>
  )
}

/* ── Keyboard Shortcuts Section ──────────────────────────────────────── */
function KeyboardShortcutsSection() {
  const isExtension = typeof window !== 'undefined' && window.__BS_MODE__ === 'vscode-extension'
  const groups = isExtension ? [...SHORTCUTS, ...EXTENSION_SHORTCUTS] : SHORTCUTS
  return (
    <div className="bs-settings-pane">
      <div className="bs-settings-section-head">
        <KeyboardIcon className="bs-ico-sm" />
        <h3 className="bs-settings-h3">Keyboard shortcuts</h3>
      </div>
      <div className="bs-settings-shortcuts">
        {groups.map((g) => (
          <div key={g.group} className="bs-settings-group">
            <div className="bs-settings-group-title">{g.group}</div>
            <table className="bs-kbd-table">
              <tbody>
                {g.items.map((it, i) => (
                  <tr key={i}>
                    <td className="bs-kbd-cell">
                      <KeyCombo keys={isExtension && it.extensionKeys ? it.extensionKeys : it.keys} />
                      {it.or && (
                        <>
                          <span className="bs-kbd-or">or</span>
                          <KeyCombo keys={it.or} />
                        </>
                      )}
                    </td>
                    <td className="bs-kbd-desc"><ShortcutDescription item={it} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Tips & Tricks Section ───────────────────────────────────────────── */
function TipsAndTricksSection() {
  return (
    <div className="bs-settings-pane">
      <div className="bs-settings-section-head">
        <TipsIcon className="bs-ico-sm" />
        <h3 className="bs-settings-h3">Tips & tricks</h3>
      </div>
      <ul className="bs-tips">
        <li className="bs-tip">
          <span className="bs-tip-badge bs-tip-badge-input">Input</span>
          <span className="bs-tip-text">
            Drop a <b>User Input</b> block into the canvas and the Run dialog collects its value at runtime.
          </span>
        </li>
        <li className="bs-tip">
          <span className="bs-tip-badge bs-tip-badge-json">JSON</span>
          <span className="bs-tip-text">
            Toggle <b>Strict JSON output</b> on an agent to use structured-output mode
            (OpenAI <code>json_schema</code>).
          </span>
        </li>
        <li className="bs-tip">
          <span className="bs-tip-badge bs-tip-badge-menu">Menu</span>
          <span className="bs-tip-text">
            Right-click a block for <i>Open / Rename / Duplicate / Disconnect / Copy ID / Delete</i>.
          </span>
        </li>
        <li className="bs-tip">
          <span className="bs-tip-badge bs-tip-badge-ux">UX</span>
          <span className="bs-tip-text">
            Inline-edit <i>toggles</i> and <i>dropdowns</i> directly on the node card —
            no need to open the inspector.
          </span>
        </li>
        <li className="bs-tip">
          <span className="bs-tip-badge bs-tip-badge-mcp">MCP</span>
          <span className="bs-tip-text">
            Add an MCP server above, drop an <b>MCP Tool</b> block, and use <code>&#123;&#123;input&#125;&#125;</code>
            inside the arguments JSON to pipe upstream output into a tool call.
          </span>
        </li>
      </ul>
    </div>
  )
}

/* ── LLM Provider Configuration Panel ────────────────────────────────── */

function LlmConfigPanel() {
  const models = useLlmConfigStore((s) => s.models)
  const defaultModel = useLlmConfigStore((s) => s.defaultModel)
  const activeProvider = useLlmConfigStore((s) => s.activeProvider)
  const setConfig = useLlmConfigStore((s) => s.setConfig)
  const applyDefaultModelToAll = useWorkspaceStore((s) => s.applyDefaultModelToAll)
  const syncToServer = useWorkspaceStore((s) => s.syncToServer)

  const reset = useWorkspaceStore((s) => s.reset)

  const [pending, setPending] = useState(null)   // chip clicked but not yet saved
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null) // { count } after apply
  const [loadError, setLoadError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const config = await fetchAvailableProviders()
      setConfig(config)
    } catch (e) {
      setLoadError(e.message || 'Failed to load provider configuration')
    } finally {
      setLoading(false)
    }
  }, [setConfig])

  useEffect(() => { refresh() }, [refresh])

  const saveDefault = useCallback(async () => {
    if (!pending || pending === defaultModel) return
    setSaving(true)
    setLoadError('')
    try {
      await changeRuntimeProvider({ family: pending, model: pending })
      await refresh()
      setPending(null)
    } catch (e) {
      setLoadError(e.message || 'Failed to save default model')
    } finally {
      setSaving(false)
    }
  }, [pending, defaultModel, refresh])

  const applyToAll = useCallback(async () => {
    const target = defaultModel
    if (!target) return
    setApplying(true)
    setApplyResult(null)
    try {
      const count = applyDefaultModelToAll(target)
      await syncToServer()
      setApplyResult({ count })
      setTimeout(() => setApplyResult(null), 4000)
    } catch (e) {
      setLoadError(e.message || 'Failed to apply model to all nodes')
    } finally {
      setApplying(false)
    }
  }, [defaultModel, applyDefaultModelToAll, syncToServer])

  const doReset = useCallback(() => {
    // 1. Clear the persisted localStorage blob.
    try { localStorage.removeItem('builder-studio/workspace') } catch { /* sandboxed */ }
    // 2. Reset workspace store → workflows = [demoWorkflow].
    reset()
    // 3. If a default model is active, stamp it on every node in the (now
    //    seed-only) workflow list so no node can ever fall back to gpt-4o-mini.
    if (defaultModel) applyDefaultModelToAll(defaultModel)
    // 4. Wipe the runtime canvas store — useEffect in AgentBuilderPage will
    //    re-load the seed workflow from the updated workspace store.
    useWorkflowStore.getState().reset()
    setConfirmReset(false)
  }, [reset, defaultModel, applyDefaultModelToAll])

  return (
    <div className="bs-llm-config">
      <div className="bs-settings-section-head">
        <svg className="bs-ico-sm" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="6" width="16" height="12" rx="3" />
          <circle cx="9" cy="12" r="1.2" fill="currentColor" />
          <circle cx="15" cy="12" r="1.2" fill="currentColor" />
          <path d="M12 3v3" />
        </svg>
        <h3 className="bs-settings-h3">LLM Provider Configuration</h3>
      </div>

      {loading && (
        <div className="bs-llm-config-loading">Loading provider configuration…</div>
      )}

      {!loading && loadError && (
        <div className="bs-llm-config-error">{loadError}</div>
      )}

      {!loading && !loadError && models.length === 0 && (
        <div className="bs-llm-config-error">
          No model provider found. Ensure the backend is running and
          <code>/builder-studio/llm/providers</code> returns at least one model.
        </div>
      )}

      {!loading && models.length > 0 && (
        <div className="bs-llm-config-status">
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Active Provider</span>
            <span className="bs-llm-status-badge">{activeProvider || '—'}</span>
          </div>
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Default Model</span>
            <span className="bs-llm-status-badge bs-llm-status-model">
              {pending && pending !== defaultModel ? pending : (defaultModel || '—')}
            </span>
          </div>
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Available Models</span>
            <div className="bs-llm-model-chips">
              {models.map((m) => {
                const isSaved = m.id === defaultModel
                const isPending = m.id === pending && pending !== defaultModel
                return (
                  <span
                    key={m.id}
                    className={`bs-llm-model-chip bs-llm-model-chip-btn${
                      isSaved ? ' bs-llm-model-chip-active' : ''
                    }${isPending ? ' bs-llm-model-chip-pending' : ''}`}
                    title={`${m.group} — ${m.id}`}
                    onClick={() => setPending(isSaved ? null : m.id)}
                  >
                    {m.label}
                  </span>
                )
              })}
            </div>
          </div>

          {pending && pending !== defaultModel && (
            <div className="bs-llm-config-actions">
              <button
                className="bs-btn-sm bs-btn-success"
                onClick={saveDefault}
                disabled={saving}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
                {saving ? 'Saving…' : 'Save as Default'}
              </button>
              <button
                className="bs-btn-sm bs-btn-secondary"
                onClick={() => setPending(null)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          )}

          <div className="bs-llm-apply-row">
            <button
              className="bs-btn-sm bs-btn-apply-all"
              onClick={applyToAll}
              disabled={applying || !defaultModel}
              title={`Set model = "${defaultModel}" on every agent / AI node in every workflow`}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8h12M8 2l6 6-6 6"/>
              </svg>
              {applying ? 'Applying…' : `Apply "${defaultModel || '—'}" to all nodes`}
            </button>
            {applyResult && (
              <span className="bs-llm-apply-result">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8.5 6 11.5 13 4.5"/></svg>
                Updated {applyResult.count} node{applyResult.count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="bs-llm-reset-row">
            {!confirmReset ? (
              <button
                className="bs-btn-sm bs-btn-reset-workspace"
                onClick={() => setConfirmReset(true)}
                title="Clears all saved workflows and reloads from the built-in seed"
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1.5 4 4 1.5 6.5 4"/><path d="M4 1.5v7a5 5 0 0 0 10 0V7"/>
                </svg>
                Reset workspace to defaults
              </button>
            ) : (
              <div className="bs-reset-confirm">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2L14.5 13H1.5Z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r=".6" fill="#f87171"/>
                </svg>
                <span className="bs-reset-confirm-text">
                  Resets all workflows to the seed demo and sets every node's model to <strong>{defaultModel || 'the current default'}</strong>. Custom workflows will be lost.
                </span>
                <button className="bs-btn-sm bs-btn-danger" onClick={doReset}>Yes, reset</button>
                <button className="bs-btn-sm bs-btn-secondary" onClick={() => setConfirmReset(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KeyCombo({ keys }) {
  return (
    <span className="bs-kbd-combo">
      {keys.map((k, i) => (
        <span key={i} className="bs-kbd-part">
          {k === '+' || k === 'or' ? <span className="bs-kbd-plus">{k}</span> : <kbd className="bs-kbd">{k}</kbd>}
        </span>
      ))}
    </span>
  )
}

function ShortcutDescription({ item }) {
  if (!item.icon) return item.desc
  const Icon = item.icon
  return (
    <span className="bs-kbd-action-desc">
      <span className={`bs-kbd-action-icon is-${item.tone || 'default'}`}>
        <Icon className="bs-kbd-action-svg" />
      </span>
      <span>{item.desc}</span>
    </span>
  )
}

/* ── App Config Panel (extension-only) ──────────────────────────────── */
function AppConfigPanel() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    const BASE = (
      (typeof globalThis !== 'undefined' && globalThis.__BS_BRIDGE_BASE__) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CONVENGINE_BASE) ||
      ''
    ).replace(/\/$/, '')
    fetch(`${BASE}/builder-studio/app-config`)
      .then(r => r.json())
      .then(d => { setConfig(d); setLoading(false) })
      .catch(e => { setError(e.message || 'Failed to load app config'); setLoading(false) })
  }, [])

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="bs-settings-pane">
      <div className="bs-settings-section-head">
        <AppConfigIcon className="bs-ico-sm" />
        <h3 className="bs-settings-h3">App Config</h3>
        <span className="bs-appconfig-mode-badge">VS Code Extension</span>
      </div>

      {loading && <div className="bs-llm-config-loading">Loading…</div>}
      {!loading && error && <div className="bs-llm-config-error">{error}</div>}

      {!loading && !error && config && (
        <div className="bs-appconfig-cards">
          <div className="bs-appconfig-card">
            <div className="bs-appconfig-card-icon">
              <DatabaseIcon />
            </div>
            <div className="bs-appconfig-card-body">
              <div className="bs-appconfig-card-label">SQLite Database</div>
              <div className="bs-appconfig-path-row">
                <code className="bs-appconfig-path" title={config.dbPath}>{config.dbPath}</code>
                <button
                  className={`bs-appconfig-copy-btn${copied === 'db' ? ' is-copied' : ''}`}
                  title="Copy path"
                  onClick={() => copy(config.dbPath, 'db')}
                >
                  {copied === 'db' ? <CheckPathIcon /> : <CopyPathIcon />}
                </button>
              </div>
              <div className="bs-appconfig-card-hint">
                Stores workspaces, MCP server configs, and deployments.
              </div>
            </div>
          </div>

          <div className="bs-appconfig-card">
            <div className="bs-appconfig-card-icon">
              <FolderOpenIcon />
            </div>
            <div className="bs-appconfig-card-body">
              <div className="bs-appconfig-card-label">Storage Directory</div>
              <div className="bs-appconfig-path-row">
                <code className="bs-appconfig-path" title={config.storagePath}>{config.storagePath}</code>
                <button
                  className={`bs-appconfig-copy-btn${copied === 'dir' ? ' is-copied' : ''}`}
                  title="Copy path"
                  onClick={() => copy(config.storagePath, 'dir')}
                >
                  {copied === 'dir' ? <CheckPathIcon /> : <CopyPathIcon />}
                </button>
              </div>
              <div className="bs-appconfig-card-hint">
                VS Code global storage directory for this extension.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
