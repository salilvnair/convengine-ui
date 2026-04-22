import { Router, Request, Response } from 'express';
import { syncWorkspace, loadWorkspace } from '../../services/workspace';

export function workspaceRouter() {
  const router = Router();

  /* POST /api/v1/builder-studio/workspace/:id/sync */
  router.post('/builder-studio/workspace/:id/sync', (req: Request, res: Response) => {
    try {
      const result = syncWorkspace(req.params.id, req.body);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* GET /api/v1/builder-studio/workspace/:id */
  router.get('/builder-studio/workspace/:id', (req: Request, res: Response) => {
    try {
      const snapshot = loadWorkspace(req.params.id);
      if (!snapshot) return res.status(404).json({ error: 'Workspace not found' });
      res.json(snapshot);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
