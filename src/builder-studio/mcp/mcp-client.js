/**
 * Fetch helpers for the convengine MCP REST surface (see
 * {@code com.github.salilvnair.convengine.mcp.McpController}).
 *
 * All methods throw on non-2xx, surfacing the server's
 * {@code { error: string }} body when available.
 */
const BASE = (import.meta.env?.VITE_CONVENGINE_BASE || (import.meta.env?.DEV ? '/api/v1' : 'http://localhost:8080/api/v1')).replace(/\/$/, '')

async function jsonOrThrow(res, meta = {}) {
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { /* non-json */ }
  if (!res.ok) {
    const msg = body?.error || text || `HTTP ${res.status}`
    const rich = new Error(msg)
    rich.url = meta.url || res.url
    rich.method = meta.method || 'GET'
    rich.status = res.status
    rich.statusText = res.statusText
    rich.responseBody = text
    throw rich
  }
  return body
}

export async function listServers() {
  const url = `${BASE}/mcp/servers`
  return jsonOrThrow(await fetch(url), { url, method: 'GET' })
}

export async function upsertServer(cfg) {
  const url = `${BASE}/mcp/servers`
  return jsonOrThrow(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    }),
    { url, method: 'POST' }
  )
}

export async function deleteServer(id) {
  const url = `${BASE}/mcp/servers/${encodeURIComponent(id)}`
  return jsonOrThrow(
    await fetch(url, { method: 'DELETE' }),
    { url, method: 'DELETE' }
  )
}

/** @returns {{serverId, tools: Array<{name, description, inputSchema}>}} */
export async function listTools(id, { refresh = false } = {}) {
  const q = refresh ? '?refresh=true' : ''
  const url = `${BASE}/mcp/servers/${encodeURIComponent(id)}/tools${q}`
  return jsonOrThrow(await fetch(url), { url, method: 'GET' })
}

/** Invoke an MCP tool. `args` is an arbitrary JSON-shaped value or undefined. */
export async function callTool(id, tool, args) {
  const url = `${BASE}/mcp/servers/${encodeURIComponent(id)}/tools/${encodeURIComponent(tool)}/call`
  return jsonOrThrow(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args ?? {} }),
    }),
    { url, method: 'POST' }
  )
}
