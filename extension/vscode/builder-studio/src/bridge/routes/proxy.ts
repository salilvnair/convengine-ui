/**
 * HTTP proxy route — lets skill code in the webview fetch external URLs
 * without hitting the webview's CSP restrictions.
 *
 * The webview cannot make arbitrary outbound fetch() calls (CSP blocks them).
 * Instead, skill code uses the injected `fetch` helper which routes through
 * this endpoint running in the Node.js extension host.
 *
 * GET  /api/v1/builder-studio/proxy?url=<encoded-url>
 *   → forwards the request to the target URL and streams the response back.
 *
 * POST /api/v1/builder-studio/proxy
 *   body: { url, method?, headers?, body? }
 *   → forwards a generic request (useful for POST APIs from skill code).
 */
import { Router, Request, Response } from 'express';

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function proxyRouter() {
  const router = Router();

  /* GET — simple URL fetch (used by url_extract and similar skills) */
  router.get('/builder-studio/proxy', async (req: Request, res: Response) => {
    const url = String(req.query.url ?? '');
    if (!isAllowedUrl(url)) {
      return res.status(400).json({ error: 'url must be an absolute http(s) URL' });
    }
    try {
      const upstream = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BuilderStudioProxy/1.0)' },
      });
      const contentType = upstream.headers.get('content-type') ?? 'text/plain';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status).set('Content-Type', contentType).send(buffer);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message ?? String(err) });
    }
  });

  /* POST — generic proxied request (POST APIs, custom headers, body) */
  router.post('/builder-studio/proxy', async (req: Request, res: Response) => {
    const { url, method = 'POST', headers: extraHeaders = {}, body: reqBody } = req.body as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    if (!url || !isAllowedUrl(url)) {
      return res.status(400).json({ error: 'url must be an absolute http(s) URL' });
    }
    try {
      const upstream = await fetch(url, {
        method,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BuilderStudioProxy/1.0)',
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: reqBody != null ? (typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)) : undefined,
      });
      const contentType = upstream.headers.get('content-type') ?? 'application/json';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status).set('Content-Type', contentType).send(buffer);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message ?? String(err) });
    }
  });

  return router;
}
