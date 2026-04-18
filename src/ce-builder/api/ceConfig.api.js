// REST transport for ConvEngine ce_* configuration tables.
//
// NOTE: the convengine backend does NOT yet expose per-table CRUD endpoints
// under /api/v1/config/*. Today admins write rows through SQL Developer and
// call /api/v1/cache/refresh. This module stubs the endpoint shape we plan
// to add on the Spring Boot side so the builder is wired up end-to-end on
// the UI once the backend lands.
//
// Deploy flow (after backend endpoints exist):
//   1. POST /api/v1/config/<table>/bulk with upsert payloads per block type
//   2. POST /api/v1/cache/refresh to hot-reload the static cache
//   3. Next conversation turn picks up the new config with zero downtime.

const CONFIG_BASE = "http://localhost:8080/api/v1/config";
const CACHE_BASE = "http://localhost:8080/api/v1/cache";

const TABLE_PATHS = Object.freeze({
  intent: "intents",
  intent_classifier: "intent-classifiers",
  prompt_template: "prompt-templates",
  rule: "rules",
  response: "responses",
  mcp_tool: "mcp-tools",
  mcp_db_tool: "mcp-db-tools",
  mcp_planner: "mcp-planners",
  policy: "policies",
  config: "configs",
  verbose: "verboses",
  output_schema: "output-schemas",
  container_config: "container-configs",
  semantic_entity: "semantic-entities",
  semantic_relationship: "semantic-relationships",
  semantic_join_hint: "semantic-join-hints",
  semantic_value_pattern: "semantic-value-patterns",
});

async function jsonOrThrow(res, message) {
  if (!res.ok) throw new Error(`${message}: ${res.status} ${res.statusText}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function bulkUpsertBlocks(blockType, rows) {
  const path = TABLE_PATHS[blockType];
  if (!path) throw new Error(`Unknown block type: ${blockType}`);
  const res = await fetch(`${CONFIG_BASE}/${path}/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  return jsonOrThrow(res, `Bulk upsert ${path} failed`);
}

export async function listIntents() {
  const res = await fetch(`${CONFIG_BASE}/intents`);
  return jsonOrThrow(res, "List intents failed");
}

// GET /api/v1/config/by-intent/{intentCode} → composite payload with every
// row keyed by intent_code for that intent. The backend endpoint aggregates:
//   ce_intent (1 row)            ce_prompt_template (N rows)
//   ce_response (N rows)         ce_rule (N rows)
//   ce_mcp_tool (N rows)         ce_mcp_planner (N rows)
//   ce_output_schema (N rows)
// Policies and ce_semantic_* are NOT returned here — they are global.
export async function fetchConfigByIntent(intentCode) {
  const res = await fetch(`${CONFIG_BASE}/by-intent/${encodeURIComponent(intentCode)}`);
  return jsonOrThrow(res, `Load config for intent ${intentCode} failed`);
}

export async function refreshCaches() {
  const res = await fetch(`${CACHE_BASE}/refresh`, { method: "POST" });
  return jsonOrThrow(res, "Cache refresh failed");
}

// Serializes the ce-builder canvas into one upsert payload per block type.
// Each block's subBlocks become flat column values for the matching ce_* row.
export function serializeCanvasToUpserts(canvasJSON) {
  const byType = new Map();
  for (const block of canvasJSON.blocks) {
    const list = byType.get(block.type) || [];
    list.push({
      __clientId: block.id,
      __enabled: block.enabled,
      ...block.subBlocks,
    });
    byType.set(block.type, list);
  }
  return Array.from(byType.entries()).map(([type, rows]) => ({ type, rows }));
}

// One-shot deploy: upsert every group then refresh the cache. Stops on first
// failure and surfaces the failed group so the UI can show which table blew up.
export async function deployCanvas(canvasJSON) {
  const groups = serializeCanvasToUpserts(canvasJSON);
  const results = [];
  for (const group of groups) {
    try {
      const data = await bulkUpsertBlocks(group.type, group.rows);
      results.push({ type: group.type, ok: true, data });
    } catch (err) {
      results.push({ type: group.type, ok: false, error: err instanceof Error ? err.message : String(err) });
      return { results, cacheRefreshed: false };
    }
  }
  const cacheResult = await refreshCaches().catch((err) => ({ error: err?.message || String(err) }));
  return { results, cacheRefreshed: !cacheResult?.error, cacheResult };
}
