/**
 * Settings tab — keyboard shortcuts + LLM provider config.
 *
 * The table is grouped by context (canvas, rename, inspector, etc.) and
 * driven by `SHORTCUTS` so adding a new binding in Canvas.jsx /
 * AgentBuilderPage.jsx only needs a corresponding row here.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { SettingsIcon, KeyboardIcon, McpIcon } from '../components/icons'
import { changeRuntimeProvider, fetchAvailableProviders, fetchCustomProviders, saveCustomProvider, deleteCustomProvider, refreshCustomProviderModels } from '../api/llm-provider-client'
import McpServersPanel from './McpServersPanel'
import { useLlmConfigStore } from '../stores/llm-config-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useWorkflowStore } from '../stores/workflow-store'
import StyledSelect from '../components/StyledSelect'

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
      { keys: ['⌥', 'B'], desc: 'Toggle disable / enable selected node' },
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
  const [providerRefreshKey, setProviderRefreshKey] = useState(0)
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
        {activeSection === 'llm' && (
          <>
            <LlmConfigPanel refreshKey={providerRefreshKey} />
            {isExtension && <CustomProviderPanel onChanged={() => setProviderRefreshKey((k) => k + 1)} />}
          </>
        )}
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

/* ── Provider SVG brand icons ─────────────────────────────────────── */

