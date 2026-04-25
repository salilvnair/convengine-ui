/**
 * WikiViewProvider — renders a rich HTML reference panel in the Builder Studio
 * sidebar. Content is kept in sync with src/builder-studio/tabs/WikiGuide.jsx.
 */
import * as vscode from 'vscode';

export class WikiViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'bs.wikiView';

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root {
    --bg: var(--vscode-sideBar-background, #1e1e1e);
    --fg: var(--vscode-sideBarForeground, #cccccc);
    --muted: var(--vscode-descriptionForeground, #888);
    --accent: var(--vscode-textLink-foreground, #6366f1);
    --border: var(--vscode-widget-border, #3c3c3c);
    --code-bg: var(--vscode-textCodeBlock-background, #2d2d2d);
    --th-bg: var(--vscode-editor-selectionBackground, #264f78);
    --section-bg: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
    --tip-info-bg: rgba(99,102,241,.10);
    --tip-warn-bg: rgba(251,191,36,.10);
    --tip-ok-bg: rgba(52,211,153,.10);
    --tip-danger-bg: rgba(239,68,68,.10);
  }
  * { box-sizing: border-box; }
  html { height: 100%; }
  body {
    margin: 0; padding: 10px 12px 32px;
    background: var(--bg); color: var(--fg);
    font-size: 12px; font-family: var(--vscode-font-family, system-ui, sans-serif); line-height: 1.6;
    min-height: 100%; overflow-y: auto;
  }

  h1 { font-size: 15px; font-weight: 700; color: var(--accent); margin: 0 0 2px; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 18px 0 6px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  h3 { font-size: 12px; font-weight: 600; margin: 10px 0 4px; color: var(--fg); }
  h4 { font-size: 11px; font-weight: 600; margin: 8px 0 3px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  p  { margin: 0 0 6px; font-size: 11.5px; }
  ul { margin: 0 0 6px 16px; padding: 0; }
  li { margin: 2px 0; font-size: 11.5px; }
  a  { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }

  code {
    font-family: var(--vscode-editor-font-family, 'SF Mono', Menlo, monospace);
    background: var(--code-bg);
    color: var(--accent);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 10.5px;
  }

  table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 11px; }
  th, td { border: 1px solid var(--border); padding: 4px 7px; text-align: left; vertical-align: top; }
  th { background: var(--th-bg); font-weight: 600; color: var(--fg); }
  tbody tr:nth-child(even) { background: rgba(255,255,255,.03); }

  .subtitle { font-size: 10.5px; color: var(--muted); margin-bottom: 10px; }
  .badge { display: inline-block; padding: 0 6px; border-radius: 10px; font-size: 9.5px; font-weight: 600; }
  .badge-core    { background: rgba(99,102,241,.15); color: #818cf8; }
  .badge-tool    { background: rgba(52,211,153,.15); color: #34d399; }
  .badge-trigger { background: rgba(251,191,36,.15); color: #fbbf24; }

  .tip { display: flex; gap: 7px; padding: 6px 8px; border-radius: 5px; margin: 6px 0; font-size: 11px; line-height: 1.5; }
  .tip-info    { background: var(--tip-info-bg); }
  .tip-warn    { background: var(--tip-warn-bg); }
  .tip-ok      { background: var(--tip-ok-bg); }
  .tip-danger  { background: var(--tip-danger-bg); }
  .tip-icon    { font-size: 13px; flex-shrink: 0; }

  .section { margin-bottom: 4px; }
  details > summary {
    cursor: pointer;
    user-select: none;
    font-weight: 600;
    font-size: 12px;
    padding: 5px 0;
    color: var(--fg);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: '▶'; font-size: 9px; color: var(--muted); transition: transform .15s; display: inline-block; }
  details[open] > summary::before { transform: rotate(90deg); }
  details > .body { padding: 0 0 4px 14px; }

  .kbgroup { margin-bottom: 8px; }
  .kbrow { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px dotted var(--border); font-size: 11px; }
  .kbrow:last-child { border-bottom: none; }
  .kbkey { display: flex; gap: 3px; flex-shrink: 0; }
  kbd {
    display: inline-block;
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 10px;
    font-family: inherit;
    color: var(--fg);
    white-space: nowrap;
  }
  .kblabel { color: var(--muted); flex: 1; padding-right: 8px; }
</style>
</head>
<body>

<h1>⚡ Builder Studio</h1>
<p class="subtitle">Quick Reference · Synced from WikiGuide</p>

<!-- ═══ KEYBOARD SHORTCUTS ═══ -->
<details open class="section">
  <summary>⌨️ Keyboard Shortcuts</summary>
  <div class="body">
    <h4>Workspace</h4>
    <div class="kbgroup">
      <div class="kbrow"><span class="kblabel">Save workflow</span><span class="kbkey"><kbd>⌘</kbd><kbd>2</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Export JSON</span><span class="kbkey"><kbd>⌘</kbd><kbd>3</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Run workflow</span><span class="kbkey"><kbd>⌘</kbd><kbd>↵</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Toggle inspector</span><span class="kbkey"><kbd>⌘</kbd><kbd>.</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Open settings</span><span class="kbkey"><kbd>⌘</kbd><kbd>,</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Shortcuts cheat-sheet</span><span class="kbkey"><kbd>?</kbd></span></div>
    </div>
    <h4>Canvas</h4>
    <div class="kbgroup">
      <div class="kbrow"><span class="kblabel">Delete selected node</span><span class="kbkey"><kbd>Del</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Duplicate node</span><span class="kbkey"><kbd>⌘</kbd><kbd>D</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Rename node</span><span class="kbkey"><kbd>F2</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Toggle enable/disable block</span><span class="kbkey"><kbd>⌥</kbd><kbd>B</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Fit view</span><span class="kbkey"><kbd>⌘</kbd><kbd>F</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Reset zoom</span><span class="kbkey"><kbd>⌘</kbd><kbd>R</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Deselect / cancel rename</span><span class="kbkey"><kbd>Esc</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Nudge node (10 px)</span><span class="kbkey"><kbd>↑ ↓ ← →</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Nudge node (50 px)</span><span class="kbkey"><kbd>⇧</kbd><kbd>↑↓←→</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Inline rename</span><span class="kbkey"><kbd>dbl-click</kbd></span></div>
      <div class="kbrow"><span class="kblabel">Context menu</span><span class="kbkey"><kbd>right-click</kbd></span></div>
    </div>
  </div>
</details>

<!-- ═══ CONCEPTS ═══ -->
<details class="section">
  <summary>💡 Concepts</summary>
  <div class="body">
    <h3>Workspace Hierarchy</h3>
    <table>
      <thead><tr><th>Level</th><th>What it is</th></tr></thead>
      <tbody>
        <tr><td><code>Workspace</code></td><td>Top-level container. Seeded as <code>Default</code>.</td></tr>
        <tr><td><code>Team</code></td><td>Logical grouping of agent pools.</td></tr>
        <tr><td><code>Agent Pool</code></td><td>Roster of related collaborating agents.</td></tr>
        <tr><td><code>Agent</code></td><td>LLM wrapper with prompts, schemas, model choice, and skills.</td></tr>
        <tr><td><code>Skill</code></td><td>Reusable JS/Python function with I/O schemas.</td></tr>
        <tr><td><code>Workflow</code></td><td>Canvas of nodes + edges + subBlockValues.</td></tr>
      </tbody>
    </table>

    <h3>Execution Model</h3>
    <p>Topological BFS with readiness gating:</p>
    <ol style="font-size:11px; padding-left:18px; margin:4px 0 8px;">
      <li><strong>Seed phase</strong> — Starter/user_input nodes run first.</li>
      <li><strong>Ready set</strong> — Node is ready when all incoming edges are "live".</li>
      <li><strong>Concurrent dispatch</strong> — All ready nodes run via <code>Promise.all</code>.</li>
      <li><strong>Per-node execution</strong> — Switch on <code>blockType</code>.</li>
      <li><strong>Output shape</strong> — Most blocks return raw value. Agent/MCP return <code>{ __meta, value }</code>. Branching returns <code>{ branch, value }</code>.</li>
    </ol>
    <div class="tip tip-warn"><span class="tip-icon">⚠️</span><span>Agent nodes use <code>{{key}}</code> template interpolation. Unresolved vars appear as literal text in prompts.</span></div>

    <h3>Run Dock Panels</h3>
    <table>
      <thead><tr><th>Panel</th><th>Shows</th></tr></thead>
      <tbody>
        <tr><td><strong>Output</strong></td><td>Final <code>result.output</code> in JsonView.</td></tr>
        <tr><td><strong>Debug</strong></td><td>Chronological event log (start/done/error).</td></tr>
        <tr><td><strong>Trace</strong></td><td>Grid: title, blockType, input, values, meta, output, ms.</td></tr>
        <tr><td><strong>Console</strong></td><td>Captured <code>console.log</code> from function/skill runs.</td></tr>
      </tbody>
    </table>

    <h3>Inspector SubBlock Types</h3>
    <table>
      <thead><tr><th>Type</th><th>Control</th></tr></thead>
      <tbody>
        <tr><td><code>short-input</code></td><td>Single-line text</td></tr>
        <tr><td><code>long-input</code>, <code>text</code></td><td>Textarea</td></tr>
        <tr><td><code>dropdown</code>, <code>combobox</code></td><td>&lt;select&gt;</td></tr>
        <tr><td><code>switch</code></td><td>iOS-style toggle</td></tr>
        <tr><td><code>slider</code></td><td>Range input</td></tr>
        <tr><td><code>table</code></td><td>Key/value grid</td></tr>
        <tr><td><code>code</code></td><td>CodeMirror editor</td></tr>
        <tr><td><code>response-format</code></td><td>FullscreenWrapper + JSON tree</td></tr>
        <tr><td><code>mcp-*</code></td><td>MCP-specific selectors</td></tr>
        <tr><td><code>file-upload</code></td><td>File input</td></tr>
      </tbody>
    </table>

    <h3>Template Expressions</h3>
    <table>
      <thead><tr><th>Syntax</th><th>Meaning</th></tr></thead>
      <tbody>
        <tr><td><code>{{field}}</code></td><td>Inject top-level key from upstream node's output (e.g. <code>{{title}}</code>).</td></tr>
        <tr><td><code>&lt;nodeId.field&gt;</code></td><td>Reference a specific node's output (e.g. <code>&lt;n_agent.summary&gt;</code>).</td></tr>
      </tbody>
    </table>
    <div class="tip tip-info"><span class="tip-icon">ℹ️</span><span>Check the Debug panel's <code>meta.userPrompt</code> to verify interpolation worked.</span></div>

    <h3>Extensions Pattern</h3>
    <p>Drop a <code>.js</code> file into <code>builder-studio/extensions/</code> — auto-discovered via Vite's <code>import.meta.glob</code>. Export a <code>BlockConfig</code> object.</p>
    <div class="tip tip-ok"><span class="tip-icon">✅</span><span>Core blocks cannot be shadowed. Collisions are skipped with a console warning.</span></div>
  </div>
</details>

<!-- ═══ BLOCK CATEGORIES ═══ -->
<details class="section">
  <summary>🧱 Block Categories</summary>
  <div class="body">
    <h4>Blocks <span class="badge badge-core">core</span></h4>
    <table>
      <thead><tr><th>Type</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>starter</code></td><td>Entry point — every workflow needs one. Modes: manual, cron, webhook.</td></tr>
        <tr><td><code>user_input</code></td><td>Collects runtime input (text, url, number, file…) from user.</td></tr>
        <tr><td><code>agent</code></td><td>LLM call — system prompt, user prompt, model, tools, skills, response format.</td></tr>
        <tr><td><code>function</code></td><td>Run custom JavaScript; access upstream outputs via <code>input</code>.</td></tr>
        <tr><td><code>response</code></td><td>Terminal node — shapes and returns the final workflow output.</td></tr>
        <tr><td><code>if_else</code></td><td>Binary branch: true / false handles.</td></tr>
        <tr><td><code>if_elseif_else</code></td><td>Multi-branch with N conditions + else.</td></tr>
        <tr><td><code>switch</code></td><td>Pattern-match branch on a value.</td></tr>
        <tr><td><code>for_loop</code></td><td>Iterate N times; outputs array of each iteration result.</td></tr>
        <tr><td><code>for_each</code></td><td>Iterate over array items.</td></tr>
        <tr><td><code>filter</code></td><td>Keep/reject array items by condition. Outputs: <code>kept</code>, <code>rejected</code>, <code>count</code>.</td></tr>
        <tr><td><code>sort</code></td><td>Sort array by field, asc/desc.</td></tr>
        <tr><td><code>aggregate</code></td><td>sum/count/avg/min/max/concat/group over an array.</td></tr>
        <tr><td><code>merge</code></td><td>Deep-merge two JSON objects into one.</td></tr>
        <tr><td><code>mapper</code></td><td>Transform/reshape JSON via json_parse, json_stringify, to_number, etc.</td></tr>
        <tr><td><code>text_template</code></td><td>Build a string from a template + JSON data.</td></tr>
        <tr><td><code>json_map</code></td><td>Remap JSON keys using a mapping table.</td></tr>
        <tr><td><code>json_path</code></td><td>Extract value from JSON using dot-path notation.</td></tr>
        <tr><td><code>condition</code></td><td>Evaluate a condition expression; outputs conditionResult + selectedPath.</td></tr>
        <tr><td><code>variables</code></td><td>Inject static key/value pairs as a JSON object.</td></tr>
        <tr><td><code>crypto</code></td><td>Hash/encode: sha256, sha512, md5, base64_encode, hmac_sha256, uuid, etc.</td></tr>
        <tr><td><code>json_validator</code></td><td>Validate JSON against a schema; outputs valid, errors, sanitised.</td></tr>
        <tr><td><code>show_preview</code></td><td>Render output on the canvas without ending the workflow.</td></tr>
        <tr><td><code>save_to_files</code></td><td>Write content to local file system path.</td></tr>
        <tr><td><code>error_handler</code></td><td>Catch errors from upstream; outputs result + error JSON.</td></tr>
        <tr><td><code>delay</code></td><td>Pause execution for N ms.</td></tr>
        <tr><td><code>wait</code></td><td>Wait for external trigger or timeout.</td></tr>
        <tr><td><code>parallel</code></td><td>Fan-out N branches; outputs results array + winner.</td></tr>
        <tr><td><code>loop</code></td><td>While-style loop over a collection.</td></tr>
        <tr><td><code>router_v2</code></td><td>Route to one of N branches using LLM or rule-based selection.</td></tr>
        <tr><td><code>sub_workflow</code></td><td>Embed and run a nested workflow inline.</td></tr>
        <tr><td><code>table</code></td><td>Structured tabular data editor / renderer.</td></tr>
        <tr><td><code>skill</code></td><td>Run a workspace Skill (JS/Python) by ID.</td></tr>
        <tr><td><code>ai_classifier</code></td><td>Fast intent/category classification — outputs category + confidence.</td></tr>
        <tr><td><code>http_response</code></td><td>Shape HTTP response: status, headers, body for webhook-triggered workflows.</td></tr>
      </tbody>
    </table>

    <h4>Tools <span class="badge badge-tool">tools</span></h4>
    <table>
      <thead><tr><th>Type</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>api</code></td><td>HTTP request — GET/POST/PUT/PATCH/DELETE, headers, body, auth, timeout, retries.</td></tr>
        <tr><td><code>mcp</code></td><td>Call an MCP server tool by server + tool name.</td></tr>
        <tr><td><code>postgresql</code></td><td>Execute SQL against a PostgreSQL DB.</td></tr>
        <tr><td><code>mongodb</code></td><td>Run a MongoDB query/command.</td></tr>
        <tr><td><code>redis</code></td><td>GET/SET/DEL/EXPIRE on Redis.</td></tr>
        <tr><td><code>smtp</code></td><td>Send email via SMTP (Gmail, Outlook, custom).</td></tr>
        <tr><td><code>slack</code></td><td>Post a message to a Slack channel via webhook.</td></tr>
      </tbody>
    </table>

    <h4>Triggers <span class="badge badge-trigger">triggers</span></h4>
    <table>
      <thead><tr><th>Type</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>schedule</code></td><td>Cron trigger — configure expression + timezone.</td></tr>
        <tr><td><code>webhook_request</code></td><td>HTTP webhook trigger — outputs body, headers, query.</td></tr>
      </tbody>
    </table>
  </div>
</details>

<!-- ═══ CUSTOM BLOCK ═══ -->
<details class="section">
  <summary>🔧 Writing a Custom Block</summary>
  <div class="body">
    <p>Drop a <code>.js</code> file into <code>extensions/</code> and export a <code>BlockConfig</code>:</p>
    <pre style="background:var(--code-bg);padding:8px;border-radius:5px;font-size:10.5px;overflow:auto;white-space:pre;line-height:1.5;"><code style="background:none;color:var(--fg);padding:0;">// extensions/slugify.js
export const SlugifyBlock = {
  type: 'slugify',
  name: 'Slugify',
  description: 'Normalise string to URL slug',
  category: 'blocks',
  bgColor: '#64748b',
  subBlocks: [
    { id: 'lowercase', title: 'Lower-case',
      type: 'switch', defaultValue: true },
    { id: 'separator', title: 'Separator',
      type: 'short-input', defaultValue: '-' }
  ],
  inputs:  { input:  { type: 'string' } },
  outputs: { result: { type: 'string' } }
}
export default SlugifyBlock</code></pre>
    <div class="tip tip-warn"><span class="tip-icon">⚠️</span><span>Pick a unique <code>type</code> id — core blocks cannot be overwritten.</span></div>
    <div class="tip tip-info"><span class="tip-icon">ℹ️</span><span>For branching blocks, add <code>outputHandles</code> or <code>outputHandlesFromValues(values)</code> for dynamic source handles.</span></div>
  </div>
</details>

<!-- ═══ TROUBLESHOOTING ═══ -->
<details class="section">
  <summary>🐛 Troubleshooting</summary>
  <div class="body">
    <table>
      <thead><tr><th>Symptom</th><th>Cause &amp; Fix</th></tr></thead>
      <tbody>
        <tr><td>"No content provided to summarize"</td><td>Template var didn't resolve. Check <code>meta.userPrompt</code> in Debug panel for literal <code>{{foo}}</code>.</td></tr>
        <tr><td>"MCP block: arguments is not valid JSON"</td><td>Raw quotes in <code>{{input}}</code>. Wrap: <code>{"query": "{{input}}"}</code>.</td></tr>
        <tr><td>Node stays "active" forever</td><td>Upstream branch didn't pick live edge. Check Trace for <code>chosenHandle</code>.</td></tr>
        <tr><td>"TypeError: fn is not a function"</td><td>Function block code isn't expression. Wrap with <code>return …</code>.</td></tr>
        <tr><td>Skill output ignored</td><td>Field is <code>values.skills</code>, not <code>values.tools</code>.</td></tr>
        <tr><td>Response Format ignored</td><td>Both <code>responseFormat</code> and <code>strictOutput</code> must be set.</td></tr>
        <tr><td>CORS errors on URL extractor</td><td>Use API block (server-side) instead of client-side fetch.</td></tr>
        <tr><td>Nothing runs — no trace</td><td>No starter/user_input exists. Every workflow needs at least one seed node.</td></tr>
        <tr><td>"Extension tried to overwrite core block"</td><td>Collision on <code>type</code> id. Pick a different one.</td></tr>
        <tr><td>Export button does nothing (VS Code)</td><td>Uses native Save Dialog via postMessage bridge — check the bridge server is running (status bar shows port).</td></tr>
      </tbody>
    </table>
  </div>
</details>

<!-- ═══ WORKFLOW JSON ═══ -->
<details class="section">
  <summary>📋 Workflow JSON Shape</summary>
  <div class="body">
    <table>
      <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
      <tbody>
        <tr><td><code>_comment</code></td><td>Export timestamp — ignored at import.</td></tr>
        <tr><td><code>workflow.nodes[]</code></td><td>ReactFlow node array. Each has <code>id</code>, <code>type: "builderBlock"</code>, <code>data.blockType</code>, <code>position</code>.</td></tr>
        <tr><td><code>workflow.edges[]</code></td><td>Connections. <code>sourceHandle</code> / <code>targetHandle</code> are <code>out_&lt;key&gt;</code> / <code>in_&lt;key&gt;</code>.</td></tr>
        <tr><td><code>workflow.subBlockValues</code></td><td>Map of <code>nodeId → { fieldId: value }</code> — the inspector state.</td></tr>
        <tr><td><code>data._portTypes</code></td><td>Optional type overrides for port handles.</td></tr>
        <tr><td><code>data.blockType</code></td><td>The block's identity — must match registry, graph-runner cases front + back.</td></tr>
        <tr><td><code>position</code></td><td>Visual <code>{x, y}</code> coords only — execution order is edge-driven.</td></tr>
      </tbody>
    </table>
    <div class="tip tip-warn"><span class="tip-icon">⚠️</span><span><code>blockType</code> must match (1) block definition, (2) registry key, (3) frontend runner case, (4) backend runner case — or it silently pass-throughs.</span></div>
  </div>
</details>

</body>
</html>`;
  }
}
