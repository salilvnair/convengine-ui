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
const BASE = (globalThis.__BS_BRIDGE_BASE__ || import.meta.env?.VITE_CONVENGINE_BASE || (import.meta.env?.DEV ? '/api/v1' : 'http://localhost:8080/api/v1')).replace(/\/$/, '')

export async function runAgent({ agent, input, signal }) {
  const url = `${BASE}/builder-studio/agent`
  const reqHeaders = { 'Content-Type': 'application/json' }
  const reqPayload = { agent, input }
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(reqPayload),
      signal,
    })
  } catch (err) {
    const rich = new Error(
      `Network error calling ${url} — ${err.message}. ` +
      'Is the backend server running?'
    )
    rich.url = url
    rich.resolvedUrl = resolveUrl(url)
    rich.method = 'POST'
    rich.requestHeaders = reqHeaders
    rich.requestPayload = reqPayload
    rich.cause = err
    throw rich
  }
  if (!res.ok) {
    const body = await safeText(res)
    const rich = new Error(`Agent call failed (${res.status}): ${body}`)
    rich.url = url
    rich.resolvedUrl = resolveUrl(url)
    rich.method = 'POST'
    rich.status = res.status
    rich.statusText = res.statusText
    rich.responseBody = body
    rich.responseHeaders = headersToObj(res.headers)
    rich.requestHeaders = reqHeaders
    rich.requestPayload = reqPayload
    throw rich
  }
  return res.json() // { output, model, ms }
}

export async function runWorkflow({ workflow, inputs, signal }) {
  const url = `${BASE}/builder-studio/run`
  const reqHeaders = { 'Content-Type': 'application/json' }
  const reqPayload = { workflow, inputs }
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(reqPayload),
      signal,
    })
  } catch (err) {
    const rich = new Error(
      `Network error calling ${url} — ${err.message}. ` +
      'Is the backend server running?'
    )
    rich.url = url
    rich.resolvedUrl = resolveUrl(url)
    rich.method = 'POST'
    rich.requestHeaders = reqHeaders
    rich.requestPayload = reqPayload
    rich.cause = err
    throw rich
  }
  if (!res.ok) {
    if (res.status === 404) {
      const rich = new Error(
        'Builder Studio backend is not available at ' + url + '. ' +
        'Make sure the convengine-demo app is running and the builder-studio package is deployed.'
      )
      rich.url = url
      rich.resolvedUrl = resolveUrl(url)
      rich.method = 'POST'
      rich.status = 404
      rich.statusText = res.statusText
      rich.requestHeaders = reqHeaders
      rich.requestPayload = reqPayload
      throw rich
    }
    const body = await safeText(res)
    const rich = new Error(`Run failed (${res.status}): ${body}`)
    rich.url = url
    rich.resolvedUrl = resolveUrl(url)
    rich.method = 'POST'
    rich.status = res.status
    rich.statusText = res.statusText
    rich.responseBody = body
    rich.responseHeaders = headersToObj(res.headers)
    rich.requestHeaders = reqHeaders
    rich.requestPayload = reqPayload
    throw rich
  }
  return res.json()
}

async function safeText(res) {
  try { return await res.text() } catch { return '' }
}

function resolveUrl(url) {
  try { return new URL(url, window.location.origin).href } catch { return url }
}

function headersToObj(headers) {
  const obj = {}
  if (headers?.forEach) headers.forEach((v, k) => { obj[k] = v })
  return obj
}
