/**
 * Express bridge server — runs inside the VS Code extension host (Node.js).
 *
 * Listens on a random free port on 127.0.0.1. The WebView is given this
 * port at load time (window.__BS_BRIDGE_BASE__) so all API calls from the
 * React canvas are routed here instead of to the browser Vite proxy.
 *
 * Route mapping (mirrors the Vite proxy in convengine-ui):
 *   /api/v1/builder-studio/agent          → vscode.lm (GitHub Copilot)
 *   /api/v1/builder-studio/run            → graph-runner.ts (Node.js)
 *   /api/v1/builder-studio/workspace/:id  → SQLite
 *   /api/v1/builder-studio/llm/providers  → static Copilot model list
 *   /api/v1/builder-studio/llm/provider   → update active family
 *   /api/v1/builder-studio/deploy         → scheduler.ts
 *   /api/v1/builder-studio/undeploy       → scheduler.ts
 *   /api/v1/builder-studio/deployments    → scheduler.ts
 *   /api/v1/builder-studio/scheduler/start→ scheduler.ts
 *   /api/v1/mcp/servers                   → mcp.ts (SQLite-backed)
 *   /hook/:workflowId                     → scheduler.ts (webhook trigger)
 */
import express from 'express';
import cors from 'cors';
import * as net from 'net';
import type { Express } from 'express';
import { agentRouter } from './routes/agent';
import { workspaceRouter } from './routes/workspace';
import { mcpRouter } from './routes/mcp';
import { runRouter } from './routes/run';
import { deployRouter } from './routes/deploy';
import { providerRouter } from './routes/provider';
import { configRouter } from './routes/config';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

let _server: ReturnType<Express['listen']> | null = null;

export async function startBridgeServer(): Promise<number> {
  const port = await getFreePort();
  const app  = express();

  // Chromium Private Network Access: webview origin (vscode-webview://) is
  // treated as "public" so requests to 127.0.0.1 need this opt-in header.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
  });
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));

  /* Health */
  app.get('/health', (_req, res) => res.json({ ok: true, mode: 'vscode-extension', port }));

  /* All /api/v1 routes */
  const router = express.Router();
  router.use(agentRouter());
  router.use(workspaceRouter());
  router.use(mcpRouter());
  router.use(runRouter());
  router.use(deployRouter());
  router.use(providerRouter());
  router.use(configRouter());
  app.use('/api/v1', router);

  /* Webhook catch-all — must match /hook/:workflowId */
  const { webhookHandler } = await import('./routes/deploy');
  app.all('/hook/:workflowId', webhookHandler);

  await new Promise<void>((resolve) => {
    _server = app.listen(port, '127.0.0.1', resolve);
  });

  console.log(`[builder-studio] Bridge server → http://127.0.0.1:${port}`);
  return port;
}

export function stopBridgeServer() {
  if (_server) {
    _server.close();
    _server = null;
    console.log('[builder-studio] Bridge server stopped');
  }
}
