import { useEffect, useRef, useState } from "react";
import {
  interpretSemantic,
  compileSemantic,
  executeSemanticSql,
  streamSemanticDebug,
} from "../api/convengine.api";

// Semantic debug page. Calls /api/v1/semantic directly (no conversation
// pipeline). "Run live" uses the SSE stream so you see each stage as it
// starts/finishes with a neon-lit progress strip instead of a blank spinner.
//
// Mode toggle:
//   - LLM  → SemanticInterpretService + SemanticLlmQueryService
//   - Java → SemanticDeterministicInterpretService + SemanticLlmQueryService
export default function SemanticQueryDebugPage() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("llm");
  const [execute, setExecute] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [events, setEvents] = useState([]); // [{stage, phase, detail, ms, at}]
  const subRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    return () => subRef.current?.close?.();
  }, []);

  // Auto-scroll to latest output when the result arrives. User asked for the
  // page to be responsive enough to actually reach the bottom.
  useEffect(() => {
    if (result && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  function resetForRun() {
    setError(null);
    setResult(null);
    setEvents([]);
    subRef.current?.close?.();
    subRef.current = null;
  }

  function handleRunLive() {
    if (!question.trim()) return;
    resetForRun();
    setLoading(true);
    subRef.current = streamSemanticDebug(
      { question: question.trim(), mode, execute },
      {
        onStage: (evt) => {
          setEvents((prev) => [...prev, { ...evt, at: Date.now() }]);
        },
        onDone: (payload) => {
          setResult(payload);
          setLoading(false);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        },
        onClose: () => setLoading(false),
      }
    );
  }

  async function handleInterpretOnly() {
    if (!question.trim()) return;
    resetForRun();
    setLoading(true);
    try {
      const interpret = await interpretSemantic({ question: question.trim(), mode });
      setResult({ mode, question: question.trim(), interpret });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCompileFromInterpret() {
    const canonicalIntent = result?.interpret?.canonicalIntent;
    if (!canonicalIntent) return;
    setLoading(true);
    setError(null);
    try {
      const compile = await compileSemantic({ question: result.question, canonicalIntent });
      setResult((prev) => ({ ...prev, compile }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteFromCompile() {
    const compiled = result?.compile?.compiledSql;
    if (!compiled?.sql) return;
    setLoading(true);
    setError(null);
    try {
      const execOut = await executeSemanticSql({ sql: compiled.sql, params: compiled.params });
      setResult((prev) => ({ ...prev, execute: execOut }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Derive per-stage status from the stream for the neon progress strip.
  const stageStatus = deriveStageStatus(events, execute, loading);
  const activeStage = stageStatus.find((s) => s.status === "running")?.key || null;

  return (
    <div className="sqd-scroll">
      <div className="sqd-page">
        <header className="sqd-header">
          <h1 className="sqd-title">Semantic Query Debug</h1>
          <p className="sqd-subtitle">
            Bypass the conversation pipeline. Run interpret → compile → execute
            directly against the semantic facade.
          </p>
        </header>

        <section className="sqd-card">
          <label className="sqd-label">Question</label>
          <textarea
            className="sqd-textarea"
            rows={3}
            placeholder="e.g. list all open service requests from last week"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <div className="sqd-controls">
            <fieldset className="sqd-fieldset">
              <legend className="sqd-legend">Interpret mode</legend>
              <label className="sqd-radio">
                <input
                  type="radio"
                  name="mode"
                  value="llm"
                  checked={mode === "llm"}
                  onChange={() => setMode("llm")}
                />
                LLM
              </label>
              <label className="sqd-radio">
                <input
                  type="radio"
                  name="mode"
                  value="java"
                  checked={mode === "java"}
                  onChange={() => setMode("java")}
                />
                Java (deterministic)
              </label>
            </fieldset>

            <label className="sqd-checkbox">
              <input
                type="checkbox"
                checked={execute}
                onChange={(e) => setExecute(e.target.checked)}
              />
              Execute compiled SQL
            </label>
          </div>

          <div className="sqd-button-row">
            <button
              type="button"
              className="sqd-btn sqd-btn-primary"
              onClick={handleRunLive}
              disabled={loading || !question.trim()}
              title="SSE stream with live stage events"
            >
              {loading ? "Running live…" : "Run live ✨"}
            </button>
            <button
              type="button"
              className="sqd-btn sqd-btn-ghost"
              onClick={handleInterpretOnly}
              disabled={loading || !question.trim()}
            >
              Interpret only
            </button>
            <button
              type="button"
              className="sqd-btn sqd-btn-ghost"
              onClick={handleCompileFromInterpret}
              disabled={loading || !result?.interpret?.canonicalIntent}
            >
              Compile from interpret
            </button>
            <button
              type="button"
              className="sqd-btn sqd-btn-ghost"
              onClick={handleExecuteFromCompile}
              disabled={loading || !result?.compile?.compiledSql?.sql}
            >
              Execute compiled SQL
            </button>
          </div>

          {error && <div className="sqd-error">Error: {error}</div>}
        </section>

        {(events.length > 0 || loading) && (
          <section className="sqd-card sqd-live">
            <div className="sqd-live-header">
              <span className="sqd-live-title">
                <span className={`sqd-pulse${loading ? " on" : ""}`} />
                Live pipeline
              </span>
              <span className="sqd-live-hint">
                {activeStage ? `running ${activeStage.toLowerCase()}…` : loading ? "connecting…" : "finished"}
              </span>
            </div>

            <div className="sqd-stage-strip">
              {stageStatus.map((s, i) => (
                <div key={s.key} className={`sqd-stage sqd-stage-${s.status}`}>
                  <div className="sqd-stage-index">{i + 1}</div>
                  <div className="sqd-stage-body">
                    <div className="sqd-stage-name">{s.label}</div>
                    <div className="sqd-stage-meta">
                      {s.method ? <code>{s.method}</code> : <span className="sqd-muted">pending</span>}
                    </div>
                    {s.ms != null && <div className="sqd-stage-ms">{s.ms} ms</div>}
                  </div>
                  {s.status === "running" && <div className="sqd-scan" />}
                </div>
              ))}
            </div>

            <ol className="sqd-event-log">
              {events.map((e, i) => (
                <li key={i} className={`sqd-event sqd-event-${e.phase}`}>
                  <span className="sqd-event-dot" />
                  <span className="sqd-event-stage">{e.stage}</span>
                  <span className="sqd-event-phase">{e.phase}</span>
                  {e.ms > 0 && <span className="sqd-event-ms">{e.ms} ms</span>}
                  <span className="sqd-event-detail">{formatDetail(e.detail)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {result && (
          <section className="sqd-results" ref={bottomRef}>
            <StagePanel
              title="1. Interpret"
              payload={result.interpret}
              error={result.interpretError}
              hint={`mode: ${result.mode || mode}`}
            />
            <StagePanel
              title="2. Compile"
              payload={result.compile}
              error={result.compileError}
              hint="LLM-driven SQL emission"
            />
            <StagePanel
              title="3. Execute"
              payload={result.execute}
              hint={execute ? "JDBC queryForList" : "Not executed (enable checkbox)"}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function StagePanel({ title, payload, error, hint }) {
  return (
    <div className="sqd-stage-card">
      <div className="sqd-stage-card-header">
        <span className="sqd-stage-card-title">{title}</span>
        {hint && <span className="sqd-stage-card-hint">{hint}</span>}
      </div>
      {error ? (
        <div className="sqd-error">{error}</div>
      ) : payload ? (
        <pre className="sqd-pre">{JSON.stringify(payload, null, 2)}</pre>
      ) : (
        <div className="sqd-empty">(no output)</div>
      )}
    </div>
  );
}

// --- helpers --------------------------------------------------------------

const STAGE_DEFS = [
  { key: "INTERPRET", label: "Interpret" },
  { key: "COMPILE", label: "Compile" },
  { key: "EXECUTE", label: "Execute" },
];

function deriveStageStatus(events, executeRequested, loading) {
  return STAGE_DEFS.map((def) => {
    const relevant = events.filter((e) => e.stage === def.key);
    const done = relevant.find((e) => e.phase === "done");
    const err = relevant.find((e) => e.phase === "error");
    const started = relevant.find((e) => e.phase === "start");
    let status = "pending";
    if (err) status = "error";
    else if (done) status = "done";
    else if (started) status = "running";
    else if (def.key === "EXECUTE" && !executeRequested) status = "skipped";
    return {
      key: def.key,
      label: def.label,
      status,
      method: started?.detail?.service || done?.detail?.service || null,
      ms: done?.ms ?? err?.ms ?? null,
    };
  });
}

function formatDetail(detail) {
  if (!detail || typeof detail !== "object") return "";
  const entries = Object.entries(detail);
  if (!entries.length) return "";
  return entries.map(([k, v]) => `${k}=${v == null ? "null" : typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
}
