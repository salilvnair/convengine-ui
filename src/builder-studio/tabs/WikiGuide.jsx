/**
 * Wiki Guide — Rich React-based documentation viewer.
 * Replaces the old iframe-based approach for full theme integration.
 */
import { useState, useMemo } from 'react'
import { getAllBlocks } from '../blocks/registry'
import './wiki-guide.css'

/* ── Helpers ── */
const hl = (json) => {
  const s = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
  return s
    .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="hl-key">$1</span>:')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="hl-str">$1</span>')
    .replace(/:\s*(\d+(?:\.\d+)?)/g, ': <span class="hl-num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="hl-bool">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="hl-cmt">$1</span>')
}

function Code({ children }) {
  return <pre><code dangerouslySetInnerHTML={{ __html: hl(children) }} /></pre>
}

function Tip({ type = 'info', icon, children }) {
  const icons = { info: 'ℹ️', warn: '⚠️', success: '✅', danger: '🚫' }
  return (
    <div className={`wiki-tip ${type}`}>
      <span className="wiki-tip-icon">{icon || icons[type]}</span>
      <div>{children}</div>
    </div>
  )
}

function Badge({ type, children }) {
  return <span className={`wiki-badge ${type}`}>{children}</span>
}

function Step({ num, title, children }) {
  return (
    <div className="wiki-step">
      <div className="wiki-step-num">{num}</div>
      <div className="wiki-step-body">
        {title && <h5>{title}</h5>}
        <p>{children}</p>
      </div>
    </div>
  )
}

