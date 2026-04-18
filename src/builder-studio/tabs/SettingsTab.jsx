/**
 * Settings tab — at the moment a reference sheet for keyboard shortcuts.
 *
 * The table is grouped by context (canvas, rename, inspector, etc.) and
 * driven by `SHORTCUTS` so adding a new binding in Canvas.jsx /
 * AgentBuilderPage.jsx only needs a corresponding row here.
 */
import { SettingsIcon, KeyboardIcon } from '../components/icons'
import McpServersPanel from './McpServersPanel'

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
