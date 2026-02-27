import { useMemo, useState } from "react";

const STAGE_META = {
  USER_INPUT: { icon: "🗣️", color: "border-sky-500" },
  DIALOGUE_ACT_CLASSIFIED: { icon: "🗂️", color: "border-cyan-500" },
  INTERACTION_POLICY_DECIDED: { icon: "🧭", color: "border-indigo-500" },

  PENDING_ACTION_SKIPPED: { icon: "⏭️", color: "border-slate-500" },
  PENDING_ACTION_EXECUTED: { icon: "✅", color: "border-emerald-500" },
  PENDING_ACTION_REJECTED: { icon: "🚫", color: "border-rose-500" },
  PENDING_ACTION_FAILED: { icon: "❌", color: "border-red-600" },
  PENDING_ACTION_LIFECYCLE: { icon: "♻️", color: "border-cyan-500" },
  PROMPT_RENDERING: { icon: "✨📄", color: "border-rose-500" },
  DISAMBIGUATION_REQUIRED: { icon: "❓", color: "border-amber-500" },
  GUARDRAIL_ALLOW: { icon: "🛡️", color: "border-emerald-500" },
  GUARDRAIL_DENY: { icon: "🛑", color: "border-red-500" },

  STATE_GRAPH_VALID: { icon: "✅", color: "border-lime-600" },
  STATE_GRAPH_VIOLATION: { icon: "⚠️", color: "border-red-600" },

  TOOL_ORCHESTRATION_REQUEST: { icon: "🧰📥", color: "border-blue-500" },
  TOOL_ORCHESTRATION_RESULT: { icon: "🧰📤", color: "border-teal-500" },
  TOOL_ORCHESTRATION_ERROR: { icon: "🧰💥", color: "border-red-600" },

  MEMORY_UPDATED: { icon: "🧠", color: "border-violet-500" },
  INTENT_MISSING: { icon: "🫥", color: "border-rose-500" },
  STATE_MISSING: { icon: "🫥", color: "border-rose-500" },

  INTENT_RESOLVE_START: { icon: "🧭", color: "border-indigo-500" },
  INTENT_RESOLVE_SKIPPED_SCHEMA_COLLECTION: { icon: "⏭️", color: "border-slate-500" },
  INTENT_RESOLVE_SKIPPED_STICKY_INTENT: { icon: "📌", color: "border-slate-500" },
  INTENT_RESOLVE_SKIPPED_POLICY: { icon: "🧱", color: "border-slate-500" },
  INTENT_RESOLVE_NO_CHANGE: { icon: "➖", color: "border-slate-500" },

  INTENT_CLASSIFIER_COLLISION: { icon: "⚖️", color: "border-amber-500" },
  INTENT_CLASSIFICATION_MATCHED: { icon: "🎯", color: "border-indigo-600" },
  INTENT_CLASSIFIER_NO_MATCH: { icon: "🫥", color: "border-slate-400" },

  INTENT_AGENT_SKIPPED: { icon: "⏭️", color: "border-slate-500" },
  INTENT_AGENT_LLM_INPUT: { icon: "🤖📥", color: "border-indigo-400" },
  INTENT_AGENT_LLM_OUTPUT: { icon: "🤖📤", color: "border-violet-500" },
  INTENT_AGENT_REJECTED: { icon: "🙅", color: "border-rose-500" },
  INTENT_AGENT_SCORES: { icon: "📈", color: "border-indigo-500" },
  INTENT_AGENT_COLLISION: { icon: "⚖️", color: "border-amber-500" },
  INTENT_AGENT_CLARIFICATION_SUPPRESSED_SCHEMA_FLOW: { icon: "🧱", color: "border-zinc-500" },
  INTENT_AGENT_NEEDS_CLARIFICATION: { icon: "🤔", color: "border-amber-500" },
  INTENT_AGENT_ACCEPTED: { icon: "😄", color: "border-emerald-500" },

  INTENT_COLLISION_DETECTED: { icon: "🚧", color: "border-amber-600" },
  INTENT_COLLISION_RESOLVED: { icon: "🛤️", color: "border-lime-600" },

  SCHEMA_EXTRACTION_START: { icon: "🧬", color: "border-lime-500" },
  SCHEMA_EXTRACTION_LLM_INPUT: { icon: "🤖📥", color: "border-green-500" },
  SCHEMA_EXTRACTION_LLM_OUTPUT: { icon: "🤖📤", color: "border-emerald-500" },
  SCHEMA_STATUS: { icon: "📊", color: "border-teal-500" },

  RESOLVE_RESPONSE: { icon: "🧠", color: "border-emerald-500" },
  RESPONSE_MAPPING_NOT_FOUND: { icon: "🧩❌", color: "border-red-500" },
  RESOLVE_RESPONSE_SELECTED: { icon: "🧭", color: "border-emerald-500" },
  RESOLVE_RESPONSE_LLM_INPUT: { icon: "📥", color: "border-cyan-500" },
  RESOLVE_RESPONSE_LLM_OUTPUT: { icon: "📤", color: "border-teal-500" },
  RESPONSE_EXACT: { icon: "📝", color: "border-emerald-500" },
  ASSISTANT_OUTPUT: { icon: "🤖💬", color: "border-emerald-500" },

  AUTO_ADVANCE_SKIPPED_NO_SCHEMA: { icon: "⏭️", color: "border-slate-500" },
  AUTO_ADVANCE_FACTS: { icon: "🧾", color: "border-cyan-500" },
  POLICY_BLOCK: { icon: "🛑", color: "border-red-500" },

  MCP_SKIPPED_PENDING_CLARIFICATION: { icon: "⏭️", color: "border-slate-500" },
  MCP_NO_TOOLS_AVAILABLE: { icon: "🧰∅", color: "border-slate-500" },
  MCP_PLAN_LLM_INPUT: { icon: "🤖📥", color: "border-blue-500" },
  MCP_PLAN_LLM_OUTPUT: { icon: "🤖📤", color: "border-indigo-500" },
  MCP_TOOL_CALL: { icon: "🛠️", color: "border-orange-500" },
  MCP_TOOL_RESULT: { icon: "📦", color: "border-teal-500" },
  MCP_TOOL_ERROR: { icon: "⚠️", color: "border-red-500" },
  MCP_FINAL_ANSWER: { icon: "🎉", color: "border-green-600" },

  CONVERSATION_RESET: { icon: "🔄", color: "border-slate-500" },
  PIPELINE_TIMING: { icon: "⏱️", color: "border-slate-500" },
  ENGINE_RETURN: { icon: "🏆", color: "border-lime-600" },

  RULE_MATCHED: { icon: "✅", color: "border-purple-500" },
  RULE_APPLIED: { icon: "🛠️", color: "border-fuchsia-500" },
  RULE_NO_MATCH: { icon: "🫥", color: "border-slate-400" },

  STEP_ENTER: { icon: "🪜⬇️", color: "border-sky-500" },
  STEP_EXIT: { icon: "🪜⬆️", color: "border-emerald-500" },
  STEP_ERROR: { icon: "🪜🚫", color: "border-rose-600" },

  SET_INTENT: { icon: "🧭", color: "border-indigo-600" },
  SET_JSON: { icon: "🧩", color: "border-cyan-500" },
  SET_TASK: { icon: "⚙️", color: "border-fuchsia-600" },
  SET_STATE: { icon: "🔁", color: "border-yellow-500" },
  GET_CONTEXT: { icon: "🧾", color: "border-violet-500" },
  GET_SESSION: { icon: "📘", color: "border-indigo-500" },
  GET_SCHEMA_JSON: { icon: "🧬", color: "border-teal-500" },

  INTENT_CLASSIFIED: { icon: "🧩", color: "border-cyan-500" },
  INTENT_RESOLVED_BY_CLASSIFIER: { icon: "🧭", color: "border-indigo-600" },
  INTENT_RESOLVED_BY_AGENT: { icon: "🤖", color: "border-fuchsia-500" },
  GUARDRAIL_BLOCK: { icon: "🛑", color: "border-rose-500" },
  MCP_CONTEXT_CLEARED: { icon: "🧹", color: "border-slate-500" },
  CONTAINER_DATA_SKIPPED: { icon: "📦⏭️", color: "border-amber-500" },
  ENGINE_KNOWN_FAILURE: { icon: "🙈", color: "border-red-500" },
  ENGINE_UNKNOWN_FAILURE: { icon: "💀", color: "border-red-700" },
  CLIENT_ERROR: { icon: "🚨", color: "border-red-600" },
};

