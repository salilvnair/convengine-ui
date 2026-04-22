/**
 * MCP (Model Context Protocol) service.
 *
 * Stores server configs in SQLite and speaks directly to MCP servers
 * via HTTP JSON-RPC (Streamable HTTP transport) or SSE transport.
 *
 * No proxy to ce-builder-studio or convengine-demo needed —
 * the extension IS the backend.
 */
import { upsert, remove, findById, findAll } from '../storage/db';
import type { McpServerConfig, McpTool } from '../types';

export function initMcpService(_storagePath: string) {
  // db is already initialised by initDb() in extension.ts activate()
}

/* ── Tool cache (per server, evicted on refresh) ── */
const _toolCache = new Map<string, McpTool[]>();

/* ── CRUD ── */

export function listServers(): McpServerConfig[] {
  return findAll<McpServerConfig>('bs_mcp_server');
}

export function upsertServer(cfg: Partial<McpServerConfig>): McpServerConfig {
  const id  = cfg.id || `mcp_${Date.now()}`;
  const now = new Date().toISOString();
  const existing = findById<McpServerConfig>('bs_mcp_server', id);
  const server: McpServerConfig = {
    id,
    name:      cfg.name    ?? existing?.name    ?? 'Unnamed',
    url:       cfg.url     ?? existing?.url     ?? '',
    type:      cfg.type    ?? existing?.type    ?? 'http',
    command:   cfg.command ?? existing?.command,
    args:      cfg.args    ?? existing?.args,
    env:       cfg.env     ?? existing?.env,
    headers:   cfg.headers ?? existing?.headers,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  upsert<McpServerConfig>('bs_mcp_server', id, server);
  _toolCache.delete(id);
  return server;
}

export function deleteServer(id: string): { ok: boolean } {
  remove('bs_mcp_server', id);
  _toolCache.delete(id);
  return { ok: true };
}

/* ── Tool discovery ── */

export async function listTools(serverId: string, refresh = false): Promise<McpTool[]> {
  if (!refresh && _toolCache.has(serverId)) {
    return _toolCache.get(serverId)!;
  }

  const server = getServerOrThrow(serverId);
  const tools = await mcpListTools(server);
  _toolCache.set(serverId, tools);
  return tools;
}

/* ── Tool invocation ── */

export async function callTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const server = getServerOrThrow(serverId);
  return mcpCallTool(server, toolName, args);
}

/* ── Helpers ── */

function getServerOrThrow(serverId: string): McpServerConfig {
  const server = findById<McpServerConfig>('bs_mcp_server', serverId);
  if (!server) throw new Error(`MCP server "${serverId}" not found`);
  return server;
}

/* ── MCP JSON-RPC transport ── */

let _rpcId = 1;

interface McpRpcResponse {
  result?: { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
  error?: { message: string };
  [k: string]: unknown;
}

async function mcpRpc(
  server: McpServerConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<McpRpcResponse> {
  const id = _rpcId++;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(server.headers ?? {}),
  };

  const res = await fetch(server.url, {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP server "${server.name}" HTTP ${res.status}: ${text}`);
  }

  const data = (await res.json()) as McpRpcResponse;
  if (data.error) {
    throw new Error(`MCP error from "${server.name}": ${data.error.message}`);
  }
  return data;
}

async function mcpListTools(server: McpServerConfig): Promise<McpTool[]> {
  try {
    const res = await mcpRpc(server, 'tools/list', {});
    const tools = res.result?.tools ?? [];
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  } catch (err: unknown) {
    console.warn(`[mcp] listTools failed for "${server.name}":`, err);
    return [];
  }
}

async function mcpCallTool(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await mcpRpc(server, 'tools/call', { name: toolName, arguments: args });
  return res.result ?? res;
}
