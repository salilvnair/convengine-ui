/**
 * Settings tab — keyboard shortcuts + LLM provider config.
 *
 * The table is grouped by context (canvas, rename, inspector, etc.) and
 * driven by `SHORTCUTS` so adding a new binding in Canvas.jsx /
 * AgentBuilderPage.jsx only needs a corresponding row here.
 */
import { useState, useMemo, useCallback } from 'react'
import { SettingsIcon, KeyboardIcon } from '../components/icons'
import McpServersPanel from './McpServersPanel'
import { useLlmConfigStore } from '../stores/llm-config-store'

const MOD = /Mac|iPhone|iPad/.test(typeof navigator !== 'undefined' ? navigator.platform : '') ? '⌘' : 'Ctrl'

const SHORTCUTS = [
  {
    group: 'Canvas',
    items: [
      { keys: ['Delete'], or: ['Backspace'], desc: 'Delete the selected node' },
      { keys: [MOD, 'D'], desc: 'Duplicate the selected node' },
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
      { keys: [MOD, '.'], desc: 'Toggle inspector panel' },
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

export default function SettingsTab() {
  return (
    <div className="bs-editor">
      <header className="bs-editor-head">
        <SettingsIcon className="bs-editor-ico" />
        <div className="bs-editor-heading">
          <div className="bs-editor-title">Settings</div>
          <div className="bs-editor-sub">Preferences & keyboard shortcuts</div>
        </div>
      </header>

      <section className="bs-editor-section">
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
                      <td className="bs-kbd-desc">{it.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="bs-editor-section">
        <McpServersPanel />
      </section>

      <section className="bs-editor-section">
        <h3 className="bs-settings-h3">Tips & tricks</h3>
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
      </section>

      <section className="bs-editor-section">
        <LlmConfigPanel />
      </section>
    </div>
  )
}

/* ── LLM Provider Configuration Panel ────────────────────────────────── */

const SAMPLE_CONFIG = `{
  "provider": "openai",
  "temperature": 0.3,
  "openai": {
    "api-key": "\${OPENAI_API_KEY}",
    "model": "gpt-4.1",
    "base-url": "https://api.openai.com"
  },
  "lmstudio": {
    "api-key": "\${LMSTUDIO_API_KEY}",
    "model": "openai/gpt-oss-20b",
    "base-url": "http://localhost:1234"
  }
}`

function LlmConfigPanel() {
  const consumerConfig = useLlmConfigStore((s) => s.consumerConfig)
  const models = useLlmConfigStore((s) => s.models)
  const defaultModel = useLlmConfigStore((s) => s.defaultModel)
  const activeProvider = useLlmConfigStore((s) => s.activeProvider)
  const setConfig = useLlmConfigStore((s) => s.setConfig)

  const [raw, setRaw] = useState(() =>
    consumerConfig ? JSON.stringify(consumerConfig, null, 2) : ''
  )
  const [error, setError] = useState('')

  const apply = useCallback(() => {
    if (!raw.trim()) {
      setConfig(null)
      setError('')
      return
    }
    try {
      const parsed = JSON.parse(raw)
      setConfig(parsed)
      setError('')
    } catch (e) {
      setError(`Invalid JSON: ${e.message}`)
    }
  }, [raw, setConfig])

  const reset = useCallback(() => {
    setConfig(null)
    setRaw('')
    setError('')
  }, [setConfig])

  const loadSample = useCallback(() => {
    setRaw(SAMPLE_CONFIG)
    setError('')
  }, [])

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
        specify <code>model</code>, <code>api-key</code>, and <code>base-url</code>.
      </p>

      <div className="bs-llm-config-actions">
        <button className="bs-btn-sm bs-btn-secondary" onClick={loadSample}>Load sample</button>
        <button className="bs-btn-sm bs-btn-primary" onClick={apply} disabled={!raw.trim()}>Apply</button>
        {consumerConfig && (
          <button className="bs-btn-sm bs-btn-danger-ghost" onClick={reset}>Reset to defaults</button>
        )}
      </div>

      <textarea
        className="bs-llm-config-editor"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={SAMPLE_CONFIG}
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
