/**
 * Skill Editor — full-width editor with an IntelliJ-style interactive debugger.
 *
 * Normal mode:  Name / Language / Source editor + Test Run panel.
 * Debug mode:   SkillDebugger overlay with:
 *   • Gutter code view — click a line number to set/clear a red breakpoint dot
 *   • Toolbar: ▶ Start | ▶ Resume | ⏭ Step Over | ⏹ Stop + live status badge
 *   • Variables pane (right): tree-expandable locals captured at each pause
 *   • Bottom strip: Params JSON editor (left) + Console output (right)
 *
 * Execution model:
 *   instrumentSource() injects `await __bp(line, captureFn)` before every
 *   non-blank line. The async __bp runtime function pauses only on lines
 *   that have a breakpoint OR when step-mode is active. Execution suspends
 *   via an unresolved Promise; Resume/Step Over resolve it.
 *   The instrumented source runs inside an async IIFE so top-level
 *   `await __bp(…)` is syntactically valid outside the skill's inner function.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { Highlight, themes } from 'prism-react-renderer'
import { useWorkspaceStore } from '../stores/workspace-store'
import { SkillsIcon, VariableIcon, SettingsIcon, PanelRightIcon, XIcon, CodeIcon } from '../components/icons'
import CodeEditor from '../components/CodeEditor'
import StyledSelect from '../components/StyledSelect'
import { runSkillSource, makeSkillFetch } from '../run/graph-runner'
import { instrumentSource, serializeVar, fmtConsoleArg } from '../run/skill-debugger'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PARAMS = '{\n  "url": "https://example.com",\n  "input": "test"\n}'
const STOP_SIGNAL = '__bs_debug_stopped__'

// ─── Variable tree viewer ─────────────────────────────────────────────────────

function VarEntry({ name, value, depth = 0 }) {
  const isObj = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(depth < 1 && isObj)

  if (!isObj) {
    return (
      <div className="bs-dbg-var-row" style={{ paddingLeft: depth * 14 }}>
        <span className="bs-dbg-var-name">{name}</span>
        <span className="bs-dbg-var-eq"> = </span>
        <span className={`bs-dbg-var-prim bs-dbg-var-prim--${typeof value}`}>
          {value === null ? 'null' : value === undefined ? 'undefined' : String(value)}
        </span>
      </div>
    )
  }

  const keys = Object.keys(value)
  const preview = Array.isArray(value)
    ? `Array[${value.length}]`
    : `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`

  return (
    <div className="bs-dbg-var-node" style={{ paddingLeft: depth * 14 }}>
      <div
        className="bs-dbg-var-row bs-dbg-var-row--obj"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bs-dbg-var-toggle">{open ? '▾' : '▸'}</span>
        <span className="bs-dbg-var-name">{name}</span>
        <span className="bs-dbg-var-eq"> = </span>
        <span className="bs-dbg-var-preview">{preview}</span>
      </div>
      {open && keys.map((k) => (
        <VarEntry key={k} name={k} value={value[k]} depth={depth + 1} />
      ))}
    </div>
  )
}

function VarsPanel({ variables }) {
  const entries = Object.entries(variables)
  if (!entries.length) {
    return (
      <div className="bs-dbg-vars-empty">
        No variables captured yet.<br />Run to a breakpoint to inspect locals.
      </div>
    )
  }
  return (
    <div className="bs-dbg-vars">
      {entries.map(([k, v]) => <VarEntry key={k} name={k} value={v} />)}
    </div>
  )
}

// ─── IntelliJ-style hover value tooltip ───────────────────────────────────────

function VarTooltip({ varName, value, x, y }) {
  let display
  if (value === null) display = 'null'
  else if (value === undefined) display = 'undefined'
  else if (typeof value === 'string') display = `"${value}"`
  else if (typeof value === 'object') {
    try {
      display = JSON.stringify(value, null, 2)
      if (display.length > 600) display = display.slice(0, 600) + '\n  …'
    } catch { display = '[object]' }
  } else {
    display = String(value)
  }

  // Keep tooltip in-viewport horizontally
  const width = Math.min(display.split('\n').reduce((m, l) => Math.max(m, l.length), 10) * 7.5 + 24, 420)

  return (
    <div
      className="bs-dbg-hover-tooltip"
      style={{ position: 'fixed', left: Math.min(x, window.innerWidth - width - 8), top: y, width }}
    >
      <div className="bs-dbg-hover-varname">{varName}</div>
      <pre className="bs-dbg-hover-value">{display}</pre>
    </div>
  )
}

// ─── Code view with Prism syntax highlighting + breakpoint gutter ─────────────

function DebugCodeView({ source, breakpoints, currentLine, onToggleBreakpoint, variables }) {
  const curRef = useRef(null)
  const [tooltip, setTooltip] = useState(null) // { varName, value, x, y }

  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentLine])

  const showTooltip = useCallback((e, content) => {
    const name = content.trim()
    if (!name || !variables || !(name in variables)) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ varName: name, value: variables[name], x: rect.left, y: rect.bottom + 6 })
  }, [variables])

  const hideTooltip = useCallback(() => setTooltip(null), [])

  return (
    <>
      <Highlight code={source || ' '} language="javascript" theme={themes.vsDark}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <div className="bs-dbg-code-view">
            {tokens.map((line, idx) => {
              const lineNo = idx + 1
              const isBP = breakpoints.has(lineNo)
              const isCur = currentLine === lineNo
              // eslint-disable-next-line no-unused-vars
              const { key: _lk, ...lineProps } = getLineProps({ line })
              return (
                <div
                  key={lineNo}
                  {...lineProps}
                  className={`bs-dbg-code-row${isCur ? ' is-current' : ''}`}
                  style={{ ...lineProps.style, background: 'transparent' }}
                  ref={isCur ? curRef : null}
                >
                  <div
                    className="bs-dbg-gutter"
                    title={isBP ? 'Click to remove breakpoint' : 'Click to add breakpoint'}
                    onClick={() => onToggleBreakpoint(lineNo)}
                  >
                    <span className="bs-dbg-lineno">{lineNo}</span>
                    <span className="bs-dbg-gutter-icon">
                      {isCur && isBP
                        ? <span className="bs-dbg-arrow bs-dbg-arrow--bp">▶</span>
                        : isCur
                          ? <span className="bs-dbg-arrow">▶</span>
                          : isBP
                            ? <span className="bs-dbg-bp-dot" />
                            : null}
                    </span>
                  </div>
                  <pre className="bs-dbg-code-text" style={{ background: 'transparent' }}>
                    {line.map((token, tokenIdx) => {
                      // eslint-disable-next-line no-unused-vars
                      const { key: _tk, ...tokenProps } = getTokenProps({ token })
                      const name = token.content.trim()
                      const isVar = !!(name && variables && name in variables)
                      return (
                        <span
                          key={tokenIdx}
                          {...tokenProps}
                          className={isVar ? 'bs-dbg-token-var' : undefined}
                          onMouseEnter={isVar ? (e) => showTooltip(e, token.content) : undefined}
                          onMouseLeave={isVar ? hideTooltip : undefined}
                        />
                      )
                    })}
                  </pre>
                </div>
              )
            })}
          </div>
        )}
      </Highlight>
      {tooltip && <VarTooltip {...tooltip} />}
    </>
  )
}

// ─── Output value — colorized JSON or plain text ─────────────────────────────

function OutputValue({ value }) {
  const isStr = typeof value === 'string'
  const raw = isStr ? value : JSON.stringify(value, null, 2)
  const isJson = !isStr

  if (isStr) {
    return <pre className="bs-dbg-result-pre bs-dbg-result-pre--text">{raw}</pre>
  }

  return (
    <Highlight theme={themes.vsDark} code={raw} language="json">
      {({ style, tokens, getLineProps, getTokenProps }) => (
        <pre className="bs-dbg-result-pre bs-dbg-result-pre--json" style={{ ...style, background: 'rgba(0,0,0,.35)', margin: 0 }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, k) => (
                <span key={k} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

// ─── Right panel — SideNav-style resizable + collapsible ─────────────────────

const RIGHT_PANEL_MIN_W = 220  // shows all 4 tabs in one row
const RIGHT_PANEL_MAX_W = 520
const RIGHT_PANEL_DEFAULT_W = 280

// Small inline SVG icons for the collapsed rail
function VarsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
    </svg>
  )
}
function ParamsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
function ConsoleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  )
}
function OutputIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  )
}

const RPANEL_TABS = [
  { id: 'variables', label: 'Variables', Icon: VarsIcon },
  { id: 'params',    label: 'Params',    Icon: ParamsIcon },
  { id: 'console',   label: 'Console',   Icon: ConsoleIcon },
  { id: 'output',    label: 'Output',    Icon: OutputIcon },
]

function DebugRightPanel({ rightTab, setRightTab, variables, logs, output, error, state, paramsText, setParamsText }) {
  const [open, setOpen] = useState(true)
  const [width, setWidth] = useState(RIGHT_PANEL_DEFAULT_W)
  const [dragging, setDragging] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startW: RIGHT_PANEL_DEFAULT_W, moved: false })

  const onSplitterPointerDown = useCallback((e) => {
    dragRef.current = { active: true, startX: e.clientX, startW: width, moved: false }
    setDragging(true)
    e.preventDefault()
  }, [width])

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.active) return
      const dx = dragRef.current.startX - e.clientX // dragging left = expand
      if (Math.abs(dx) > 3) dragRef.current.moved = true
      const next = Math.min(RIGHT_PANEL_MAX_W, Math.max(RIGHT_PANEL_MIN_W, dragRef.current.startW + dx))
      setWidth(next)
      setOpen(true)
    }
    function onUp() {
      if (dragRef.current.active && !dragRef.current.moved) {
        setOpen((o) => !o)
      }
      dragRef.current.active = false
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const hasOutputDot = !!error || (output !== null && !error && !state.running)
  const outputDotColor = error ? 'err' : 'ok'

  return (
    <div
      className={`bs-dbg-rpanel${open ? ' is-open' : ' is-closed'}${dragging ? ' is-dragging' : ''}`}
      style={{ '--bs-dbg-rpanel-w': `${open ? width : 0}px` }}
    >
      {/* Left splitter bar — drag to resize, click to toggle */}
      <div
        className="bs-dbg-rpanel-splitter"
        onPointerDown={onSplitterPointerDown}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      >
        <div className="bs-splitter-grip" />
        {showTip && !dragging && (
          <div className="bs-dbg-rpanel-tip">
            <div>Click to {open ? 'collapse' : 'expand'}</div>
            <div>Drag to resize</div>
          </div>
        )}
      </div>

      {/* Collapsed rail — icon buttons, same style as SideNav rail */}
      <nav className="bs-dbg-rpanel-rail">
        {RPANEL_TABS.map(({ id, label, Icon }) => {
          const isCurrent = open && rightTab === id
          const badge = id === 'console' && logs.length > 0
            ? <span className="bs-dbg-rail-badge">{logs.length > 9 ? '9+' : logs.length}</span>
            : id === 'output' && hasOutputDot
              ? <span className={`bs-dbg-rail-dot bs-dbg-rail-dot--${outputDotColor}`} />
              : null
          return (
            <button
              key={id}
              className={`bs-dbg-rail-btn${isCurrent ? ' is-active' : ''}`}
              title={label}
              onClick={() => { setRightTab(id); setOpen(true) }}
            >
              <Icon className="bs-dbg-rail-ico" />
              {badge}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button
          className="bs-dbg-rail-btn"
          title={open ? 'Collapse panel' : 'Expand panel'}
          onClick={() => setOpen((o) => !o)}
        >
          <PanelRightIcon className="bs-dbg-rail-ico" />
        </button>
      </nav>

      {/* Panel body — only rendered when open */}
      <section className="bs-dbg-rpanel-body">
        {/* Tab bar with labels */}
        <div className="bs-dbg-rpanel-tabs">
          {RPANEL_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={[
                'bs-dbg-rpanel-tab',
                rightTab === id ? 'is-active' : '',
                id === 'output' && error ? 'is-err' : '',
                id === 'output' && !error && output !== null && !state.running ? 'is-ok' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setRightTab(id)}
              title={label}
            >
              <Icon className="bs-dbg-rpanel-tab-ico" />
              <span className="bs-dbg-rpanel-tab-lbl">{label}</span>
              {id === 'console' && logs.length > 0 && (
                <span className="bs-dbg-tab-count">{logs.length}</span>
              )}
              {id === 'output' && error && <span className="bs-dbg-tab-dot bs-dbg-tab-dot--err" />}
              {id === 'output' && !error && output !== null && !state.running && (
                <span className="bs-dbg-tab-dot bs-dbg-tab-dot--ok" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bs-dbg-rpanel-content">
          {rightTab === 'variables' && <VarsPanel variables={variables} />}

          {rightTab === 'params' && (
            <div className="bs-dbg-params-wrap">
              <div className="bs-dbg-pane-hint">JSON passed as <code>params</code> to your skill. Edit before starting.</div>
              <CodeEditor
                language="json"
                value={paramsText}
                onChange={setParamsText}
                readOnly={state.running || state.paused}
                minHeight="120px"
                maxHeight="100%"
              />
            </div>
          )}

          {rightTab === 'console' && (
            <div className="bs-dbg-console">
              {logs.length === 0
                ? <div className="bs-dbg-console-empty">console.log / warn / error output will appear here.</div>
                : logs.map((l, i) => (
                  <div key={i} className={`bs-dbg-log-row bs-dbg-log-row--${l.level}`}>
                    <span className="bs-dbg-log-level">[{l.level}]</span>
                    <span className="bs-dbg-log-msg"> {l.msg}</span>
                  </div>
                ))
              }
            </div>
          )}

          {rightTab === 'output' && (
            <div className="bs-dbg-output-wrap">
              {!output && !error && !state.running && (
                <div className="bs-dbg-console-empty">Run the skill to see output here.</div>
              )}
              {state.running && !state.paused && (
                <div className="bs-dbg-console-empty bs-dbg-console-empty--run">Running…</div>
              )}
              {error && (
                <>
                  <div className="bs-dbg-pane-hint bs-dbg-pane-hint--err">✕ Runtime error</div>
                  <pre className="bs-dbg-result-pre bs-dbg-result-pre--err">{error}</pre>
                </>
              )}
              {output !== null && !error && (
                <>
                  <div className="bs-dbg-pane-hint bs-dbg-pane-hint--ok">✓ Completed successfully</div>
                  <OutputValue value={output} />
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function DebugToolbar({ state, onStart, onResume, onStepOver, onStop, onClose }) {
  const { running, paused, currentLine, error, output } = state

  const statusBadge = () => {
    if (error)
      return <span className="bs-dbg-badge bs-dbg-badge--err">✕ Error</span>
    if (output !== null && !running && !paused)
      return <span className="bs-dbg-badge bs-dbg-badge--ok">✓ Done</span>
    if (paused && currentLine)
      return <span className="bs-dbg-badge bs-dbg-badge--pause">⏸ Line {currentLine}</span>
    if (running)
      return <span className="bs-dbg-badge bs-dbg-badge--run">▶ Running</span>
    return <span className="bs-dbg-badge">Ready</span>
  }

  return (
    <div className="bs-dbg-toolbar">
      <span className="bs-dbg-toolbar-title">🐛 Debugger</span>

      <div className="bs-dbg-toolbar-actions">
        {!running && !paused && (
          <button className="bs-dbg-btn bs-dbg-btn--start" onClick={onStart} title="Start debug session">
            ▶ Start
          </button>
        )}
        {paused && (
          <button className="bs-dbg-btn bs-dbg-btn--resume" onClick={onResume} title="Resume to next breakpoint">
            ▶ Resume
          </button>
        )}
        {paused && (
          <button className="bs-dbg-btn bs-dbg-btn--step" onClick={onStepOver} title="Step Over — advance one statement">
            ⤵ Step
          </button>
        )}
        {(running || paused) && (
          <button className="bs-dbg-btn bs-dbg-btn--stop" onClick={onStop} title="Stop execution">
            ⏹ Stop
          </button>
        )}
      </div>

      <div className="bs-dbg-toolbar-status">{statusBadge()}</div>

      <button className="bs-dbg-btn bs-dbg-btn--close" onClick={onClose} title="Close debugger">
        ✕ Close
      </button>
    </div>
  )
}

// ─── Main interactive debugger ────────────────────────────────────────────────

function SkillDebugger({ skill, breakpoints, setBreakpoints, onClose }) {
  const [state, setState] = useState({
    running: false,
    paused: false,
    currentLine: null,
    variables: {},
    logs: [],
    error: null,
    output: null,
  })
  const [paramsText, setParamsText] = useState(DEFAULT_PARAMS)
  // Right pane tabs: variables | params | console | output
  const [rightTab, setRightTab] = useState('params')

  const resolverRef = useRef(null)
  const stoppedRef = useRef(false)
  const stepModeRef = useRef(false)
  const breakpointsRef = useRef(breakpoints)

  useEffect(() => { breakpointsRef.current = breakpoints }, [breakpoints])

  const toggleBreakpoint = useCallback((lineNo) => {
    setBreakpoints((prev) => {
      const next = new Set(prev)
      if (next.has(lineNo)) next.delete(lineNo)
      else next.add(lineNo)
      return next
    })
  }, [setBreakpoints])

  const resume = useCallback(() => {
    stepModeRef.current = false
    const r = resolverRef.current
    resolverRef.current = null
    r?.()
  }, [])

  const stepOver = useCallback(() => {
    stepModeRef.current = true
    const r = resolverRef.current
    resolverRef.current = null
    r?.()
  }, [])

  const stop = useCallback(() => {
    stoppedRef.current = true
    stepModeRef.current = false
    const r = resolverRef.current
    resolverRef.current = null
    r?.()
    // Clear the current-line arrow immediately so the yellow ▶ disappears
    setState((s) => ({ ...s, running: false, paused: false, currentLine: null }))
  }, [])

  const startDebug = useCallback(async () => {
    if (!skill?.source) return

    stoppedRef.current = false
    stepModeRef.current = false
    resolverRef.current = null
    const logs = []

    setState({ running: true, paused: false, currentLine: null, variables: {}, logs: [], error: null, output: null })

    // Instrument and wrap in async IIFE so top-level await is valid
    const instrumented = instrumentSource(skill.source)
    const wrapped = `return (async function __bs_debug__() {\n${instrumented}\n})()`

    const bpFn = async (lineNo, captureFn) => {
      if (stoppedRef.current) throw new Error(STOP_SIGNAL)

      const isBreakpoint = breakpointsRef.current.has(lineNo)
      const isStepping = stepModeRef.current
      if (!isBreakpoint && !isStepping) return

      stepModeRef.current = false

      const raw = captureFn ? captureFn() : {}
      const vars = {}
      for (const [k, v] of Object.entries(raw)) vars[k] = serializeVar(v)

      setState((s) => ({ ...s, paused: true, currentLine: lineNo, variables: vars }))

      await new Promise((resolve) => { resolverRef.current = resolve })

      if (stoppedRef.current) throw new Error(STOP_SIGNAL)
      setState((s) => ({ ...s, paused: false }))
    }

    const makeLog = (level) => (...args) => {
      const entry = { level, msg: args.map(fmtConsoleArg).join(' '), t: Date.now() }
      logs.push(entry)
      setState((s) => ({ ...s, logs: [...logs] }))
    }
    const captureConsole = {
      log: makeLog('log'), info: makeLog('info'),
      warn: makeLog('warn'), error: makeLog('error'),
    }

    let params = { input: '' }
    try {
      const parsed = JSON.parse(paramsText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        params = { input: JSON.stringify(parsed), ...parsed }
      }
    } catch { params = { input: paramsText } }

    const skillFetch = makeSkillFetch()
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('params', '__bp', 'fetch', 'console', wrapped)
      const output = await fn(params, bpFn, skillFetch, captureConsole)
      setState((s) => ({ ...s, running: false, paused: false, output }))
    } catch (e) {
      if (e.message === STOP_SIGNAL) {
        setState((s) => ({ ...s, running: false, paused: false }))
      } else {
        setState((s) => ({ ...s, running: false, paused: false, error: e.message || String(e) }))
      }
    }
  }, [skill, paramsText])

  const { logs, variables, output, error } = state

  // Auto-switch to console when logs arrive, to output when done
  useEffect(() => {
    if (logs.length > 0 && rightTab === 'variables') setRightTab('console')
  }, [logs.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ((output !== null || error) && !state.running && !state.paused) setRightTab('output')
  }, [output, error, state.running, state.paused]) // eslint-disable-line react-hooks/exhaustive-deps
  // Switch to variables panel when we hit a breakpoint
  useEffect(() => {
    if (state.paused) setRightTab('variables')
  }, [state.paused])

  return (
    <div className="bs-debugger">
      <DebugToolbar
        state={state}
        onStart={startDebug}
        onResume={resume}
        onStepOver={stepOver}
        onStop={stop}
        onClose={onClose}
      />

      <div className="bs-debugger-main">
        {/* Code pane with breakpoint gutter */}
        <div className="bs-debugger-code-pane">
          <DebugCodeView
            source={skill.source || ''}
            breakpoints={breakpoints}
            currentLine={state.currentLine}
            onToggleBreakpoint={toggleBreakpoint}
            variables={state.variables}
          />
        </div>

        {/* Right panel — SideNav-style: collapsible rail + resizable panel + splitter */}
        <DebugRightPanel
          rightTab={rightTab}
          setRightTab={setRightTab}
          variables={variables}
          logs={logs}
          output={output}
          error={error}
          state={state}
          paramsText={paramsText}
          setParamsText={setParamsText}
        />
      </div>
    </div>
  )
}

// ─── Quick test-run strip (normal mode, no breakpoints) ───────────────────────

function SkillTestPanel({ skill, onDebug }) {
  const [paramsText, setParamsText] = useState(DEFAULT_PARAMS)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [open, setOpen] = useState(false)
  const logsRef = useRef([])

  const handleRun = useCallback(async () => {
    if (!skill?.source) return
    logsRef.current = []
    setRunning(true)
    setResult(null)

    const captureConsole = {
      log:   (...a) => logsRef.current.push({ level: 'log',   msg: a.map(fmtConsoleArg).join(' ') }),
      warn:  (...a) => logsRef.current.push({ level: 'warn',  msg: a.map(fmtConsoleArg).join(' ') }),
      error: (...a) => logsRef.current.push({ level: 'error', msg: a.map(fmtConsoleArg).join(' ') }),
      info:  (...a) => logsRef.current.push({ level: 'info',  msg: a.map(fmtConsoleArg).join(' ') }),
    }

    // Pass the raw JSON string — runSkillSource will parse + spread all keys
    // so params.url, params.query etc are available directly in skill code.
    const t0 = performance.now()
    try {
      const output = await runSkillSource(skill, paramsText, { debugLog: captureConsole })
      setResult({ output, logs: [...logsRef.current], error: null, ms: Math.round(performance.now() - t0) })
    } catch (e) {
      setResult({ output: null, logs: [...logsRef.current], error: e.message || String(e), ms: Math.round(performance.now() - t0) })
    } finally {
      setRunning(false)
    }
  }, [skill, paramsText])

  return (
    <section className="bs-editor-section bs-skill-debug">
      <div className="bs-skill-debug-header" onClick={() => setOpen((v) => !v)}>
        <span className="bs-skill-debug-toggle">{open ? '▾' : '▸'}</span>
        <span className="bs-label" style={{ cursor: 'pointer', userSelect: 'none' }}>Test Run</span>
        {result && !result.error && (
          <span className="bs-skill-debug-badge bs-skill-debug-badge--ok">{result.ms} ms</span>
        )}
        {result?.error && (
          <span className="bs-skill-debug-badge bs-skill-debug-badge--err">Error</span>
        )}
        <button
          className="bs-skill-debug-open-btn"
          title="Open interactive debugger (set breakpoints, step through code)"
          onClick={(e) => { e.stopPropagation(); onDebug() }}
        >
          🐛 Debug
        </button>
      </div>

      {open && (
        <div className="bs-skill-debug-body">
          <label className="bs-label" style={{ marginBottom: 4 }}>Params (JSON)</label>
          <CodeEditor
            language="json"
            value={paramsText}
            onChange={setParamsText}
            minHeight="72px"
            maxHeight="160px"
          />
          <button
            className="bs-btn bs-btn-primary bs-skill-debug-run-btn"
            disabled={running}
            onClick={handleRun}
          >
            {running ? '⏳ Running…' : '▶ Run'}
          </button>

          {result && (
            <div className="bs-skill-debug-output">
              {result.logs.length > 0 && (
                <div className="bs-skill-debug-logs">
                  <div className="bs-skill-debug-section-label">Console</div>
                  {result.logs.map((l, i) => (
                    <div key={i} className={`bs-skill-debug-log bs-skill-debug-log--${l.level}`}>
                      <span className="bs-skill-debug-log-level">[{l.level}]</span> {l.msg}
                    </div>
                  ))}
                </div>
              )}
              {result.error ? (
                <div className="bs-skill-debug-error">
                  <div className="bs-skill-debug-section-label">Error</div>
                  <pre className="bs-skill-debug-pre bs-skill-debug-pre--err">{result.error}</pre>
                </div>
              ) : (
                <div className="bs-skill-debug-result">
                  <div className="bs-skill-debug-section-label">
                    Output <span className="bs-skill-debug-badge bs-skill-debug-badge--ok">{result.ms} ms</span>
                  </div>
                  <pre className="bs-skill-debug-pre">
                    {result.output == null ? 'null'
                      : typeof result.output === 'string' ? result.output
                      : JSON.stringify(result.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Skill Editor (top-level export) ─────────────────────────────────────────

export default function SkillEditor({ skillId }) {
  const skill = useWorkspaceStore((s) => s.skills.find((k) => k.id === skillId))
  const updateSkill = useWorkspaceStore((s) => s.updateSkill)

  // Breakpoints survive the editor lifetime (reset when tab is closed)
  const [breakpoints, setBreakpoints] = useState(new Set())
  const [debugMode, setDebugMode] = useState(false)

  if (!skill) return <div className="bs-editor-empty">Skill not found.</div>

  if (debugMode) {
    return (
      <SkillDebugger
        skill={skill}
        breakpoints={breakpoints}
        setBreakpoints={setBreakpoints}
        onClose={() => setDebugMode(false)}
      />
    )
  }

  return (
    <div className="bs-editor">
      <header className="bs-editor-head">
        <SkillsIcon className="bs-editor-ico" />
        <div className="bs-editor-heading">
          <div className="bs-editor-title">{skill.name}</div>
          <div className="bs-editor-sub">{skill.language} skill</div>
        </div>
        {breakpoints.size > 0 && (
          <span className="bs-skill-bp-count" title={`${breakpoints.size} breakpoint${breakpoints.size > 1 ? 's' : ''} set`}>
            🔴 {breakpoints.size} BP
          </span>
        )}
      </header>

      <section className="bs-editor-section">
        <label className="bs-label">Name</label>
        <input
          className="bs-input"
          value={skill.name}
          onChange={(e) => updateSkill(skill.id, { name: e.target.value })}
        />
      </section>

      <section className="bs-editor-section">
        <label className="bs-label">Language</label>
        <StyledSelect
          value={skill.language || 'javascript'}
          options={[
            { id: 'javascript', label: 'JavaScript' },
            { id: 'python', label: 'Python' },
            { id: 'jsonpath', label: 'JSONPath' },
          ]}
          onChange={(v) => updateSkill(skill.id, { language: v })}
        />
      </section>

      <section className="bs-editor-section bs-editor-section-grow">
        <label className="bs-label">Source</label>
        <CodeEditor
          language={skill.language || 'javascript'}
          value={skill.source || ''}
          onChange={(v) => updateSkill(skill.id, { source: v })}
          placeholder="// your skill implementation"
          minHeight="320px"
          maxHeight="60vh"
        />
      </section>

      <SkillTestPanel skill={skill} onDebug={() => setDebugMode(true)} />
    </div>
  )
}