/* ── Block card visual ── */
function BlockCard({ block }) {
  const cat = block.category === 'tools' ? 'tool' : block.category === 'triggers' ? 'trigger' : 'core'
  const inputKeys = block.inputs ? Object.keys(block.inputs) : []
  const outputKeys = block.outputs ? Object.keys(block.outputs) : []
  const fields = (block.subBlocks || []).slice(0, 4)

  return (
    <div className="wiki-block-card">
      <div className="wiki-block-card-header">
        <div className="wiki-block-card-icon" style={{ background: block.bgColor || '#6366f1' }}>
          {block.icon && <block.icon />}
        </div>
        <div className="wiki-block-card-title">{block.name}</div>
        <div className="wiki-block-card-badge">{block.type}</div>
      </div>
      <div className="wiki-block-card-body">
        {fields.map((f) => (
          <div className="wiki-block-card-row" key={f.id}>
            <div className="wiki-block-card-dot" style={{ background: block.bgColor || '#6366f1' }} />
            <div className="wiki-block-card-label">{f.title}</div>
            <div className={`wiki-block-card-value ${f.type === 'dropdown' ? 'dropdown' : ''}`}>
              {f.placeholder || f.type}
            </div>
          </div>
        ))}
      </div>
      {(inputKeys.length > 0 || outputKeys.length > 0) && (
        <div className="wiki-block-card-io">
          <div className="wiki-block-card-port">
            {inputKeys.length > 0 && (
              <>
                <div className="wiki-block-card-port-dot" style={{ borderColor: '#818cf8' }} />
                <span className="wiki-block-card-port-badge" style={{ background: 'rgba(129,140,248,.1)', color: '#818cf8' }}>
                  {inputKeys.length} input{inputKeys.length > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
          <div className="wiki-block-card-port">
            {outputKeys.length > 0 && (
              <>
                <span className="wiki-block-card-port-badge" style={{ background: 'rgba(52,211,153,.1)', color: '#34d399' }}>
                  {outputKeys.length} output{outputKeys.length > 1 ? 's' : ''}
                </span>
                <div className="wiki-block-card-port-dot" style={{ borderColor: '#34d399' }} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Table of contents data ── */
const TOC = [
  { section: 'Part 1 — Concepts', items: [
    { id: 'c-hier', label: 'Workspace hierarchy' },
    { id: 'c-exec', label: 'Workflow execution model' },
    { id: 'c-dock', label: 'Run dock panels' },
    { id: 'c-insp', label: 'Inspector' },
    { id: 'c-ext', label: 'Extensions pattern' },
  ]},
  { section: 'Part 2 — Block reference', items: 'blocks' },
  { section: 'Part 3 — Demo workflows', items: [
    { id: 'w-seed', label: 'Seeded · URL → Summary' },
    { id: 'w-url', label: 'URL summariser' },
    { id: 'w-csv', label: 'CSV extract-and-mail' },
    { id: 'w-triage', label: 'Branching triage' },
  ]},
  { section: 'Part 4 — Appendix', items: [
    { id: 'a-keys', label: 'Keyboard shortcuts' },
    { id: 'a-layout', label: 'File layout' },
    { id: 'a-custom', label: 'Writing a custom block' },
    { id: 'a-trouble', label: 'Troubleshooting' },
  ]},
]

/* ── Main component ── */
export default function WikiGuide() {
  const blocks = useMemo(() => getAllBlocks(), [])
  const [activeSection, setActiveSection] = useState(null)

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="wiki">
      {/* Hero */}
      <section className="wiki-hero">
        <h1>ConvEngine Agent Builder Studio</h1>
        <div className="wiki-subtitle">Complete Guide · 2026</div>
        <p className="wiki-desc">
          A field guide to ConvEngine's visual agent builder. Covers the full workspace
          hierarchy (teams → agent pools → agents → skills → workflows), client-side
          graph execution, every built-in block, four end-to-end workflow recipes, and
          an appendix with shortcuts, file layout, extension authoring, and debugging.
        </p>
      </section>

      <div className="wiki-content">
        {/* Table of Contents */}
        <div className="wiki-toc">
          <h2>Table of Contents</h2>
          <div className="wiki-toc-grid">
            {TOC.map((sec) => (
              <div key={sec.section}>
                <div className="wiki-toc-section">{sec.section}</div>
                {sec.items === 'blocks'
                  ? blocks.map((b) => (
                      <a key={b.type} href={`#b-${b.type}`} onClick={(e) => { e.preventDefault(); scrollTo(`b-${b.type}`) }}>
                        <code>{b.type}</code> {b.name}
                      </a>
                    ))
                  : sec.items.map((it) => (
                      <a key={it.id} href={`#${it.id}`} onClick={(e) => { e.preventDefault(); scrollTo(it.id) }}>
                        {it.label}
                      </a>
                    ))
                }
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Part 1 — Concepts ═══ */}
        <div className="wiki-section" id="part1">
          <h2>Part 1 — Concepts</h2>

          <h3 id="c-hier">1.1 Workspace hierarchy</h3>
          <p>
            Builder Studio organises everything inside a single <strong>Workspace</strong>.
            The persistent model forms a four-level tree:
          </p>
          <table>
            <thead><tr><th>Level</th><th>What it is</th><th>SideNav location</th></tr></thead>
            <tbody>
              <tr><td><strong>Workspace</strong></td><td>Top-level container. One per app install; seeded as <code>Default</code> with id <code>ws_default</code>.</td><td>Workspace switcher (top-left).</td></tr>
              <tr><td><strong>Team</strong></td><td>Logical grouping of agent pools owned by a squad.</td><td>SideNav → <strong>Teams</strong>.</td></tr>
              <tr><td><strong>Agent Pool</strong></td><td>A roster of related agents that collaborate.</td><td>Nested inside each team card.</td></tr>
              <tr><td><strong>Agent</strong></td><td>LLM wrapper with prompts, schemas, model choice, and attached skills.</td><td>Under a pool; click to open editor.</td></tr>
              <tr><td><strong>Skill</strong></td><td>Reusable JS/Python function with input/output schemas.</td><td>SideNav → <strong>Skills</strong>.</td></tr>
              <tr><td><strong>Workflow</strong></td><td>Canvas of nodes + edges + subBlockValues. Has metadata (timeout, retries, etc).</td><td>SideNav → <strong>Workflows</strong>.</td></tr>
            </tbody>
          </table>
          <Tip type="info">Agents and skills are referenced by id — editing one propagates to every workflow that uses it.</Tip>

          <h3 id="c-exec">1.2 Workflow execution model</h3>
          <p>The graph runner uses <strong>topological BFS with readiness gating</strong>:</p>
          <div className="wiki-steps">
            <Step num={1} title="Seed phase">Starter nodes → <code>null</code>, user_input nodes → dialog value.</Step>
            <Step num={2} title="Ready set">A node is ready when all incoming edges are "live" (source finished + edge handle matches).</Step>
            <Step num={3} title="Concurrent dispatch">All ready nodes run via <code>Promise.all</code>.</Step>
            <Step num={4} title="Per-node execution">Switch on <code>blockType</code> — each block type has its own runner logic.</Step>
            <Step num={5} title="Output shape">Most blocks return raw value. Agent/MCP return <code>{'{ __meta, value }'}</code>. Branching returns <code>{'{ branch, value }'}</code>.</Step>
          </div>
          <Tip type="warn">Agent nodes use <code>{'{{key}}'}</code> template interpolation. Unresolved vars appear as literal text in prompts.</Tip>

          <h3 id="c-dock">1.3 Run dock panels</h3>
          <table>
            <thead><tr><th>Panel</th><th>Shows</th></tr></thead>
            <tbody>
              <tr><td><strong>Output</strong></td><td>Final <code>result.output</code> formatted with JsonView.</td></tr>
              <tr><td><strong>Debug</strong></td><td>Chronological event log (start/done/error). Expandable cards show prompts, skill runs, provider response.</td></tr>
              <tr><td><strong>Trace</strong></td><td>Grid of nodes: title, blockType, input, values, meta, output, ms.</td></tr>
              <tr><td><strong>Console</strong></td><td>Captured <code>console.log</code> from function/skill executions.</td></tr>
            </tbody>
          </table>
          <p>
            Node card states: <strong>idle</strong> → <strong>active</strong> (dashed pulsing green) → <strong>completed</strong> (solid green + check) → <strong>error</strong> (red ring + tooltip).
          </p>

          <h3 id="c-insp">1.4 Inspector</h3>
          <p>
            Right rail rendered by <code>panel/Inspector.jsx</code>. Features:
          </p>
          <ul>
            <li><strong>Basic vs Advanced tabs</strong> — toggled when any sub-block has <code>mode: 'advanced'</code>.</li>
            <li><strong>Visibility</strong> — filtered by <code>matchesMode()</code> + field-level <code>condition</code> predicate.</li>
            <li><strong>Delete-with-confirm</strong> — trashcan opens ConfirmModal.</li>
            <li><strong>About icon</strong> — toggles <code>BlockDocViewer</code> reading from <code>docs/block-docs-entries.js</code>.</li>
            <li><strong>IOPanel</strong> — connections, template variables, typed inputs/outputs.</li>
          </ul>
          <h4>SubBlock type → control mapping</h4>
          <table>
            <thead><tr><th>Type</th><th>Control</th></tr></thead>
            <tbody>
              <tr><td><code>short-input</code></td><td>Single-line text input</td></tr>
              <tr><td><code>long-input</code>, <code>text</code></td><td>Textarea</td></tr>
              <tr><td><code>dropdown</code>, <code>combobox</code></td><td><code>{'<select>'}</code></td></tr>
              <tr><td><code>switch</code></td><td>iOS-style toggle</td></tr>
              <tr><td><code>slider</code></td><td>Range input</td></tr>
              <tr><td><code>table</code></td><td>Row-based key/value grid</td></tr>
              <tr><td><code>code</code></td><td>CodeMirror editor</td></tr>
              <tr><td><code>response-format</code></td><td>FullscreenWrapper + JSON tree</td></tr>
              <tr><td><code>mcp-*</code></td><td>MCP-specific selectors</td></tr>
              <tr><td><code>file-upload</code></td><td>File input</td></tr>
            </tbody>
          </table>

          <h3 id="c-ext">1.5 Extensions pattern</h3>
          <p>
            Drop a <code>.js</code> file into <code>builder-studio/extensions/</code> and it's auto-discovered via Vite's <code>import.meta.glob</code>.
            Export a <code>BlockConfig</code> object (or named <code>block</code> / <code>{'<Name>Block'}</code>) — the registry picks it up on next reload.
          </p>
          <Tip type="success">Core blocks cannot be shadowed by extensions. If a collision is detected, the extension is skipped with a console warning.</Tip>
        </div>

        <div className="wiki-divider" />

        {/* ═══ Part 2 — Block Reference ═══ */}
        <div className="wiki-section" id="part2">
          <h2>Part 2 — Block Reference</h2>
          <p>
            Every built-in block with its fields, inputs, outputs, execution notes, and a canvas card preview.
            There are currently <strong>{blocks.length}</strong> blocks across three categories:
            <span className="wiki-cat core">blocks</span>
            <span className="wiki-cat tool">tools</span>
            <span className="wiki-cat trigger">triggers</span>
          </p>

          {blocks.map((b) => {
            const cat = b.category === 'tools' ? 'tool' : b.category === 'triggers' ? 'trigger' : 'core'
            const inputEntries = b.inputs ? Object.entries(b.inputs) : []
            const outputEntries = b.outputs ? Object.entries(b.outputs) : []
            return (
              <div key={b.type} id={`b-${b.type}`} className="wiki-block-anchor" style={{ marginTop: 48 }}>
                <h3>
                  <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: b.bgColor, verticalAlign: 'middle', marginRight: 8 }} />
                  {b.name}
                  <code style={{ marginLeft: 8, fontSize: '.8rem' }}>{b.type}</code>
                  <span className={`wiki-cat ${cat}`}>{b.category}</span>
                </h3>
                <p>{b.longDescription || b.description}</p>

                {/* Canvas card preview */}
                <BlockCard block={b} />

                {/* Fields */}
                {b.subBlocks && b.subBlocks.length > 0 && (
                  <>
                    <h4>Fields</h4>
                    <table>
                      <thead><tr><th>Field</th><th>Type</th><th>Details</th></tr></thead>
                      <tbody>
                        {b.subBlocks.map((f) => (
                          <tr key={f.id}>
                            <td><code>{f.id}</code>{f.required && <> <Badge type="required">required</Badge></>}{f.mode === 'advanced' && <> <Badge type="advanced">advanced</Badge></>}</td>
                            <td><code>{f.type}</code></td>
                            <td>{f.title}{f.placeholder ? ` — ${f.placeholder}` : ''}{f.defaultValue != null ? ` (default: ${f.defaultValue})` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {/* Inputs */}
                {inputEntries.length > 0 && (
                  <>
                    <h4>Inputs</h4>
                    <table>
                      <thead><tr><th>Key</th><th>Type</th><th>Description</th></tr></thead>
                      <tbody>
                        {inputEntries.map(([k, v]) => (
                          <tr key={k}><td><code>{k}</code></td><td>{v.type}</td><td>{v.description}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {/* Outputs */}
                {outputEntries.length > 0 && (
                  <>
                    <h4>Outputs</h4>
                    <table>
                      <thead><tr><th>Key</th><th>Type</th><th>Description</th></tr></thead>
                      <tbody>
                        {outputEntries.map(([k, v]) => (
                          <tr key={k}><td><code>{k}</code></td><td>{v.type}</td><td>{v.description}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="wiki-divider" />

        {/* ═══ Part 3 — Demo Workflows ═══ */}
        <div className="wiki-section" id="part3">
          <h2>Part 3 — Demo Workflows</h2>

          {/* A. Seeded URL → Summary */}
          <h3 id="w-seed">A. Seeded · URL → Summary</h3>
          <p><strong>Goal:</strong> Paste URL → skill fetches page → LLM summarises 3–5 bullets.</p>
          <div className="wiki-steps">
            <Step num={1} title="Start">Starter block with <code>manual</code> mode.</Step>
            <Step num={2} title="URL input">User input block — kind: <code>url</code>, default: <code>https://www.salilvnair.com/docs/v2/architecture</code>.</Step>
            <Step num={3} title="URL Extractor agent">Agent with <code>sk_url_extract</code> skill. Model: <code>claude-sonnet-4-6</code>. Response format: <code>{'{ url, title, text }'}</code>.</Step>
            <Step num={4} title="Summarizer agent">Second agent, model: <code>claude-sonnet-4-6</code>. Response format: <code>{'{ summary, bullets[] }'}</code>.</Step>
            <Step num={5} title="Response">Response block: <code>{'data: "<n_agent2.output>"'}</code>.</Step>
            <Step num={6} title="Preview">Show Preview block renders the final JSON on the canvas.</Step>
          </div>
          <Code>{`{
  "summary": "Architecture overview of ConvEngine v2...",
  "bullets": [
    "Event-driven microservices architecture",
    "Horizontal scaling via Kubernetes",
    "GraphQL gateway for unified API"
  ]
}`}</Code>

          {/* B. URL Summariser (lean) */}
          <h3 id="w-url">B. URL Summariser (lean, no skills)</h3>
          <p><strong>Goal:</strong> Skip workspace skills; use API block to fetch HTML → LLM summarise.</p>
          <div className="wiki-steps">
            <Step num={1} title="URL input">User input with default <code>https://example.com</code>.</Step>
            <Step num={2} title="API GET">API block: <code>GET {'{{input}}'}</code> with Accept header.</Step>
            <Step num={3} title="Summarizer">Agent: <code>gpt-4o-mini</code>, prompt: <code>{'Body:\\n{{body}}'}</code>, strict output.</Step>
            <Step num={4} title="Preview">Show Preview renders result.</Step>
          </div>

          {/* C. CSV extract-and-mail */}
          <h3 id="w-csv">C. CSV Extract-and-Mail (scheduled)</h3>
          <p><strong>Goal:</strong> 08:00 IST → fetch CSV → parse → digest → save JSON → email ops.</p>
          <div className="wiki-steps">
            <Step num={1} title="Schedule trigger">Cron: <code>0 8 * * *</code>, timezone: <code>Asia/Kolkata</code>.</Step>
            <Step num={2} title="API fetch">GET the CSV URL with Bearer auth, 30s timeout, 2 retries.</Step>
            <Step num={3} title="Function (parse)">JavaScript that splits CSV on newlines, returns <code>{'{ rows, count }'}</code>.</Step>
            <Step num={4} title="Digest agent">GPT-4o with structured output: <code>{'{ date, count, highlights[], riskFlags[] }'}</code>.</Step>
            <Step num={5} title="Save to files">Path: <code>reports/digest.json</code>.</Step>
            <Step num={6} title="SMTP">Gmail SMTP → ops@example.com with HTML body.</Step>
          </div>

          {/* D. Branching triage */}
          <h3 id="w-triage">D. Branching Triage</h3>
          <p><strong>Goal:</strong> Customer message → classifier → route to specialist agent → response.</p>
          <div className="wiki-steps">
            <Step num={1} title="Customer message">User input: <code>long-text</code>.</Step>
            <Step num={2} title="Classifier agent">GPT-4o-mini with <code>{'{ category: enum[billing,tech,sales] }'}</code> strict output.</Step>
            <Step num={3} title="if_elseif_else">3 branches matching <code>billing</code>, <code>tech</code>, <code>sales</code>.</Step>
            <Step num={4} title="Specialist agents">Billing, Tech, and Sales agents with domain-specific system prompts.</Step>
            <Step num={5} title="Response">Merge: <code>{'{ category, reply }'}</code> — only the active branch's agent produces output.</Step>
          </div>

          <Tip type="info">
            <strong>Branching triage examples:</strong>
          </Tip>

          <h4>Example 1 — Billing inquiry</h4>
          <p>Customer writes: <em>"I was charged twice for my subscription last month."</em></p>
          <div className="wiki-steps">
            <Step num={1} title="Classifier">Agent returns <code>{'{ "category": "billing" }'}</code>.</Step>
            <Step num={2} title="if_elseif_else">Branch 1 matches: <code>input.category === "billing"</code> → true.</Step>
            <Step num={3} title="Billing agent">System: "You are a billing specialist." → Generates refund guidance reply.</Step>
            <Step num={4} title="Response"><code>{'{ "category": "billing", "reply": "I see the duplicate charge. Let me initiate a refund..." }'}</code></Step>
          </div>

          <h4>Example 2 — Technical support</h4>
          <p>Customer writes: <em>"My API keeps returning 504 timeout errors."</em></p>
          <div className="wiki-steps">
            <Step num={1} title="Classifier">Agent returns <code>{'{ "category": "tech" }'}</code>.</Step>
            <Step num={2} title="if_elseif_else">Branch 2 matches: <code>input.category === "tech"</code> → true.</Step>
            <Step num={3} title="Tech agent">System: "You are a tech-support engineer." → Provides timeout debugging steps.</Step>
            <Step num={4} title="Response"><code>{'{ "category": "tech", "reply": "504 errors typically indicate upstream timeout. Try: 1) Increase timeout to 60s, 2) Check server logs..." }'}</code></Step>
          </div>

          <h4>Example 3 — Sales inquiry</h4>
          <p>Customer writes: <em>"What's the difference between Pro and Enterprise plans?"</em></p>
          <div className="wiki-steps">
            <Step num={1} title="Classifier">Agent returns <code>{'{ "category": "sales" }'}</code>.</Step>
            <Step num={2} title="if_elseif_else">Branch 3 matches: <code>input.category === "sales"</code> → true.</Step>
            <Step num={3} title="Sales agent">System: "You are a friendly sales consultant." → Compares plans with pricing.</Step>
            <Step num={4} title="Response"><code>{'{ "category": "sales", "reply": "Great question! Pro includes 10k API calls/month at $49. Enterprise adds SSO, SLA, and unlimited calls at $199..." }'}</code></Step>
          </div>
        </div>

        <div className="wiki-divider" />

        {/* ═══ Part 4 — Appendix ═══ */}
        <div className="wiki-section" id="part4">
          <h2>Part 4 — Appendix</h2>

          <h3 id="a-keys">4.1 Keyboard shortcuts</h3>
          <h4>Canvas</h4>
          <table>
            <thead><tr><th>Key</th><th>Action</th></tr></thead>
            <tbody>
              <tr><td><code>Delete</code> / <code>Backspace</code></td><td>Delete selected node</td></tr>
              <tr><td><code>⌘ D</code></td><td>Duplicate selected node</td></tr>
              <tr><td><code>F2</code> / <code>Enter</code></td><td>Rename selected node</td></tr>
              <tr><td><code>Esc</code></td><td>Deselect / cancel rename</td></tr>
              <tr><td><code>↑ ↓ ← →</code></td><td>Nudge by 10 px</td></tr>
              <tr><td><code>Shift + Arrow</code></td><td>Nudge by 50 px</td></tr>
              <tr><td>Double-click</td><td>Inline rename</td></tr>
              <tr><td>Right-click</td><td>Context menu</td></tr>
            </tbody>
          </table>
          <h4>Workspace</h4>
          <table>
            <thead><tr><th>Key</th><th>Action</th></tr></thead>
            <tbody>
              <tr><td><code>⌘ .</code></td><td>Toggle inspector</td></tr>
              <tr><td><code>⌘ ,</code></td><td>Open Settings</td></tr>
              <tr><td><code>?</code></td><td>Shortcuts cheat-sheet</td></tr>
            </tbody>
          </table>

          <h3 id="a-layout">4.2 File layout</h3>
          <Code>{`builder-studio/
├── AgentBuilderPage.jsx      // top-level layout
├── builder-studio.css
├── blocks/
│   ├── registry.js           // getBlock(), registerBlock()
│   ├── types.js              // SubBlockType enum
│   ├── blocks/
│   │   ├── index.js          // barrel export
│   │   └── <name>.js         // one file per block
├── canvas/                   // React Flow + renderers
├── components/               // icons, CodeEditor, JsonEditor
├── docs/                     // block-docs-entries.js
├── extensions/               // drop-in user blocks (Vite glob)
├── mcp/                      // MCP client + store
├── panel/                    // Inspector, SubBlockRenderer
├── run/                      // RunModal, graph-runner.js
├── sidenav/                  // SideNav, BlockPalette
├── stores/                   // zustand stores
└── tabs/                     // CenterPane, editors`}</Code>

          <h3 id="a-custom">4.3 Writing a custom block</h3>
          <p>Two steps: write a <code>BlockConfig</code> and drop it into <code>extensions/</code>.</p>
          <Code>{`// extensions/slugify.js
export const SlugifyBlock = {
  type: 'slugify',
  name: 'Slugify',
  description: 'Normalise string to URL slug',
  category: 'blocks',
  bgColor: '#64748b',
  icon: VariableIcon,
  subBlocks: [
    { id: 'lowercase', title: 'Lower-case', type: 'switch', defaultValue: true },
    { id: 'separator', title: 'Separator', type: 'short-input', defaultValue: '-' }
  ],
  tools: { access: [] },
  inputs:  { input: { type: 'string', description: 'Raw text' } },
  outputs: { result: { type: 'string', description: 'URL slug' } }
}
export default SlugifyBlock`}</Code>
          <Tip type="info">For branching blocks, add <code>outputHandles</code> or <code>outputHandlesFromValues(values)</code> to dynamically generate source handles.</Tip>
          <Tip type="warn">Core blocks can't be overwritten by extensions. Pick a unique <code>type</code> id.</Tip>

          <h3 id="a-trouble">4.4 Troubleshooting</h3>
          <table>
            <thead><tr><th>Symptom</th><th>Cause & Fix</th></tr></thead>
            <tbody>
              <tr><td>"No content provided to summarize"</td><td>Template var didn't resolve. Check <code>meta.userPrompt</code> in Debug panel for literal <code>{'{{foo}}'}</code>.</td></tr>
              <tr><td>"MCP block: arguments is not valid JSON"</td><td>Raw quotes in <code>{'{{input}}'}</code>. Wrap: <code>{'{"query": "{{input}}"}'}</code>.</td></tr>
              <tr><td>Node stays "active" forever</td><td>Upstream branch didn't pick live edge. Check Trace for <code>chosenHandle</code>.</td></tr>
              <tr><td>"TypeError: fn is not a function"</td><td>Function block code isn't expression. Wrap with <code>return …</code>.</td></tr>
              <tr><td>Skill output ignored</td><td>Field is <code>values.skills</code>, not <code>values.tools</code>.</td></tr>
              <tr><td>Response Format ignored</td><td>Both <code>responseFormat</code> and <code>strictOutput</code> must be set.</td></tr>
              <tr><td>CORS errors on URL extractor</td><td>Use API block (server-side) instead of client-side fetch.</td></tr>
              <tr><td>Nothing runs — no trace</td><td>No starter/user_input exists. Every workflow needs at least one seed node.</td></tr>
              <tr><td>"Extension tried to overwrite core block"</td><td>Collision on <code>type</code> id. Pick a different one.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export const BookIcon = (p) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
)
