/**
 * Wiki Guide — Rich React-based documentation viewer.
 * Replaces the old iframe-based approach for full theme integration.
 */
import { useState, useMemo, useRef } from 'react'
import { getAllBlocks, CATEGORY_LABELS, CATEGORY_ORDER, groupBlocksByCategory } from '../blocks/registry'
import JsonView from '../run/JsonView'
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

/* ── Collapsible section ── */
function Collapsible({ title, icon, defaultOpen = false, children, className = '' }) {
  const [open, setOpen] = useState(defaultOpen)
  const toggleRef = useRef(null)
  return (
    <div className={`wiki-collapsible ${open ? 'wiki-collapsible--open' : ''} ${className}`}>
      <button ref={toggleRef} className="wiki-collapsible-toggle" data-wiki-toggle onClick={() => setOpen(!open)}>
        <svg className={`wiki-collapsible-chevron ${open ? 'open' : ''}`} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {icon && <span className="wiki-collapsible-icon">{icon}</span>}
        <span className="wiki-collapsible-title">{title}</span>
      </button>
      {open && <div className="wiki-collapsible-body">{children}</div>}
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

/* ── JSON tag explanation card ── */
function JsonTagCard({ icon, title, code, variant, id, children }) {
  return (
    <div className={`wiki-json-card ${variant || ''}`} id={id}>
      <div className="wiki-json-card-icon">{icon}</div>
      <div className="wiki-json-card-body">
        <h4 className="wiki-json-card-title">
          {code && <code>{code}</code>}
          <span>{title}</span>
        </h4>
        <p className="wiki-json-card-desc">{children}</p>
      </div>
    </div>
  )
}

/* ── Main component ── */
export default function WikiGuide() {
  const blocks = useMemo(() => getAllBlocks(), [])

  const groupedBlocks = useMemo(() => {
    const groups = {}
    for (const b of blocks) {
      const cat = b.category || 'custom'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(b)
    }
    return groups
  }, [blocks])

  const categorySubGroups = useMemo(() => {
    const result = {}
    for (const cat of CATEGORY_ORDER) {
      result[cat] = groupBlocksByCategory(groupedBlocks[cat] || [], cat)
    }
    return result
  }, [groupedBlocks])

  const scrollTo = (id) => {
    let el = document.getElementById(id)
    if (!el) {
      // Target may be inside a closed Collapsible — open all ancestors
      // We do a two-pass: first open every collapsed section so the DOM renders,
      // then find the element.
      const closedToggles = document.querySelectorAll('.wiki-collapsible:not(.wiki-collapsible--open) > [data-wiki-toggle]')
      closedToggles.forEach((btn) => btn.click())
      // Allow React to flush
      requestAnimationFrame(() => {
        const target = document.getElementById(id)
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    // If the element exists but is inside a hidden collapsible, open ancestors
    let node = el.parentElement
    while (node) {
      if (node.classList?.contains('wiki-collapsible') && !node.classList.contains('wiki-collapsible--open')) {
        const toggle = node.querySelector(':scope > [data-wiki-toggle]')
        if (toggle) toggle.click()
      }
      node = node.parentElement
    }
    requestAnimationFrame(() => {
      const target = document.getElementById(id)
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const WORKFLOW_JSON_EXAMPLE = JSON.stringify({
    "_comment": "Exported from ConvEngine Agent Builder Studio — 2026-04-21T00:47:53.210Z",
    "workflow": {
      "id": "wf_demo_url_summary",
      "name": "Demo · URL → Summary",
      "teamId": "t_fullstack",
      "createdAt": "2026-04-20T03:12:25.643017Z",
      "nodes": [
        {
          "id": "n_starter",
          "type": "builderBlock",
          "data": { "title": "Start", "bgColor": "#2FB67C", "blockType": "starter" },
          "position": { "x": -609.26, "y": 195.63 }
        },
        {
          "id": "n_input",
          "type": "builderBlock",
          "data": { "title": "URL", "bgColor": "#FBBF24", "blockType": "user_input" },
          "position": { "x": -285.60, "y": 200.27 }
        },
        {
          "id": "n_skill",
          "type": "builderBlock",
          "data": { "title": "Skill", "bgColor": "#7c3aed", "blockType": "skill", "category": "tools", "disabled": false },
          "position": { "x": 33.67, "y": 201.19 }
        },
        {
          "id": "n_agent",
          "type": "builderBlock",
          "data": { "title": "Summarizer", "bgColor": "#6F3DFA", "blockType": "agent", "disabled": false, "width": 272, "height": 354 },
          "position": { "x": 359.99, "y": 202.68 }
        },
        {
          "id": "n_mapper",
          "type": "builderBlock",
          "data": { "title": "Mapper", "bgColor": "#14b8a6", "blockType": "mapper", "category": "blocks", "disabled": false },
          "position": { "x": 684.10, "y": 202.50 }
        },
        {
          "id": "n_preview",
          "type": "builderBlock",
          "data": { "title": "Final Preview", "bgColor": "#14B8A6", "blockType": "show_preview", "disabled": false },
          "position": { "x": 1011.42, "y": 202.78 }
        }
      ],
      "edges": [
        {
          "id": "reactflow__edge-n_starterout-n_inputin",
          "source": "n_starter",
          "target": "n_input",
          "animated": true,
          "sourceHandle": "out",
          "targetHandle": "in"
        },
        {
          "id": "reactflow__edge-n_inputvalue-n_skillin_input",
          "source": "n_input",
          "target": "n_skill",
          "animated": true,
          "sourceHandle": "value",
          "targetHandle": "in_input"
        },
        {
          "id": "reactflow__edge-n_skillresult-n_agentin_input",
          "source": "n_skill",
          "target": "n_agent",
          "animated": true,
          "sourceHandle": "result",
          "targetHandle": "in_input"
        },
        {
          "id": "reactflow__edge-n_agentdata-n_mapperin_input",
          "source": "n_agent",
          "target": "n_mapper",
          "animated": true,
          "sourceHandle": "data",
          "targetHandle": "in_input"
        },
        {
          "id": "reactflow__edge-n_mapperresult-n_previewin_input",
          "source": "n_mapper",
          "target": "n_preview",
          "animated": true,
          "sourceHandle": "result",
          "targetHandle": "in_input"
        }
      ],
      "subBlockValues": {
        "n_starter": {
          "startWorkflow": "manual"
        },
        "n_input": {
          "kind": "url",
          "label": "URL",
          "required": true,
          "placeholder": "https://example.com",
          "defaultValue": "https://www.salilvnair.com/docs/v2/architecture",
          "_portTypes": { "out_value": "string" }
        },
        "n_skill": {
          "skillId": "sk_url_extract",
          "_portTypes": { "in_input": "string", "out_result": "json" }
        },
        "n_agent": {
          "model": "gpt-4.1",
          "temperature": 0.3,
          "systemPrompt": "You are a concise summarization agent. Produce a crisp summary in 3-5 bullet points, each under 140 characters.",
          "userPrompt": "Title: {{title}}\n\nContent:\n{{text}}",
          "responseFormat": "{\n  \"type\": \"object\",\n  \"properties\": {\n    \"summary\": { \"type\": \"string\" },\n    \"bullets\": { \"type\": \"array\", \"items\": { \"type\": \"string\" } }\n  },\n  \"required\": [\"summary\"]\n}"
        },
        "n_mapper": {
          "mode": "json_parse",
          "_portTypes": { "in_input": "string", "out_result": "json" }
        },
        "n_preview": {
          "label": "Final output"
        }
      }
    }
  }, null, 2)

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

          <Collapsible title="Concepts" icon="💡">
            <div className="wiki-toc-items">
              <a href="#c-hier" onClick={(e) => { e.preventDefault(); scrollTo('c-hier') }}>Workspace hierarchy</a>
              <a href="#c-exec" onClick={(e) => { e.preventDefault(); scrollTo('c-exec') }}>Workflow execution model</a>
              <a href="#c-dock" onClick={(e) => { e.preventDefault(); scrollTo('c-dock') }}>Run dock panels</a>
              <a href="#c-insp" onClick={(e) => { e.preventDefault(); scrollTo('c-insp') }}>Inspector</a>
              <a href="#c-ext" onClick={(e) => { e.preventDefault(); scrollTo('c-ext') }}>Extensions pattern</a>
            </div>
          </Collapsible>


          <Collapsible title="Workflow JSON Schema" icon="📋">
            <div className="wiki-toc-items">
              <a href="#json-schema" onClick={(e) => { e.preventDefault(); scrollTo('json-schema') }}>Full JSON structure</a>
              <a href="#json-wrapper" onClick={(e) => { e.preventDefault(); scrollTo('json-wrapper') }}>_comment &amp; workflow — Export wrapper</a>
              <a href="#json-nodes" onClick={(e) => { e.preventDefault(); scrollTo('json-nodes') }}>nodes — Block instances</a>
              <a href="#json-node-data" onClick={(e) => { e.preventDefault(); scrollTo('json-node-data') }}>data.* — Node metadata fields</a>
              <a href="#json-edges" onClick={(e) => { e.preventDefault(); scrollTo('json-edges') }}>edges — Connections</a>
              <a href="#json-sbv" onClick={(e) => { e.preventDefault(); scrollTo('json-sbv') }}>subBlockValues — Config data</a>
              <a href="#json-porttypes" onClick={(e) => { e.preventDefault(); scrollTo('json-porttypes') }}>_portTypes — Type overrides</a>
              <a href="#json-blocktype" onClick={(e) => { e.preventDefault(); scrollTo('json-blocktype') }}>data.blockType — Identity</a>
              <a href="#json-position" onClick={(e) => { e.preventDefault(); scrollTo('json-position') }}>position — Layout</a>
              <a href="#json-templates" onClick={(e) => { e.preventDefault(); scrollTo('json-templates') }}>Template expressions</a>
            </div>
          </Collapsible>

          <Collapsible title="Block Reference" icon="🧱">
            <div className="wiki-toc-items">
              {CATEGORY_ORDER.map((cat) => {
                const catBlocks = groupedBlocks[cat]
                if (!catBlocks || catBlocks.length === 0) return null
                const { topItems, groups } = categorySubGroups[cat]

                return (
                  <Collapsible key={cat} title={`${CATEGORY_LABELS[cat]} (${catBlocks.length})`} className="wiki-toc-nested">
                    <div className="wiki-toc-items">
                      {topItems.map((b) => (
                        <a key={b.type} href={`#b-${b.type}`} onClick={(e) => { e.preventDefault(); scrollTo(`b-${b.type}`) }}>
                          <span className="wiki-toc-block-name">{b.name}</span>
                          <code>{b.type}</code>
                        </a>
                      ))}
                      {groups.map((sg) => (
                        <Collapsible key={sg.id} title={`${sg.label} (${sg.items.length})`} className="wiki-toc-nested">
                          <div className="wiki-toc-items">
                            {sg.items.map((b) => (
                              <a key={b.type} href={`#b-${b.type}`} onClick={(e) => { e.preventDefault(); scrollTo(`b-${b.type}`) }}>
                                <span className="wiki-toc-block-name">{b.name}</span>
                                <code>{b.type}</code>
                              </a>
                            ))}
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  </Collapsible>
                )
              })}
            </div>
          </Collapsible>

          <Collapsible title="Demo Workflows" icon="🚀">
            <div className="wiki-toc-items">
              <a href="#w-seed" onClick={(e) => { e.preventDefault(); scrollTo('w-seed') }}>Seeded · URL → Summary</a>
              <a href="#w-url" onClick={(e) => { e.preventDefault(); scrollTo('w-url') }}>URL summariser</a>
              <a href="#w-csv" onClick={(e) => { e.preventDefault(); scrollTo('w-csv') }}>CSV extract-and-mail</a>
              <a href="#w-triage" onClick={(e) => { e.preventDefault(); scrollTo('w-triage') }}>Branching triage</a>
            </div>
          </Collapsible>

          <Collapsible title="Appendix" icon="📎">
            <div className="wiki-toc-items">
              <a href="#a-keys" onClick={(e) => { e.preventDefault(); scrollTo('a-keys') }}>Keyboard shortcuts</a>
              <a href="#a-layout" onClick={(e) => { e.preventDefault(); scrollTo('a-layout') }}>File layout</a>
              <a href="#a-custom" onClick={(e) => { e.preventDefault(); scrollTo('a-custom') }}>Writing a custom block</a>
              <a href="#a-trouble" onClick={(e) => { e.preventDefault(); scrollTo('a-trouble') }}>Troubleshooting</a>
            </div>
          </Collapsible>
        </div>

        {/* ═══ Concepts ═══ */}
        <div className="wiki-section" id="part1">
          <h2>Concepts</h2>

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

        {/* ═══ Workflow JSON Schema ═══ */}
        <div className="wiki-section" id="json-explorer">
          <h2>Workflow JSON Schema</h2>
          <p>
            Every workflow is stored and transmitted as a single JSON blob. This is the
            <strong> only data contract</strong> between the frontend canvas and the
            backend graph runner. The frontend produces it; the backend consumes it.
            Understanding this structure is essential for debugging, exporting, and
            writing custom integrations.
          </p>

          <h3 id="json-schema">Full structure</h3>
          <div className="wiki-json-collapsible">
            <JsonView value={WORKFLOW_JSON_EXAMPLE} collapsible defaultExpanded={1} />
          </div>

          <Tip type="info">
            Use the <strong>Export</strong> button in the toolbar to download
            this JSON for any workflow you{"'"}ve built.
          </Tip>

          <h3 style={{ marginTop: 40 }}>Tag reference</h3>

          <JsonTagCard id="json-wrapper" icon="📦" code="_comment / workflow" title="Export wrapper — top-level envelope" variant="nodes">
            Every exported file wraps the workflow inside a top-level <code>workflow</code> object
            alongside a human-readable <code>_comment</code> string that records the export
            timestamp. The <code>workflow</code> object carries five required keys:{' '}
            <code>id</code> (unique workflow identifier, e.g. <code>wf_demo_url_summary</code>),{' '}
            <code>name</code> (display name), <code>teamId</code> (owning team, or{' '}
            <code>null</code> if unassigned), <code>createdAt</code> (ISO-8601 creation
            timestamp), and the three structural keys <code>nodes</code>, <code>edges</code>,
            and <code>subBlockValues</code>. When importing via drag-and-drop the runtime reads{' '}
            <code>file.workflow</code> first, then falls back to the root object for legacy files
            that lack the wrapper.
          </JsonTagCard>

          <JsonTagCard id="json-nodes" icon="🧩" code="nodes" title="Block instances on the canvas" variant="nodes">
            Each object represents one block dropped onto the canvas. Every node always has four
            top-level keys:{' '}
            <code>id</code> — unique identifier referenced by edges and <code>subBlockValues</code>;{' '}
            <code>type</code> — always <code>&quot;builderBlock&quot;</code> (the ReactFlow node type
            that selects the WorkflowNode renderer);{' '}
            <code>data</code> — metadata object (see below); and{' '}
            <code>position</code> — canvas x/y coordinates. The <code>id</code> drives execution
            routing — do not change it after creating edges.
          </JsonTagCard>

          <JsonTagCard id="json-node-data" icon="🎨" code="data.*" title="Node metadata fields inside data" variant="blocktype">
            <code>data.blockType</code> — the block identity string (see below).{' '}
            <code>data.title</code> — user-visible label rendered on the canvas card.{' '}
            <code>data.bgColor</code> — hex colour of the node header / icon well (e.g.{' '}
            <code>#6F3DFA</code> for agent, <code>#FBBF24</code> for user_input). Used purely for
            visual identification; does not affect execution.{' '}
            <code>data.category</code> — optional hint (<code>&quot;blocks&quot;</code>,{' '}
            <code>&quot;tools&quot;</code>, <code>&quot;triggers&quot;</code>) that places the block
            in the correct palette group.{' '}
            <code>data.disabled</code> — when <code>true</code> the node is muted: it passes its
            upstream input through unchanged and the runner skips its actual handler.{' '}
            <code>data.width</code> / <code>data.height</code> — optional persisted dimensions set
            when the user manually resizes a node via the resize handles. Omit them to let the
            node size itself to content.
          </JsonTagCard>

          <JsonTagCard id="json-edges" icon="🔗" code="edges" title="Connections between blocks" variant="edges">
            Each edge connects one node{"'"}s output port to another node{"'"}s input port and
            carries six fields:{' '}
            <code>id</code> — auto-generated string, typically{' '}
            <code>reactflow__edge-&#123;source&#125;&#123;sourceHandle&#125;-&#123;target&#125;&#123;targetHandle&#125;</code>;{' '}
            <code>source</code> / <code>target</code> — node IDs;{' '}
            <code>sourceHandle</code> — the named output port on the source node (e.g.{' '}
            <code>&quot;out&quot;</code>, <code>&quot;value&quot;</code>, <code>&quot;result&quot;</code>,{' '}
            <code>&quot;data&quot;</code>, or branch labels like <code>&quot;branch_1&quot;</code>);{' '}
            <code>targetHandle</code> — the named input port on the target node, conventionally
            prefixed with <code>in_</code> (e.g. <code>&quot;in_input&quot;</code>,{' '}
            <code>&quot;in_data&quot;</code>); and <code>animated</code> — always{' '}
            <code>true</code> for the dashed flow animation. The graph runner uses edges to
            determine BFS execution order and, for branching blocks, only the edge whose{' '}
            <code>sourceHandle</code> matches the chosen branch handle is live.
          </JsonTagCard>

          <JsonTagCard id="json-sbv" icon="⚙️" code="subBlockValues" title="Configuration data per node" variant="values">
            Keyed by node ID. Each value is a flat object whose keys match the{' '}
            <code>subBlocks[].id</code> fields from that block{"'"}s definition in the frontend
            registry. This is the <strong>data contract</strong> between frontend and backend — the
            graph runner reads <code>values.model</code>, <code>values.temperature</code>,{' '}
            <code>values.systemPrompt</code>, <code>values.skillId</code>, etc. from this bag.
            When you configure a field in the Inspector panel the value is written here.
            Template expressions like <code>{"{{title}}"}</code> or{' '}
            <code>{"<n_agent.summary>"}</code> in string values are interpolated at runtime against
            the upstream node{"'"}s output bag.
          </JsonTagCard>

          <JsonTagCard id="json-porttypes" icon="🔌" code="_portTypes" title="Port type overrides per node" variant="values">
            An optional map inside any <code>subBlockValues</code> entry that overrides the
            statically declared port types for that node instance. Keys follow the convention{' '}
            <code>out_&lt;portKey&gt;</code> for output ports and <code>in_&lt;portKey&gt;</code> for
            input ports (e.g. <code>&quot;out_value&quot;: &quot;string&quot;</code>,{' '}
            <code>&quot;in_input&quot;: &quot;string&quot;</code>,{' '}
            <code>&quot;out_result&quot;: &quot;json&quot;</code>). The Inspector writes these
            automatically when the user changes a port type via the type-chip dropdown on the node
            card. The graph runner uses them during BFS to validate type compatibility between
            connected ports — a mismatch raises a <code>Type mismatch</code> error before any
            block executes. Omit the key entirely to rely on the block{"'"}s static declaration.
          </JsonTagCard>

          <JsonTagCard id="json-blocktype" icon="🏷️" code="data.blockType" title="The block's identity" variant="blocktype">
            This string is the single most important coupling point between frontend and backend.
            It must exactly match: (1) the <code>type</code> field in the block definition JS file,
            (2) the key in <code>registry.js</code>, (3) the <code>case</code> label in the frontend{' '}
            <code>graph-runner.js</code> <code>runNode()</code> switch, and (4) the{' '}
            <code>case</code> label in the backend <code>graph-runner.ts</code>{' '}
            <code>runNode()</code> switch. If any of these four don{"'"}t match, the block silently
            fails or falls through to pass-through behavior.
          </JsonTagCard>

          <JsonTagCard id="json-position" icon="📐" code="position" title="Canvas layout coordinates" variant="position">
            Stores <code>{"{ x, y }"}</code> pixel coordinates for ReactFlow rendering. These are
            purely visual — execution order is determined entirely by edges, not spatial position.
            Two nodes at the same Y coordinate don{"'"}t run {"\u201c"}at the same time{"\u201d"}{' '}
            unless they share the same set of resolved upstream dependencies.
          </JsonTagCard>

          <JsonTagCard id="json-templates" icon="🔀" code="{{field}} / <node_id.field>" title="Template expressions — Runtime interpolation" variant="template">
            Two syntaxes resolve upstream data at runtime:{' '}
            <code>{"{{field}}"}</code> — Mustache-style, injects a top-level key from the
            upstream node{"'"}s output object directly into a prompt or value string (e.g.{' '}
            <code>{"{{title}}"}</code>, <code>{"{{text}}"}</code>).{' '}
            <code>{"<nodeId.field>"}</code> — angle-bracket reference to a specific node{"'"}s
            output field (e.g. <code>{"<n_agent.summary>"}</code>). Use this form when you need
            to reference a node that is not the immediate upstream. At execution time the graph
            runner resolves both forms from the <code>outputs</code> map and replaces them before
            calling the block handler. Unresolved references are left as-is and typically cause
            an LLM refusal — check the Debug panel{"'"}s <code>meta.userPrompt</code> to confirm
            interpolation succeeded.
          </JsonTagCard>
        </div>

        <div className="wiki-divider" />

        {/* ═══ Block Reference ═══ */}
        <div className="wiki-section" id="part2">
          <h2>Block Reference</h2>
          <p>
            Every built-in block with its fields, inputs, outputs, execution notes, and a canvas card preview.
            There are currently <strong>{blocks.length}</strong> blocks across three categories:
            <span className="wiki-cat core">blocks</span>
            <span className="wiki-cat tool">tools</span>
            <span className="wiki-cat trigger">triggers</span>
          </p>

          {CATEGORY_ORDER.map((cat) => {
            const catBlocks = groupedBlocks[cat]
            if (!catBlocks || catBlocks.length === 0) return null
            const catClass = cat === 'tools' ? 'tool' : cat === 'triggers' ? 'trigger' : 'core'

            const renderBlock = (b) => {
              const inputEntries = b.inputs ? Object.entries(b.inputs) : []
              const outputEntries = b.outputs ? Object.entries(b.outputs) : []
              return (
                <div key={b.type} id={`b-${b.type}`} className="wiki-block-anchor" style={{ marginTop: 32 }}>
                  <h3>
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: b.bgColor, verticalAlign: 'middle', marginRight: 8 }} />
                    {b.name}
                    <code style={{ marginLeft: 8, fontSize: '.8rem' }}>{b.type}</code>
                    <span className={`wiki-cat ${catClass}`}>{b.category}</span>
                  </h3>
                  <p>{b.longDescription || b.description}</p>

                  <BlockCard block={b} />

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
            }

            // All categories use sub-groups from CATEGORY_CONFIG
            const { topItems, groups } = categorySubGroups[cat]
            return (
              <Collapsible key={cat} title={`${CATEGORY_LABELS[cat]} (${catBlocks.length})`} className="wiki-block-group" defaultOpen={false}>
                {topItems.map(renderBlock)}
                {groups.map((sg) => (
                  <Collapsible key={sg.id} title={`${sg.label} (${sg.items.length})`} className="wiki-block-subgroup" defaultOpen={false}>
                    {sg.items.map(renderBlock)}
                  </Collapsible>
                ))}
              </Collapsible>
            )
          })}
        </div>

        <div className="wiki-divider" />

        {/* ═══ Demo Workflows ═══ */}
        <div className="wiki-section" id="part3">
          <h2>Demo Workflows</h2>

          {/* A. Seeded URL → Summary */}
          <h3 id="w-seed">A. Seeded · URL → Summary</h3>
          <p><strong>Goal:</strong> Paste URL → skill fetches page → LLM summarises 3–5 bullets.</p>
          <div className="wiki-steps">
            <Step num={1} title="Start">Starter block with <code>manual</code> mode.</Step>
            <Step num={2} title="URL input">User input block — kind: <code>url</code>, default: <code>https://www.salilvnair.com/docs/v2/architecture</code>.</Step>
            <Step num={3} title="URL Extractor agent">Agent with <code>sk_url_extract</code> skill. Model: <code>gpt-4.1</code>. Response format: <code>{'{ url, title, text }'}</code>.</Step>
            <Step num={4} title="Summarizer agent">Second agent, model: <code>gpt-4.1</code>. Response format: <code>{'{ summary, bullets[] }'}</code>.</Step>
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
            <Step num={3} title="Summarizer">Agent: <code>gpt-5-mini</code>, prompt: <code>{'Body:\\n{{body}}'}</code>, strict output.</Step>
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
            <Step num={2} title="Classifier agent">gpt-5-mini with <code>{'{ category: enum[billing,tech,sales] }'}</code> strict output.</Step>
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

        {/* ═══ Appendix ═══ */}
        <div className="wiki-section" id="part4">
          <h2>Appendix</h2>

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
