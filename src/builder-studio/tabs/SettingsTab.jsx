/**
 * Settings tab — keyboard shortcuts + LLM provider config.
 *
 * The table is grouped by context (canvas, rename, inspector, etc.) and
 * driven by `SHORTCUTS` so adding a new binding in Canvas.jsx /
 * AgentBuilderPage.jsx only needs a corresponding row here.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { SettingsIcon, KeyboardIcon, McpIcon, DeployIcon } from '../components/icons'
import { changeRuntimeProvider, fetchAvailableProviders } from '../api/llm-provider-client'
import McpServersPanel from './McpServersPanel'
import { useLlmConfigStore } from '../stores/llm-config-store'

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
      { keys: [MOD, '4'], desc: 'Deploy active workflow', icon: DeployIcon, tone: 'deploy' },
    ],
  },
  {
    group: 'Canvas',
    items: [
      { keys: ['Delete'], or: ['Backspace'], desc: 'Delete the selected node' },
      { keys: [MOD, 'D'], desc: 'Duplicate the selected node' },
      { keys: [MOD, 'B'], desc: 'Toggle disable / enable selected node' },
      { keys: [MOD, 'I'], desc: 'Inspect the selected node (after run)' },
      { keys: [MOD, 'C'], desc: 'Copy selected node ID to clipboard' },
      { keys: [MOD, 'F'], desc: 'Fit all nodes into view' },
      { keys: [MOD, 'R'], desc: 'Reset zoom to 1:1' },
      { keys: [MOD, 'Z'], desc: 'Undo last canvas action' },
      { keys: [MOD, '⇧', 'Z'], or: [MOD, 'Y'], desc: 'Redo last undone action' },
      { keys: ['F2'], or: ['Enter'], desc: 'Rename the selected node' },
      { keys: ['Esc'], desc: 'Deselect / cancel rename' },
      { keys: ['↑', '↓', '←', '→'], desc: 'Nudge selected node by 10px' },
      { keys: ['Shift', '+', 'Arrow'], desc: 'Nudge by 50px' },
      { keys: ['Double-click'], desc: 'Inline rename the node title' },
      { keys: ['Right-click'], desc: 'Open block context menu' },
    ],
  },
  {
    group: 'Workspace',
    items: [
      { keys: [MOD, '\\'], desc: 'Toggle left panel (block palette)' },
      { keys: [MOD, '/'], desc: 'Toggle inspector panel' },
      { keys: [MOD, '.'], desc: 'Toggle bottom panel' },
      { keys: [MOD, ','], desc: 'Open Settings' },
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

const SETTINGS_TABS = [
  { id: 'shortcuts', label: 'Keyboard Shortcuts', Icon: KeyboardIcon },
  { id: 'mcp', label: 'MCP Servers', Icon: McpIcon },
  { id: 'tips', label: 'Tips & Tricks', Icon: TipsIcon },
  { id: 'llm', label: 'LLM Provider Configuration', Icon: LlmIcon },
]

export default function SettingsTab() {
  const [activeSection, setActiveSection] = useState('shortcuts')

  return (
    <div className="bs-settings-layout">
      {/* Left sidebar */}
      <nav className="bs-settings-sidebar">
        <div className="bs-settings-sidebar-head">
          <SettingsIcon className="bs-ico-sm" />
          <span>Settings</span>
        </div>
        {SETTINGS_TABS.map((tab) => (
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
      </div>
    </div>
  )
}

/* ── Keyboard Shortcuts Section ──────────────────────────────────────── */
function KeyboardShortcutsSection() {
  return (
    <div className="bs-settings-pane">
      <div className="bs-settings-section-head">
        <KeyboardIcon className="bs-ico-sm" />
        <h3 className="bs-settings-h3">Keyboard shortcuts</h3>
      </div>
      <div className="bs-settings-shortcuts">
        {SHORTCUTS.map((g) => (
          <div key={g.group} className="bs-settings-group">
            <div className="bs-settings-group-title">{g.group}</div>
            <table className="bs-kbd-table">
              <tbody>
                {g.items.map((it, i) => (
                  <tr key={i}>
                    <td className="bs-kbd-cell">
                      <KeyCombo keys={it.keys} />
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
  const consumerConfig = useLlmConfigStore((s) => s.consumerConfig)
  const models = useLlmConfigStore((s) => s.models)
  const defaultModel = useLlmConfigStore((s) => s.defaultModel)
  const activeProvider = useLlmConfigStore((s) => s.activeProvider)
  const setConfig = useLlmConfigStore((s) => s.setConfig)
  const initialConfigRef = useRef(null)

  const [raw, setRaw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refreshFromBackend = useCallback(async ({ keepInitial = false } = {}) => {
    setLoading(true)
    const config = await fetchAvailableProviders()
    if (!keepInitial || !initialConfigRef.current) initialConfigRef.current = config
    setConfig(config)
    setRaw(JSON.stringify(config, null, 2))
    setError('')
    setLoading(false)
    return config
  }, [setConfig])

  useEffect(() => {
    refreshFromBackend().catch((e) => {
      setError(e.message || 'Failed to load provider config')
      setLoading(false)
    })
  }, [refreshFromBackend])

  const apply = useCallback(async () => {
    if (!raw.trim()) {
      setError('Provider config cannot be empty')
      return
    }
    try {
      const parsed = JSON.parse(raw)
      const provider = parsed.provider || parsed.defaults?.provider
      const providerConfig = provider ? parsed[provider] : null
      const next = await changeRuntimeProvider({
        provider,
        model: providerConfig?.model,
        temperature: parsed.temperature,
      })
      setConfig(next)
      setRaw(JSON.stringify(next, null, 2))
      setError('')
    } catch (e) {
      setError(`Invalid JSON: ${e.message}`)
    }
  }, [raw, setConfig])

  const reset = useCallback(async () => {
    try {
      const defaults = initialConfigRef.current?.defaults
      if (!defaults) return
      const next = await changeRuntimeProvider(defaults)
      setConfig(next)
      setRaw(JSON.stringify(next, null, 2))
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to reset provider config')
    }
  }, [setConfig])

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

      <p className="bs-llm-config-desc">
        Provide your LLM provider config as JSON. The <code>provider</code> key sets the active provider
        whose <code>model</code> becomes the default in Agent and Router blocks. Each provider entry can
        specify <code>model</code>, <code>base-url</code>, and metadata returned by the backend.
      </p>

      <div className="bs-llm-config-actions">
        <button className="bs-btn-sm bs-btn-primary" onClick={apply} disabled={!raw.trim() || loading}>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
          {loading ? 'Loading…' : 'Apply'}
        </button>
        {initialConfigRef.current && (
          <button className="bs-btn-sm bs-btn-danger-ghost" onClick={reset}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 2.5v4h4"/><path d="M2.9 6.5A5.5 5.5 0 1 1 3 10"/></svg>
            Reset to defaults
          </button>
        )}
      </div>

      <textarea
        className="bs-llm-config-editor"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Loading provider config from backend…"
        rows={12}
        spellCheck={false}
      />

      {error && <div className="bs-llm-config-error">{error}</div>}

      {consumerConfig && (
        <div className="bs-llm-config-status">
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Active provider</span>
            <span className="bs-llm-status-badge">{activeProvider || '—'}</span>
          </div>
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Default model</span>
            <span className="bs-llm-status-badge bs-llm-status-model">{defaultModel}</span>
          </div>
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Available models</span>
            <div className="bs-llm-model-chips">
              {models.map((m) => (
                <span
                  key={m.id}
                  className={`bs-llm-model-chip ${m.id === defaultModel ? 'bs-llm-model-chip-active' : ''}`}
                  title={`${m.group} — ${m.id}`}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {!consumerConfig && (
        <div className="bs-llm-config-hint">
          Using built-in model defaults. Paste a config above and click <b>Apply</b> to use consumer-provided models.
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
