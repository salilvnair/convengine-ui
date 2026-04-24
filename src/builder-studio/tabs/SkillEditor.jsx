/**
 * Skill editor tab. Same shape as the inline skill editor in the SideNav,
 * but at full canvas width with better whitespace and a monospace source
 * editor for the skill body.
 */
import { useState, useRef, useCallback } from 'react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { SkillsIcon } from '../components/icons'
import CodeEditor from '../components/CodeEditor'
import StyledSelect from '../components/StyledSelect'
import { runSkillSource } from '../run/graph-runner'

// ─── Skill test-run / debug panel ────────────────────────────────────────────

const DEFAULT_PARAMS = '{\n  "url": "https://example.com",\n  "input": "test"\n}'

function SkillDebugPanel({ skill }) {
  const [paramsText, setParamsText] = useState(DEFAULT_PARAMS)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)   // { output, logs, error, ms }
  const [open, setOpen] = useState(false)
  const logsRef = useRef([])

  const handleRun = useCallback(async () => {
    if (!skill?.source) return
    logsRef.current = []
    setRunning(true)
    setResult(null)

    // Build a console proxy that captures log lines
    const captureConsole = {
      log:   (...a) => logsRef.current.push({ level: 'log',   msg: a.map(String).join(' ') }),
      warn:  (...a) => logsRef.current.push({ level: 'warn',  msg: a.map(String).join(' ') }),
      error: (...a) => logsRef.current.push({ level: 'error', msg: a.map(String).join(' ') }),
      info:  (...a) => logsRef.current.push({ level: 'info',  msg: a.map(String).join(' ') }),
    }

    let inputStr = ''
    try {
      const parsed = JSON.parse(paramsText)
      inputStr = typeof parsed?.input === 'string' ? parsed.input
        : typeof parsed?.url   === 'string' ? parsed.url
        : JSON.stringify(parsed)
    } catch {
      inputStr = paramsText
    }

    const t0 = performance.now()
    try {
      const output = await runSkillSource(skill, inputStr, { debugLog: captureConsole })
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
            {running ? '⏳ Running…' : '▶ Run Skill'}
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
                  <div className="bs-skill-debug-section-label">Output <span className="bs-skill-debug-badge bs-skill-debug-badge--ok">{result.ms} ms</span></div>
                  <pre className="bs-skill-debug-pre">
                    {result.output == null ? 'null' : typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}
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

// ─── Main editor ─────────────────────────────────────────────────────────────

export default function SkillEditor({ skillId }) {
  const skill = useWorkspaceStore((s) => s.skills.find((k) => k.id === skillId))
  const updateSkill = useWorkspaceStore((s) => s.updateSkill)

  if (!skill) return <div className="bs-editor-empty">Skill not found.</div>

  return (
    <div className="bs-editor">
      <header className="bs-editor-head">
        <SkillsIcon className="bs-editor-ico" />
        <div className="bs-editor-heading">
          <div className="bs-editor-title">{skill.name}</div>
          <div className="bs-editor-sub">{skill.language} skill</div>
        </div>
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

      <SkillDebugPanel skill={skill} />
    </div>
  )
}