function stageLookupKey(stage) {
  if (!stage || typeof stage !== "string") return "";
  return stage.replace(/[•\u2022]+/g, "").trim().replace(/\s+\(.*\)$/, "");
}

function metaForStage(stage) {
  const key = stageLookupKey(stage);
  if (STAGE_META[key]) return STAGE_META[key];
  if (key.startsWith("INTENT_RESOLVED_BY_")) return { icon: "🧭", color: "border-indigo-600" };
  if (key.startsWith("INTENT_")) return { icon: "🧠", color: "border-indigo-500" };
  if (key.startsWith("RESPONSE_")) return { icon: "📝", color: "border-emerald-500" };
  if (key.startsWith("AUTO_ADVANCE_")) return { icon: "⚡", color: "border-cyan-500" };
  if (key.startsWith("RULE_MATCH")) return { icon: "✅", color: "border-cyan-500" };
  if (key.startsWith("CONTAINER_")) return { icon: "📦", color: "border-amber-500" };
  if (key.startsWith("MCP_")) return { icon: "🧰", color: "border-slate-500" };
  return { icon: "•", color: "border-slate-300" };
}

function parsePayload(payloadJson) {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

function stageDisplayName(auditRow) {
  const stage = auditRow?.stage ?? "";
  const normalized = stageLookupKey(stage);
  if (!normalized.startsWith("STEP_")) return stage;
  const payload = parsePayload(auditRow?.payloadJson ?? auditRow?.payload_json);
  const stepName = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.step : null;
  if (typeof stepName === "string" && stepName.trim()) return `${stage} - ${stepName.trim()}`;
  return stage;
}

function JsonNodeView({ label, value, depth = 0, defaultOpen = false }) {
  const leftPad = `${Math.max(0, depth) * 14}px`;

  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <div className="audit-json-line" style={{ paddingLeft: leftPad }}>
        {label ? <span className="text-slate-500">{label}: </span> : null}
        <span className="audit-json-value">{typeof value === "string" ? `"${value}"` : String(value)}</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <details open={defaultOpen} className="audit-json-details">
        <summary className="audit-json-summary" style={{ paddingLeft: leftPad }}>
          {label ? <span className="text-slate-500">{label}: </span> : null}
          <span>[{value.length}]</span>
        </summary>
        <div>{value.map((item, idx) => <JsonNodeView key={`${depth}-${idx}`} label={String(idx)} value={item} depth={depth + 1} />)}</div>
      </details>
    );
  }

  const entries = Object.entries(value);
  return (
    <details open={defaultOpen} className="audit-json-details">
      <summary className="audit-json-summary" style={{ paddingLeft: leftPad }}>
        {label ? <span className="text-slate-500">{label}: </span> : null}
        <span>{`{${entries.length}}`}</span>
      </summary>
      <div>{entries.map(([k, v]) => <JsonNodeView key={`${depth}-${k}`} label={k} value={v} depth={depth + 1} />)}</div>
    </details>
  );
}

