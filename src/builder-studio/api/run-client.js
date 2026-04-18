/**
 * Client for executing a builder-studio workflow against the convengine backend.
 *
 * IMPORTANT: this does NOT go through `/conversation/message` (which runs the
 * full intent + MCP + semantic-query pipeline). The builder studio is a
 * direct, stateless graph runner: it takes the nodes/edges/subBlockValues from
 * the canvas and the user-supplied inputs, and calls `LlmClient` per agent
 * node on the server. Control-flow blocks (if/else, switch, loops) are
 * evaluated client-side in JS; only LLM, DB, and other server-bound work
 * hops the wire.
 *
 * Endpoint: POST /api/v1/builder-studio/run
 * Body:     { workflow: { nodes, edges, subBlockValues }, inputs: { nodeId: value } }
 * Returns:  { output, trace: [{ nodeId, blockType, input, output, ms }], error? }
 *
 * Base URL is configurable via `VITE_CONVENGINE_BASE`
 * (defaults to `http://localhost:8080/api/v1`).
 */
const BASE = (import.meta.env?.VITE_CONVENGINE_BASE || 'http://localhost:8080/api/v1').replace(/\/$/, '')

export async function runAgent({ agent, input, signal }) {
  const res = await fetch(`${BASE}/builder-studio/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, input }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Agent call failed (${res.status}): ${await safeText(res)}`)
  }
  return res.json() // { output, model, ms }
}

export async function runWorkflow({ workflow, inputs, signal }) {
  const res = await fetch(`${BASE}/builder-studio/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow, inputs }),
    signal,
  })
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'Builder Studio backend is not available at ' + BASE + '/builder-studio/run. ' +
        'Make sure the convengine-demo app is running and the builder-studio package is deployed.'
      )
    }
    throw new Error(`Run failed (${res.status}): ${await safeText(res)}`)
  }
  return res.json()
}

async function safeText(res) {
  try { return await res.text() } catch { return '' }
}
