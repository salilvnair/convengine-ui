/**
 * MCP (Model Context Protocol) service.
 *
 * Stores server configs in SQLite. Supports two transports:
 *   • HTTP  — JSON-RPC POST to a remote/local endpoint
 *   • STDIO — spawns a subprocess (e.g. `npx -y @modelcontextprotocol/server-filesystem /tmp`)
 *             and speaks MCP JSON-RPC over stdin/stdout.
 *
 * The extension host is full Node.js, so child_process is available directly.
 * No vscode.postMessage bridge needed.
 */
import { spawn, ChildProcess } from 'child_process';
import { upsert, remove, findById, findAll } from '../storage/db';
import type { McpServerConfig, McpTool } from '../types';

export function initMcpService(_storagePath: string) {
  // db is already initialised by initDb() in extension.ts activate()
}

/* ── Tool cache (per server, evicted on refresh) ── */
const _toolCache = new Map<string, McpTool[]>();

/* ── Transport type helpers ── */

/** Normalise the UI field (`transport: 'STDIO'`) to the internal `type` field. */
function uiTransportToType(transport: string | undefined): McpServerConfig['type'] {
  if (!transport) return 'http';
  switch (transport.toUpperCase()) {
    case 'STDIO': return 'stdio';
    case 'SSE':   return 'sse';
    default:      return 'http';
  }
}

/** Expose both `type` and `transport` on outbound objects so the React UI works. */
function withTransport(server: McpServerConfig): McpServerConfig {
  const map: Record<string, McpServerConfig['transport']> = {
    stdio: 'STDIO', sse: 'SSE', http: 'HTTP',
  };
  return { ...server, transport: map[server.type] ?? 'HTTP' };
}

/* ── CRUD ── */

export function listServers(): McpServerConfig[] {
  return findAll<McpServerConfig>('bs_mcp_server').map(withTransport);
}

