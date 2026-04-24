import { Router, Request, Response } from 'express';
import { callAgent } from '../../services/llm';

export function agentRouter() {
  const router = Router();

  /* POST /api/v1/builder-studio/agent */
  router.post('/builder-studio/agent', async (req: Request, res: Response) => {
    try {
      const result = await callAgent(req.body);
      res.json({ output: result.output, model: result.model, ms: result.ms });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
