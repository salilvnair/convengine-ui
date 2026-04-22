import { Router, Request, Response } from 'express';
import * as scheduler from '../../engine/scheduler';
import type { Workflow } from '../../types';

interface DeployBody {
  workflowId: string;
  workflow: Workflow;
  trigger?: {
    type: 'cron' | 'webhook' | 'manual';
    cron?: string;
    timezone?: string;
  };
}

export function deployRouter() {
  const router = Router();

  /* POST /api/v1/builder-studio/deploy */
  router.post('/builder-studio/deploy', (req: Request, res: Response) => {
    try {
      const { workflowId, workflow, trigger } = req.body as DeployBody;
      if (!workflowId || !workflow) return res.status(400).json({ error: 'workflowId and workflow are required' });
      const result = scheduler.deploy(workflowId, workflow, trigger);
      res.json({ ok: true, workflowId, ...result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* POST /api/v1/builder-studio/undeploy */
  router.post('/builder-studio/undeploy', (req: Request, res: Response) => {
    try {
      const { workflowId } = req.body as { workflowId: string };
      if (!workflowId) return res.status(400).json({ error: 'workflowId is required' });
      scheduler.undeploy(workflowId);
      res.json({ ok: true, workflowId });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* GET /api/v1/builder-studio/deployments */
  router.get('/builder-studio/deployments', (_req: Request, res: Response) => {
    res.json({ deployments: scheduler.listDeployments() });
  });

  /* POST /api/v1/builder-studio/scheduler/start — manual / AKS-style trigger */
  router.post('/builder-studio/scheduler/start', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { workflowId?: string };
      if (body.workflowId) {
        const result = await scheduler.execute(body.workflowId);
        return res.json({ ok: true, workflowId: body.workflowId, ...result });
      }
      // Execute ALL cron deployments
      const all    = scheduler.listDeployments().filter((d) => d.trigger?.type === 'cron');
      const results = await Promise.allSettled(all.map((d) => scheduler.execute(d.workflowId)));
      res.json({
        ok: true,
        executed: all.length,
        results: results.map((r, i) =>
          r.status === 'fulfilled'
            ? { workflowId: all[i].workflowId, ok: true, durationMs: (r.value as { durationMs?: number }).durationMs }
            : { workflowId: all[i].workflowId, ok: false, error: String((r as PromiseRejectedResult).reason) }
        ),
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* POST /api/v1/builder-studio/execute/:workflowId */
  router.post('/builder-studio/execute/:workflowId', async (req: Request, res: Response) => {
    try {
      const inputs = (req.body as Record<string, unknown>) || {};
      const result = await scheduler.execute(req.params.workflowId, inputs);
      res.json({ ok: true, workflowId: req.params.workflowId, ...result });
    } catch (err: unknown) {
      const msg    = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not deployed') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  });

  return router;
}

/* Webhook handler — registered at /hook/:workflowId directly on the app */
export async function webhookHandler(req: Request, res: Response) {
  try {
    const result = await scheduler.triggerWebhook(req.params.workflowId, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      query: req.query as Record<string, string>,
      body: (req.body as Record<string, unknown>) || {},
    });
    const output = result?.output as Record<string, unknown> | undefined;
    if (output?.statusCode) {
      return res.status(Number(output.statusCode) || 200).json(output.body ?? output);
    }
    res.json({ ok: true, output: result?.output, trace: result?.trace });
  } catch (err: unknown) {
    const msg    = err instanceof Error ? err.message : String(err);
    const status = msg.includes('not deployed') ? 404 : 500;
    res.status(status).json({ error: msg });
  }
}
