import { Router, Request, Response } from 'express';
import { getAvailableProviders, setActiveFamily, getActiveFamily } from '../../services/llm';
import { upsert, findById } from '../../storage/db';

const PREF_COLLECTION = 'llm_prefs';
const ACTIVE_FAMILY_KEY = 'activeFamily';

/** Load persisted active family from DB into memory (call once after initDb). */
export function loadActiveFamilyFromDb() {
  const stored = findById<{ family: string }>(PREF_COLLECTION, ACTIVE_FAMILY_KEY);
  if (stored?.family) setActiveFamily(stored.family);
}

export function providerRouter() {
  const router = Router();

  /* GET /api/v1/builder-studio/llm/providers */
  router.get('/builder-studio/llm/providers', async (_req: Request, res: Response) => {
    try {
      const providers = await getAvailableProviders();
      res.json(providers);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* POST /api/v1/builder-studio/llm/provider */
  router.post('/builder-studio/llm/provider', (req: Request, res: Response) => {
    try {
      const { family, model } = req.body as { family?: string; model?: string };
      const resolved = family ?? model ?? getActiveFamily();
      setActiveFamily(resolved);
      // Persist selection so it survives extension restarts
      upsert(PREF_COLLECTION, ACTIVE_FAMILY_KEY, { family: resolved });
      res.json({ ok: true, active: resolved });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