const OpenAiProviderIcon = ({ size = 22, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect width="24" height="24" rx="5.5" fill="#10a37f" />
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="white" />
  </svg>
)

const LmStudioProviderIcon = ({ size = 22, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="lms-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7c6af5" />
        <stop offset="100%" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="5.5" fill="url(#lms-bg)" />
    <path fillRule="evenodd" clipRule="evenodd" d="M2.84 2a1.273 1.273 0 100 2.547h14.107a1.273 1.273 0 100-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H22.04a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h14.106a1.274 1.274 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H15.38a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h14.106a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h9.698a1.273 1.273 0 100-2.547h-9.698z" fill="white" fillOpacity=".35" />
    <path fillRule="evenodd" clipRule="evenodd" d="M2.84 2a1.273 1.273 0 100 2.547h10.287a1.274 1.274 0 000-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H18.22a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H11.56a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h5.78a1.273 1.273 0 100-2.547h-5.78z" fill="white" />
  </svg>
)

const CopilotProviderIcon = ({ size = 22, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <radialGradient id="cp-dome" cx="42%" cy="26%" r="70%">
        <stop offset="0%" stopColor="#80deea"/>
        <stop offset="45%" stopColor="#00bcd4"/>
        <stop offset="100%" stopColor="#00796b"/>
      </radialGradient>
      <linearGradient id="cp-green" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#ccff90"/>
        <stop offset="100%" stopColor="#00e676"/>
      </linearGradient>
      <radialGradient id="cp-eye" cx="33%" cy="28%" r="70%">
        <stop offset="0%" stopColor="#e3f2fd"/>
        <stop offset="50%" stopColor="#64b5f6"/>
        <stop offset="100%" stopColor="#1565c0"/>
      </radialGradient>
      <radialGradient id="cp-face" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#ffffff"/>
        <stop offset="100%" stopColor="#e0f7fa"/>
      </radialGradient>
    </defs>
    {/* Left ear */}
    <rect x="0" y="19" width="9" height="11" rx="4.5" fill="#00bcd4"/>
    {/* Right ear */}
    <rect x="39" y="19" width="9" height="11" rx="4.5" fill="#00bcd4"/>
    {/* Ear glow dots */}
    <circle cx="4.5" cy="24.5" r="2.5" fill="#40c4ff"/>
    <circle cx="43.5" cy="24.5" r="2.5" fill="#40c4ff"/>
    {/* Head dome */}
    <path d="M8 27 Q8 4 24 4 Q40 4 40 27 L40 31 Q40 35 36 35 L12 35 Q8 35 8 31 Z" fill="url(#cp-dome)"/>
    {/* Green circuit stripe — left side */}
    <path d="M8 20 Q9 11 12 8 L13 9.5 L13 35 L12 35 Q8 35 8 31 Z" fill="url(#cp-green)" opacity="0.82"/>
    {/* Subtle right-side teal accent */}
    <path d="M40 20 Q39 11 36 8 L35 9.5 L35 35 L36 35 Q40 35 40 31 Z" fill="#4dd0e1" opacity="0.28"/>
    {/* White lower face */}
    <rect x="10" y="29" width="28" height="15" rx="5" fill="url(#cp-face)"/>
    {/* Goggle center bridge */}
    <rect x="21.5" y="17" width="5" height="2.5" rx="1.2" fill="#90a4ae" opacity="0.7"/>
    {/* Left goggle outer frame */}
    <rect x="9" y="13" width="11.5" height="9" rx="2.5" fill="white" opacity="0.92"/>
    {/* Right goggle outer frame */}
    <rect x="27.5" y="13" width="11.5" height="9" rx="2.5" fill="white" opacity="0.92"/>
    {/* Left eye */}
    <rect x="10" y="14" width="9.5" height="7" rx="2" fill="url(#cp-eye)"/>
    {/* Right eye */}
    <rect x="28.5" y="14" width="9.5" height="7" rx="2" fill="url(#cp-eye)"/>
    {/* Eye glint highlights */}
    <rect x="11" y="15" width="3.2" height="2" rx="0.8" fill="white" opacity="0.72"/>
    <rect x="29.5" y="15" width="3.2" height="2" rx="0.8" fill="white" opacity="0.72"/>
    {/* Nostril slits */}
    <rect x="19.5" y="33.5" width="3.5" height="6" rx="1.5" fill="#546e7a" opacity="0.65"/>
    <rect x="25" y="33.5" width="3.5" height="6" rx="1.5" fill="#546e7a" opacity="0.65"/>
  </svg>
)

const AnthropicProviderIcon = ({ size = 22, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect width="24" height="24" rx="5.5" fill="#d97706" />
    <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-3.654 0H6.57L0 20h3.603l1.378-3.454h6.875L13.234 20h3.603l-6.664-16.48zm-1.427 9.953 2.094-5.251 2.094 5.251H8.746z" fill="white" />
  </svg>
)

const OllamaProviderIcon = ({ size = 22, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="ollama-provider-icon" {...props}>
    <rect width="24" height="24" rx="5.5" fill="white" />
    <g transform="translate(2 2) scale(0.039)">
      <path fillRule="evenodd" clipRule="evenodd" d="M168.64 23.253c4.608 1.814 8.768 4.8 12.544 8.747 6.293 6.528 11.605 15.872 15.659 26.944 4.074 11.136 6.72 23.467 7.722 35.84a107.824 107.824 0 0143.712-13.568l1.088-.085c18.56-1.494 36.907 1.856 52.907 10.112a103.091 103.091 0 016.336 3.626c1.067-12.138 3.669-24.192 7.68-35.072 4.053-11.093 9.365-20.416 15.637-26.965a35.628 35.628 0 0112.566-8.747c5.482-2.133 11.306-2.517 16.981-.896 8.555 2.432 15.893 7.851 21.675 15.723 5.29 7.19 9.258 16.405 11.968 27.456 4.906 19.925 5.76 46.144 2.453 77.76l1.131.853.554.406c16.15 12.288 27.392 29.802 33.344 50.133 9.28 31.723 4.608 67.307-11.392 87.211l-.384.448.043.064c8.896 16.256 14.293 33.429 15.445 51.2l.043.64c1.365 22.72-4.267 45.589-17.365 68.053l-.15.213.214.512c10.069 24.683 13.226 49.536 9.344 74.368l-.128.832a13.888 13.888 0 01-15.936 11.435 13.83 13.83 0 01-11.31-10.43 13.828 13.828 0 01-.21-5.399c3.562-22.038.213-44.139-10.24-66.624a13.713 13.713 0 01.853-13.163l.085-.128c12.886-19.712 18.219-39.04 17.067-58.027-.981-16.618-6.933-32.938-17.067-48.49a13.737 13.737 0 013.84-18.902l.192-.128c5.184-3.392 9.963-12.053 12.374-23.893a90.218 90.218 0 00-2.027-42.112c-4.373-14.933-12.373-27.392-23.573-35.904-12.694-9.685-29.504-14.357-50.774-13.013a13.93 13.93 0 01-13.482-7.915c-6.699-14.187-16.47-24.341-28.651-30.635a70.145 70.145 0 00-37.803-7.082c-26.56 2.112-49.984 17.088-56.96 35.968a13.91 13.91 0 01-13.013 9.066c-22.763.043-40.384 5.376-53.269 14.998-11.136 8.32-18.731 19.946-22.742 33.877a86.824 86.824 0 00-1.45 40.235c2.389 11.904 7.061 21.76 12.416 27.072l.17.149c4.523 4.416 5.483 11.307 2.326 16.747-7.68 13.269-13.419 33.045-14.358 52.053-1.066 21.717 3.968 40.576 15.339 54.101l.341.406a13.711 13.711 0 012.027 14.72c-12.288 26.368-16.064 48.042-11.989 65.109a13.91 13.91 0 01-27.072 6.357c-5.184-21.717-1.664-46.592 10.09-74.624l.299-.746-.17-.256a92.574 92.574 0 01-12.758-27.926l-.107-.405a122.965 122.965 0 01-3.776-38.08c.939-19.413 5.931-39.296 13.27-55.253l.256-.555-.043-.043c-6.25-8.917-10.88-20.33-13.44-32.96l-.107-.512a114.176 114.176 0 011.984-53.12c5.59-19.52 16.576-36.288 32.768-48.405 1.28-.96 2.624-1.92 3.968-2.816-3.392-31.851-2.538-58.24 2.39-78.293 2.709-11.051 6.698-20.267 11.989-27.456 5.76-7.851 13.099-13.27 21.653-15.723 5.675-1.621 11.52-1.259 17.003.896v.021zm87.808 193.92c19.968 0 38.4 6.678 52.181 18.24 13.44 11.243 21.44 26.347 21.44 41.387 0 18.944-8.661 33.707-24.17 43.136-13.227 8-30.955 11.883-51.264 11.883-21.526 0-39.915-5.526-53.184-15.659-13.163-10.027-20.544-24.107-20.544-39.36 0-15.083 8.49-30.229 22.528-41.515 14.25-11.456 33.066-18.112 53.013-18.112zm0 19.115a65.498 65.498 0 00-40.875 13.867c-9.834 7.893-15.402 17.813-15.402 26.666 0 9.131 4.48 17.686 13.013 24.192 9.707 7.403 23.979 11.691 41.451 11.691 17.045 0 31.424-3.136 41.216-9.088 9.877-5.973 14.933-14.635 14.933-26.816 0-9.024-5.248-18.987-14.571-26.795-10.325-8.64-24.32-13.717-39.765-13.717zm14.123 25.813l.085.086a7.431 7.431 0 01-1.195 10.453l-6.229 4.907v9.514a7.999 7.999 0 01-8.021 7.958 8.004 8.004 0 01-8.022-7.958v-9.813l-5.781-4.651a7.4 7.4 0 01-1.109-10.453 7.53 7.53 0 0110.538-1.088l4.587 3.669 4.693-3.712a7.533 7.533 0 0110.454 1.088zm-107.52-40.938c10.197 0 18.496 8.32 18.496 18.581a18.564 18.564 0 01-18.518 18.581 18.559 18.559 0 01-18.496-18.56 18.565 18.565 0 015.399-13.129 18.609 18.609 0 0113.119-5.473zm185.728 0c10.24 0 18.517 8.32 18.517 18.581a18.559 18.559 0 01-18.517 18.581 18.56 18.56 0 01-18.496-18.56 18.56 18.56 0 0118.496-18.602zM158.72 49.067l-.064.042a14.06 14.06 0 00-6.08 5.078l-.107.128c-2.944 4.032-5.504 9.962-7.424 17.749-3.626 14.763-4.608 34.795-2.645 59.349 9.173-2.73 19.179-4.437 29.952-5.056l.213-.021.406-.725a69.41 69.41 0 013.157-5.099c2.624-16.448.469-36.096-5.397-52.139-2.859-7.765-6.336-13.866-9.664-17.344a13.403 13.403 0 00-2.283-1.92l-.064-.042zm195.712.853l-.043.021a13.396 13.396 0 00-2.282 1.92c-3.328 3.478-6.827 9.6-9.664 17.366-6.187 16.938-8.256 37.888-4.907 54.869l1.237 2.069.171.299h.64a110.599 110.599 0 0131.275 4.523c1.834-23.979.81-43.584-2.731-58.07-1.92-7.786-4.48-13.717-7.445-17.749l-.086-.128a14.054 14.054 0 00-6.08-5.099h-.085v-.021z" fill="#18181b" />
    </g>
  </svg>
)

/* ── Provider brand metadata (key → display info) ─────────────────── */
const PROVIDER_META = {
  openai:    { label: 'OpenAI',         Icon: OpenAiProviderIcon,    color: '#10a37f' },
  lmstudio:  { label: 'LM Studio',      Icon: LmStudioProviderIcon,  color: '#8b5cf6' },
  copilot:   { label: 'GitHub Copilot', Icon: CopilotProviderIcon,   color: '#6e7bf9' },
  anthropic: { label: 'Anthropic',      Icon: AnthropicProviderIcon, color: '#d97706' },
  ollama:    { label: 'Ollama',         Icon: OllamaProviderIcon,    color: '#64748b' },
}

/* ── LLM Provider Configuration Panel ────────────────────────────────── */

function LlmConfigPanel({ refreshKey = 0 }) {
  const models = useLlmConfigStore((s) => s.models)
  const defaultModel = useLlmConfigStore((s) => s.defaultModel)
  const activeProvider = useLlmConfigStore((s) => s.activeProvider)
  const setConfig = useLlmConfigStore((s) => s.setConfig)
  const applyDefaultModelToAll = useWorkspaceStore((s) => s.applyDefaultModelToAll)
  const syncToServer = useWorkspaceStore((s) => s.syncToServer)
  const reset = useWorkspaceStore((s) => s.reset)

  const [selectedProvider, setSelectedProvider] = useState(null)
  const [pending, setPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  // Derive unique providers from the flat models list
  const providers = useMemo(() => {
    const seen = new Set()
    const list = []
    for (const m of models) {
      const pk = m.provider || 'unknown'
      if (!seen.has(pk)) {
        seen.add(pk)
        list.push({ key: pk, label: m.group || pk, providerType: m.providerType })
      }
    }
    return list
  }, [models])

  // Sync selected provider when store loads
  useEffect(() => {
    if (activeProvider && !selectedProvider) setSelectedProvider(activeProvider)
    else if (!selectedProvider && providers.length > 0) setSelectedProvider(providers[0].key)
  }, [activeProvider, providers, selectedProvider])

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

  useEffect(() => { refresh() }, [refresh, refreshKey])

  // Build provider options for StyledSelect (icon + label + active badge)
  const providerOptions = useMemo(() => providers.map((p) => {
    // Custom providers have a type (lmstudio, openai, etc.) — look up icon by type first,
    // then fall back to the key itself for built-in providers (copilot, etc.)
    const meta = PROVIDER_META[p.providerType || p.key] || PROVIDER_META[p.key] || {}
    const Icon = meta.Icon || null
    return {
      id: p.key,
      label: p.label,
      icon: Icon ? <Icon size={15} /> : null,
      badge: p.key === activeProvider
        ? <span className="bs-llm-provider-active-dot" style={{ display: 'block' }} />
        : null,
    }
  }), [providers, activeProvider])

  // Models visible in the current provider tab
  const providerModels = useMemo(
    () => models.filter((m) => m.provider === selectedProvider),
    [models, selectedProvider]
  )

  const hasChanges = useMemo(() => {
    if (selectedProvider && selectedProvider !== activeProvider) return true
    if (pending && pending !== defaultModel) return true
    return false
  }, [selectedProvider, activeProvider, pending, defaultModel])

  const saveDefault = useCallback(async () => {
    if (!hasChanges) return
    setSaving(true)
    setLoadError('')
    try {
      const modelToSave = pending || providerModels[0]?.id || null
      await changeRuntimeProvider({ provider: selectedProvider, family: modelToSave, model: modelToSave })
      await refresh()
      setPending(null)
    } catch (e) {
      setLoadError(e.message || 'Failed to save default model')
    } finally {
      setSaving(false)
    }
  }, [hasChanges, pending, providerModels, selectedProvider, refresh])

  const applyToAll = useCallback(async () => {
    const target = defaultModel
    if (!target) return
    setApplying(true)
    setApplyResult(null)
    try {
      const count = applyDefaultModelToAll(target, selectedProvider)
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
    try { localStorage.removeItem('builder-studio/workspace') } catch { /* sandboxed */ }
    reset()
    if (defaultModel) applyDefaultModelToAll(defaultModel)
    useWorkflowStore.getState().reset()
    setConfirmReset(false)
  }, [reset, defaultModel, applyDefaultModelToAll])

  return (
    <div className="bs-llm-config">
      <div className="bs-settings-section-head">
        <LlmIcon className="bs-ico-sm" />
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
          No model provider found. Ensure the backend is running and{' '}
          <code>/builder-studio/llm/providers</code> returns at least one model.
        </div>
      )}

      {!loading && models.length > 0 && (
        <div className="bs-llm-config-status">

          {/* ── Available Providers dropdown ── */}
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Available Providers</span>
            <StyledSelect
              value={selectedProvider || ''}
              options={providerOptions}
              onChange={(id) => { setSelectedProvider(id); setPending(null) }}
              placeholder="Select provider…"
              className="bs-llm-provider-select"
              iconSize={15}
              menuMinWidth={200}
            />
          </div>

          {/* ── Default Model badge ── */}
          <div className="bs-llm-config-status-row">
            <span className="bs-llm-status-label">Default Model</span>
            <span className="bs-llm-status-badge bs-llm-status-model">
              {pending && pending !== defaultModel ? pending : (defaultModel || '—')}
            </span>
          </div>

          {/* ── Model chips for selected provider ── */}
          <div className="bs-llm-config-status-row bs-llm-models-row">
            <span className="bs-llm-status-label">
              Available Models
              {providerModels.length > 0 && (
                <span className="bs-llm-models-count">{providerModels.length}</span>
              )}
            </span>
            <div className="bs-llm-model-chips">
              {providerModels.length === 0 ? (
                <span className="bs-llm-no-models">No models available for this provider.</span>
              ) : (
                providerModels.map((m) => {
                  const isSaved = m.id === defaultModel
                  const isPending = m.id === pending && pending !== defaultModel
                  return (
                    <span
                      key={m.id}
                          className={`bs-llm-model-chip bs-llm-model-chip-btn${isSaved ? ' bs-llm-model-chip-active' : ''}${isPending ? ' bs-llm-model-chip-pending' : ''}`}
                          title={`${m.group} — ${m.id}`}
                          onClick={() => setPending(isSaved ? null : m.id)}
                        >
                          {m.label}
                        </span>
                      )
                    })
                  )}
                </div>
              </div>

              {/* ── Save / cancel actions ── */}
              {hasChanges && (
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
                    onClick={() => { setSelectedProvider(activeProvider); setPending(null) }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              )}

          {/* ── Apply to all ── */}
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

          {/* ── Reset workspace ── */}
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

/* ── Custom Provider Panel (extension-only) ──────────────────────── */

const PROVIDER_TYPE_OPTIONS = [
  { id: 'openai',    label: 'OpenAI',    icon: <OpenAiProviderIcon size={15} /> },
  { id: 'anthropic', label: 'Anthropic', icon: <AnthropicProviderIcon size={15} /> },
  { id: 'lmstudio',  label: 'LM Studio', icon: <LmStudioProviderIcon size={15} /> },
  { id: 'ollama',    label: 'Ollama',    icon: <OllamaProviderIcon size={15} /> },
]

const PROVIDER_PLACEHOLDERS = {
  openai: {
    name:      'My OpenAI Provider',
    chatUrl:   'https://<your-host>/v1/chat/completions',
    modelsUrl: 'https://<your-host>/v1/models',
    apiKey:    'sk-...',
  },
  anthropic: {
    name:      'My Anthropic Provider',
    chatUrl:   'https://<your-host>/v1/messages',
    modelsUrl: 'https://<your-host>/v1/models',
    apiKey:    'sk-ant-...',
  },
  lmstudio: {
    name:      'My LM Studio Server',
    chatUrl:   'http://<your-host>/v1/chat/completions',
    modelsUrl: 'http://<your-host>/v1/models',
    apiKey:    'leave blank if not set',
  },
  ollama: {
    name:      'My Ollama Server',
    chatUrl:   'http://<your-host>/api/chat',
    modelsUrl: 'http://<your-host>/api/tags',
    apiKey:    'leave blank for local Ollama',
  },
}

const BLANK_FORM = { name: '', type: 'openai', chatUrl: '', modelsUrl: '', apiKey: '', headers: '' }

function CustomProviderPanel({ onChanged } = {}) {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(BLANK_FORM)
  const [formError, setFormError] = useState('')
  const [refreshingKey, setRefreshingKey] = useState(null)
  const [deletingKey, setDeletingKey] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingKey, setEditingKey] = useState(null)

  const openAdd = useCallback(() => {
    setEditingKey(null)
    setForm(BLANK_FORM)
    setFormError('')
    setShowForm(true)
  }, [])

  const openEdit = useCallback((p) => {
    setEditingKey(p.key)
    setForm({
      name: p.name,
      type: p.type || 'openai',
      chatUrl: p.chatUrl || '',
      modelsUrl: p.modelsUrl || '',
      apiKey: '',
      headers: p.headers && Object.keys(p.headers).length ? JSON.stringify(p.headers, null, 2) : '',
    })
    setFormError('')
    setShowForm(true)
  }, [])

  const handleCancel = useCallback(() => {
    setShowForm(false)
    setEditingKey(null)
    setForm(BLANK_FORM)
    setFormError('')
  }, [])

  const loadProviders = useCallback(async () => {
    try {
      const data = await fetchCustomProviders()
      setProviders(data)
    } catch (e) {
      setError(e.message || 'Failed to load custom providers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProviders() }, [loadProviders])

  const handleSave = async () => {
    setFormError('')
    if (!form.name.trim()) return setFormError('Provider name is required')
    if (!form.chatUrl.trim()) return setFormError('Chat URL is required')
    if (!form.modelsUrl.trim()) return setFormError('Models URL is required')

    let parsedHeaders = {}
    if (form.headers.trim()) {
      try { parsedHeaders = JSON.parse(form.headers) } catch {
        return setFormError('Additional headers must be valid JSON')
      }
    }

    setSaving(true)
    try {
      await saveCustomProvider({
        ...(editingKey ? { key: editingKey } : {}),
        name: form.name.trim(),
        type: form.type,
        chatUrl: form.chatUrl.trim(),
        modelsUrl: form.modelsUrl.trim(),
        apiKey: form.apiKey.trim() || undefined,
        headers: parsedHeaders,
      })
      setForm(BLANK_FORM)
      setEditingKey(null)
      setShowForm(false)
      await loadProviders()
      onChanged?.()
    } catch (e) {
      setFormError(e.message || 'Failed to save provider')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (key) => {
    setDeletingKey(key)
    try {
      await deleteCustomProvider(key)
      setProviders((prev) => prev.filter((p) => p.key !== key))
      onChanged?.()
    } catch (e) {
      setError(e.message || 'Failed to delete provider')
    } finally {
      setDeletingKey(null)
    }
  }

  const handleRefreshModels = async (key) => {
    setRefreshingKey(key)
    try {
      const models = await refreshCustomProviderModels(key)
      setProviders((prev) => prev.map((p) => p.key === key ? { ...p, cachedModels: models } : p))
      onChanged?.()
    } catch (e) {
      setError(e.message || 'Failed to refresh models')
    } finally {
      setRefreshingKey(null)
    }
  }

  return (
    <div className="bs-settings-pane bs-custom-provider-pane">
      <div className="bs-settings-section-head">
        <LlmIcon className="bs-ico-sm" />
        <h3 className="bs-settings-h3">Custom LLM Providers</h3>
        <button
          className="bs-btn-sm bs-btn-secondary bs-custom-provider-add-btn"
          onClick={showForm ? handleCancel : openAdd}
        >
          {showForm ? '✕ Cancel' : '+ Add Provider'}
        </button>
      </div>

      {error && <div className="bs-llm-config-error">{error}</div>}

      {/* Add / Edit form */}
      {showForm && (
        <div className="bs-custom-provider-form">
          <div className="bs-custom-provider-form-title">
            {editingKey ? 'Edit Provider' : 'Add New Provider'}
          </div>
          <div className="bs-custom-provider-form-grid">
            <label className="bs-custom-provider-label">
              Provider Name
              <input
                className="bs-custom-provider-input"
                placeholder={PROVIDER_PLACEHOLDERS[form.type]?.name || 'My Provider'}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="bs-custom-provider-label">
              Type
              <StyledSelect
                value={form.type}
                options={PROVIDER_TYPE_OPTIONS}
                onChange={(id) => setForm((f) => ({ ...f, type: id }))}
              />
            </label>
            <label className="bs-custom-provider-label bs-span2">
              Chat URL
              <input
                className="bs-custom-provider-input"
                placeholder={PROVIDER_PLACEHOLDERS[form.type]?.chatUrl}
                value={form.chatUrl}
                onChange={(e) => setForm((f) => ({ ...f, chatUrl: e.target.value }))}
              />
            </label>
            <label className="bs-custom-provider-label bs-span2">
              Models URL
              <input
                className="bs-custom-provider-input"
                placeholder={PROVIDER_PLACEHOLDERS[form.type]?.modelsUrl}
                value={form.modelsUrl}
                onChange={(e) => setForm((f) => ({ ...f, modelsUrl: e.target.value }))}
              />
            </label>
            <label className="bs-custom-provider-label bs-span2">
              API Key
              <input
                className="bs-custom-provider-input"
                type="password"
                placeholder={editingKey ? 'Leave blank to keep existing key' : PROVIDER_PLACEHOLDERS[form.type]?.apiKey}
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                autoComplete="off"
              />
            </label>
            <label className="bs-custom-provider-label bs-span2">
              Additional Headers <span className="bs-optional-hint">(JSON, optional)</span>
              <textarea
                className="bs-custom-provider-textarea"
                placeholder='{ "X-Custom-Header": "value" }'
                rows={2}
                value={form.headers}
                onChange={(e) => setForm((f) => ({ ...f, headers: e.target.value }))}
              />
            </label>
          </div>
          {formError && <div className="bs-custom-provider-form-error">{formError}</div>}
          <div className="bs-custom-provider-form-actions">
            <button className="bs-btn-sm bs-btn-success" onClick={handleSave} disabled={saving}>
              {saving ? (editingKey ? 'Updating…' : 'Saving…') : (editingKey ? 'Update Provider' : 'Save Provider')}
            </button>
          </div>
        </div>
      )}

      {/* Provider list */}
      {loading ? (
        <div className="bs-llm-config-loading">Loading…</div>
      ) : providers.length === 0 ? (
        <div className="bs-custom-provider-empty">No custom providers added yet.</div>
      ) : (
        <ul className="bs-custom-provider-list">
          {providers.map((p) => (
            <li key={p.key} className="bs-custom-provider-item">
              <div className="bs-custom-provider-item-info">
                <span className="bs-custom-provider-name">{p.name}</span>
                <span className="bs-custom-provider-type-badge">
                  {PROVIDER_TYPE_OPTIONS.find((o) => o.id === p.type)?.label ?? p.type}
                </span>
                <span className="bs-custom-provider-model-count">
                  {(p.cachedModels || []).length} model{(p.cachedModels || []).length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="bs-custom-provider-item-actions">
                <button
                  className="bs-btn-sm bs-btn-secondary"
                  onClick={() => handleRefreshModels(p.key)}
                  disabled={refreshingKey === p.key}
                  title="Fetch latest model list from provider"
                >
                  {refreshingKey === p.key ? 'Refreshing…' : '↻ Refresh Models'}
                </button>
                <button
                  className="bs-btn-sm bs-btn-secondary"
                  onClick={() => openEdit(p)}
                  disabled={!!refreshingKey || !!deletingKey}
                  title="Edit provider settings"
                >
                  ✎ Edit
                </button>
                <button
                  className="bs-btn-sm bs-btn-secondary bs-btn-secondary--danger"
                  onClick={() => handleDelete(p.key)}
                  disabled={deletingKey === p.key}
                >
                  {deletingKey === p.key ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
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
