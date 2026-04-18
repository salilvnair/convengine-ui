/**
 * Fetch helpers for the convengine MCP REST surface (see
 * {@code com.github.salilvnair.convengine.mcp.McpController}).
 *
 * All methods throw on non-2xx, surfacing the server's
 * {@code { error: string }} body when available.
 */
const BASE = (import.meta.env?.VITE_CONVENGINE_BASE || 'http://localhost:8080/api/v1').replace(/\/$/, '')

async function jsonOrThrow(res) {
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { /* non-json */ }
  if (!res.ok) {
    const msg = body?.error || text || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body
}

export async function listServers() {
  return jsonOrThrow(await fetch(`${BASE}/mcp/servers`))
}

export async function upsertServer(cfg) {
  return jsonOrThrow(
    await fetch(`${BASE}/mcp/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
  )
}

export async function deleteServer(id) {
  return jsonOrThrow(
    await fetch(`${BASE}/mcp/servers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  )
}

/** @returns {{serverId, tools: Array<{name, description, inputSchema}>}} */
export async function listTools(id, { refresh = false } = {}) {
  const q = refresh ? '?refresh=true' : ''
  return jsonOrThrow(await fetch(`${BASE}/mcp/servers/${encodeURIComponent(id)}/tools${q}`))
}

/** Invoke an MCP tool. `args` is an arbitrary JSON-shaped value or undefined. */
export async function callTool(id, tool, args) {
  return jsonOrThrow(
    await fetch(`${BASE}/mcp/servers/${encodeURIComponent(id)}/tools/${encodeURIComponent(tool)}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args ?? {} }),
    })
  )
}