export default function AuditTimeline({ audits = [], loading = false, error = "" }) {
  const [openIndex, setOpenIndex] = useState(null);

  const sorted = useMemo(() => {
    return [...audits].sort((a, b) => {
      const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [audits]);

  if (loading && !sorted.length) {
    return <div className="audit-panel-body audit-panel-message">Loading audit timeline...</div>;
  }
  if (error && !sorted.length) {
    return <div className="audit-panel-body audit-panel-message audit-panel-error">{error}</div>;
  }

  return (
    <div className="audit-panel-body">
      <div className="audit-scroll-hidden px-4 py-3 space-y-3 text-xs">
        {!sorted.length && <div className="text-slate-400 text-sm">No audit events yet.</div>}
        {sorted.map((a, i) => {
          const meta = metaForStage(a.stage);
          const stageLabel = stageDisplayName(a);
          const isOpen = openIndex === i;
          const payloadRaw = a?.payloadJson ?? a?.payload_json;
          const payloadObj = parsePayload(payloadRaw);
          return (
            <div key={`${a.auditId ?? i}-${a.createdAt ?? ""}`} className="relative pl-6">
              <div className={`absolute left-[11px] top-0 bottom-0 border-l-2 ${meta.color}`} />

              <div className="flex items-start gap-3 cursor-pointer group" onClick={() => setOpenIndex(isOpen ? null : i)}>
                <div className="text-sm mt-0.5">{meta.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-3">
                    <div className="font-medium text-slate-800 truncate">{stageLabel}</div>
                    <div className="flex items-center gap-2 text-slate-400 shrink-0">
                      <span>{a.createdAt ? new Date(a.createdAt).toLocaleTimeString() : "--:--:--"}</span>
                      <span className="group-hover:text-slate-600">{isOpen ? "▾" : "▸"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {isOpen && payloadRaw && (
                <div className="audit-json-card w-full min-w-0 mt-2 border rounded p-2 overflow-x-hidden">
                  {payloadObj !== null ? <JsonNodeView value={payloadObj} defaultOpen /> : <pre>{String(payloadRaw)}</pre>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
