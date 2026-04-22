import { Router, Request, Response } from 'express';
import { executeGraph } from '../../engine/graph-runner';
import { callAgentViaCopilot } from '../../services/llm';
import { callTool } from '../../services/mcp';
import type { Workflow } from '../../types';

export function runRouter() {
  const router = Router();

  /* POST /api/v1/builder-studio/run  — server-side graph execution */
  router.post('/builder-studio/run', async (req: Request, res: Response) => {
    try {
      const { workflow, inputs } = req.body as { workflow: Workflow; inputs: Record<string, unknown> };

      if (!workflow?.nodes || !workflow?.edges) {
        return res.status(400).json({ error: 'workflow must include nodes and edges' });
      }

      const result = await executeGraph({
        workflow,
        inputs: inputs || {},
        callAgent: callAgentViaCopilot,
        callTool,
      });

      res.json({ output: result.output, trace: result.trace });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