export function upsertServer(cfg: Partial<McpServerConfig> & { transport?: string }): McpServerConfig {
  const id  = cfg.id || `mcp_${Date.now()}`;
  const now = new Date().toISOString();
  const existing = findById<McpServerConfig>('bs_mcp_server', id);

  // Accept either `type` (internal) or `transport` (from React UI)
  const resolvedType = cfg.type ?? (cfg.transport ? uiTransportToType(cfg.transport) : existing?.type ?? 'http');

  const server: McpServerConfig = {
    id,
    name:      cfg.name    ?? existing?.name    ?? 'Unnamed',
    url:       cfg.url     ?? existing?.url     ?? '',
    type:      resolvedType,
    command:   cfg.command ?? existing?.command,
    args:      cfg.args    ?? existing?.args,
    env:       cfg.env     ?? existing?.env,
    headers:   cfg.headers ?? existing?.headers,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  upsert<McpServerConfig>('bs_mcp_server', id, server);
  _toolCache.delete(id);
  // Kill any running stdio process so next call re-spawns with new config
  killStdioProcess(id);
  return withTransport(server);
}

export function deleteServer(id: string): { ok: boolean } {
  remove('bs_mcp_server', id);
  _toolCache.delete(id);
  killStdioProcess(id);
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

/* ════════════════════════════════════════════════════════════════
   HTTP JSON-RPC transport
   ════════════════════════════════════════════════════════════════ */

let _rpcId = 1;

interface McpRpcResponse {
  id?: number;
  result?: { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
  error?: { message: string };
  [k: string]: unknown;
}

async function httpRpc(
  server: McpServerConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<McpRpcResponse> {
  const id   = _rpcId++;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(server.headers ?? {}),
  };
  const res = await fetch(server.url, { method: 'POST', headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP server "${server.name}" HTTP ${res.status}: ${text}`);
  }
  const data = (await res.json()) as McpRpcResponse;
  if (data.error) throw new Error(`MCP error from "${server.name}": ${data.error.message}`);
  return data;
}

/* ════════════════════════════════════════════════════════════════
   STDIO transport  (child_process — available in the extension host)
   ════════════════════════════════════════════════════════════════ */

interface StdioSession {
  proc:     ChildProcess;
  pending:  Map<number, { resolve(v: McpRpcResponse): void; reject(e: Error): void }>;
  buf:      string;
  ready:    boolean;
}

const _stdioSessions = new Map<string, StdioSession>();

function killStdioProcess(serverId: string) {
  const s = _stdioSessions.get(serverId);
  if (!s) return;
  try { s.proc.kill(); } catch { /* ignore */ }
  for (const p of s.pending.values()) p.reject(new Error('MCP process killed'));
  s.pending.clear();
  _stdioSessions.delete(serverId);
}

async function getOrCreateStdioSession(server: McpServerConfig): Promise<StdioSession> {
  const existing = _stdioSessions.get(server.id);
  if (existing && existing.proc.exitCode === null) return existing;

  if (!server.command) throw new Error(`MCP server "${server.name}" has no command configured`);

  const env  = { ...process.env, ...(server.env ?? {}) };
  const proc = spawn(server.command, server.args ?? [], { env, stdio: ['pipe', 'pipe', 'pipe'] });

  const session: StdioSession = { proc, pending: new Map(), buf: '', ready: false };
  _stdioSessions.set(server.id, session);

  proc.stdout!.on('data', (chunk: Buffer) => {
    session.buf += chunk.toString();
    // MCP messages are newline-delimited JSON
    const lines = session.buf.split('\n');
    session.buf = lines.pop()!;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: McpRpcResponse;
      try { msg = JSON.parse(trimmed); } catch { continue; }
      if (msg.id != null) {
        const p = session.pending.get(msg.id as number);
        if (p) { session.pending.delete(msg.id as number); p.resolve(msg); }
      }
    }
  });

  proc.stderr!.on('data', (chunk: Buffer) => {
    console.warn(`[mcp-stdio] "${server.name}" stderr:`, chunk.toString().trim());
  });

  proc.on('exit', (code) => {
    console.log(`[mcp-stdio] "${server.name}" exited (code ${code})`);
    for (const p of session.pending.values()) p.reject(new Error(`MCP process "${server.name}" exited`));
    session.pending.clear();
    _stdioSessions.delete(server.id);
  });

  // MCP handshake: initialize → initialized notification
  await stdioRpc(session, server, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'builder-studio', version: '1.0.0' },
  });
  // Send the required 'notifications/initialized' notification (no response expected)
  proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

  session.ready = true;
  return session;
}

function stdioRpc(
  session: StdioSession,
  server: McpServerConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<McpRpcResponse> {
  const id  = _rpcId++;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error(`MCP STDIO timeout for "${method}" on "${server.name}"`));
    }, 30_000);
    session.pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject:  (e) => { clearTimeout(timer); reject(e); },
    });
    session.proc.stdin!.write(msg);
  });
}

/* ════════════════════════════════════════════════════════════════
   SSE transport  (MCP SSE protocol over fetch streaming)
   ════════════════════════════════════════════════════════════════ */

interface SseSession {
  messageUrl: string | null;
  pending:    Map<number, { resolve(v: McpRpcResponse): void; reject(e: Error): void }>;
  cleanup:    () => void;
}

const _sseSessions = new Map<string, SseSession>();

function killSseSession(serverId: string) {
  const s = _sseSessions.get(serverId);
  if (!s) return;
  s.cleanup();
  for (const p of s.pending.values()) p.reject(new Error('SSE session closed'));
  s.pending.clear();
  _sseSessions.delete(serverId);
}

async function getOrCreateSseSession(server: McpServerConfig): Promise<SseSession> {
  const existing = _sseSessions.get(server.id);
  if (existing?.messageUrl) return existing;

  // Remove stale session if any
  if (existing) killSseSession(server.id);

  // Normalise SSE endpoint: append /sse unless already present
  const sseUrl = /\/sse\/?$/.test(server.url)
    ? server.url
    : server.url.replace(/\/?$/, '/sse');

  const session: SseSession = { messageUrl: null, pending: new Map(), cleanup: () => {} };
  _sseSessions.set(server.id, session);

  return new Promise<SseSession>((resolve, reject) => {
    let endpointReceived = false;

    fetch(sseUrl, {
      headers: { Accept: 'text/event-stream', ...(server.headers ?? {}) },
    })
      .then((res) => {
        if (!res.ok || !res.body) {
          _sseSessions.delete(server.id);
          reject(new Error(`SSE connect failed for "${server.name}": HTTP ${res.status}`));
          return;
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let   buf     = '';

        session.cleanup = () => { try { reader.cancel(); } catch { /* ignore */ } };

        // Resolve-endpoint timeout
        const epTimer = setTimeout(() => {
          if (!endpointReceived) {
            session.cleanup();
            _sseSessions.delete(server.id);
            reject(new Error(`SSE endpoint event timeout for "${server.name}"`));
          }
        }, 10_000);

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });

              // SSE events are separated by blank lines
              const events = buf.split('\n\n');
              buf = events.pop()!;

              for (const raw of events) {
                let eventType = 'message';
                let eventData = '';
                for (const line of raw.split('\n')) {
                  if (line.startsWith('event:')) eventType = line.slice(6).trim();
                  else if (line.startsWith('data:')) eventData = line.slice(5).trim();
                }

                if (eventType === 'endpoint' && eventData) {
                  clearTimeout(epTimer);
                  // eventData may be a path ("/messages?sessionId=…") or full URL
                  try {
                    session.messageUrl = new URL(eventData, server.url).toString();
                  } catch {
                    session.messageUrl = eventData;
                  }
                  if (!endpointReceived) {
                    endpointReceived = true;
                    resolve(session);
                  }
                } else if (eventType === 'message' && eventData) {
                  try {
                    const msg = JSON.parse(eventData) as McpRpcResponse;
                    if (msg.id != null) {
                      const p = session.pending.get(msg.id as number);
                      if (p) { session.pending.delete(msg.id as number); p.resolve(msg); }
                    }
                  } catch { /* skip invalid JSON */ }
                }
              }
            }
          } catch {
            /* stream closed — reject any outstanding requests */
          } finally {
            for (const p of session.pending.values()) p.reject(new Error(`SSE stream closed for "${server.name}"`));
            session.pending.clear();
            _sseSessions.delete(server.id);
          }
        };

        pump();
      })
      .catch((err: unknown) => {
        _sseSessions.delete(server.id);
        reject(err);
      });
  });
}

async function sseRpc(
  session: SseSession,
  server: McpServerConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<McpRpcResponse> {
  if (!session.messageUrl) throw new Error(`SSE session for "${server.name}" has no message URL`);
  const id      = _rpcId++;
  const body    = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(server.headers ?? {}),
  };
  // POST the request; the response arrives asynchronously on the SSE stream
  const postRes = await fetch(session.messageUrl, { method: 'POST', headers, body });
  if (!postRes.ok) {
    const text = await postRes.text().catch(() => '');
    throw new Error(`MCP SSE POST "${method}" failed for "${server.name}": HTTP ${postRes.status} ${text}`);
  }
  return new Promise<McpRpcResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error(`MCP SSE timeout for "${method}" on "${server.name}"`));
    }, 30_000);
    session.pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject:  (e) => { clearTimeout(timer); reject(e); },
    });
  });
}

/* ════════════════════════════════════════════════════════════════
   Unified dispatch — picks transport based on server.type
   ════════════════════════════════════════════════════════════════ */

async function mcpRpc(
  server: McpServerConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<McpRpcResponse> {
  if (server.type === 'stdio') {
    const session = await getOrCreateStdioSession(server);
    return stdioRpc(session, server, method, params);
  }
  if (server.type === 'sse') {
    const session = await getOrCreateSseSession(server);
    return sseRpc(session, server, method, params);
  }
  return httpRpc(server, method, params);
}

async function mcpListTools(server: McpServerConfig): Promise<McpTool[]> {
  try {
    const res   = await mcpRpc(server, 'tools/list', {});
    const tools = (res.result as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> })?.tools ?? [];
    return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
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

/* ── Cleanup (called from extension.ts deactivate) ── */
export function disposeMcpService() {
  for (const id of [..._stdioSessions.keys()]) killStdioProcess(id);
  for (const id of [..._sseSessions.keys()])   killSseSession(id);
}

