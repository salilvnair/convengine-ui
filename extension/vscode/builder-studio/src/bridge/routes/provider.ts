import { Router, Request, Response } from 'express';
import {
  getAvailableProviders,
  setActiveFamily,
  getActiveFamily,
  setActiveCustomProvider,
  getActiveProviderKey,
} from '../../services/llm';
import {
  getAllCustomProviders,
  saveCustomProvider,
  deleteCustomProvider,
  fetchAndCacheModels,
} from '../../services/custom-providers';
import type { CustomProviderConfig } from '../../services/custom-providers';
import { upsert, findById } from '../../storage/db';

const PREF_COLLECTION = 'llm_prefs';
const ACTIVE_FAMILY_KEY = 'activeFamily';
const ACTIVE_CUSTOM_PROVIDER_KEY = 'activeCustomProvider';

/** Load persisted active family / custom provider from DB into memory (call once after initDb). */
export function loadActiveFamilyFromDb() {
  const stored = findById<{ family: string }>(PREF_COLLECTION, ACTIVE_FAMILY_KEY);
  if (stored?.family) setActiveFamily(stored.family);

  const storedCustom = findById<{ key: string }>(PREF_COLLECTION, ACTIVE_CUSTOM_PROVIDER_KEY);
  if (storedCustom?.key) setActiveCustomProvider(storedCustom.key);
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

  /* POST /api/v1/builder-studio/llm/provider — switch active provider/model */
  router.post('/builder-studio/llm/provider', (req: Request, res: Response) => {
    try {
      const { family, model, provider } = req.body as {
        family?: string;
        model?: string;
        provider?: string;
      };

      if (provider && provider !== 'copilot') {
        // Switching to a custom provider
        setActiveCustomProvider(provider);
        upsert(PREF_COLLECTION, ACTIVE_CUSTOM_PROVIDER_KEY, { key: provider });
        // Also update the activeModel on the stored custom provider config
        const allProviders = getAllCustomProviders();
        const cfg = allProviders.find((p) => p.key === provider);
        if (cfg) {
          const modelId = family ?? model ?? cfg.activeModel ?? '';
          saveCustomProvider({ ...cfg, activeModel: modelId });
        }
        res.json({ ok: true, active: provider });
      } else {
        // Switching to Copilot
        const resolved = family ?? model ?? getActiveFamily();
        setActiveFamily(resolved);
        upsert(PREF_COLLECTION, ACTIVE_FAMILY_KEY, { family: resolved });
        // Clear custom provider selection
        setActiveCustomProvider(null);
        upsert(PREF_COLLECTION, ACTIVE_CUSTOM_PROVIDER_KEY, { key: null });
        res.json({ ok: true, active: resolved });
      }
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* ── Custom provider CRUD ─────────────────────────────────────── */

  /* GET /api/v1/builder-studio/llm/custom-providers */
  router.get('/builder-studio/llm/custom-providers', (_req: Request, res: Response) => {
    try {
      const providers = getAllCustomProviders().map((p) => ({
        key: p.key,
        name: p.name,
        type: p.type,
        chatUrl: p.chatUrl,
        modelsUrl: p.modelsUrl,
        headers: p.headers ?? {},
        activeModel: p.activeModel ?? '',
        cachedModels: p.cachedModels ?? [],
        // apiKey intentionally omitted
      }));
      res.json(providers);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* POST /api/v1/builder-studio/llm/custom-providers — create or update */
  router.post('/builder-studio/llm/custom-providers', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<CustomProviderConfig>;
      const name = (body.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!body.type) return res.status(400).json({ error: 'type is required' });
      if (!body.chatUrl) return res.status(400).json({ error: 'chatUrl is required' });
      if (!body.modelsUrl) return res.status(400).json({ error: 'modelsUrl is required' });

      // Derive a stable key from the name (slug)
      const key =
        body.key ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');

      const cfg: CustomProviderConfig = {
        key,
        name,
        type: body.type as CustomProviderConfig['type'],
        chatUrl: body.chatUrl,
        modelsUrl: body.modelsUrl,
        apiKey: body.apiKey || undefined,
        headers: body.headers || {},
        activeModel: body.activeModel || '',
      };

      const saved = saveCustomProvider(cfg);

      // Eagerly fetch and cache models
      let fetchedModels: { id: string; label: string; group: string; family: string }[] = [];
      try {
        fetchedModels = await fetchAndCacheModels(key);
      } catch {
        // Non-fatal — models will be empty until user refreshes
      }

      res.json({
        key: saved.key,
        name: saved.name,
        type: saved.type,
        activeModel: saved.activeModel,
        models: fetchedModels,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* DELETE /api/v1/builder-studio/llm/custom-providers/:key */
  router.delete('/builder-studio/llm/custom-providers/:key', (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      deleteCustomProvider(key);
      // If deleted provider was active, revert to copilot
      if (getActiveProviderKey() === key) {
        setActiveCustomProvider(null);
        upsert(PREF_COLLECTION, ACTIVE_CUSTOM_PROVIDER_KEY, { key: null });
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /* POST /api/v1/builder-studio/llm/custom-providers/:key/models — refresh model list */
  router.post(
    '/builder-studio/llm/custom-providers/:key/models',
    async (req: Request, res: Response) => {
      try {
        const { key } = req.params;
        const models = await fetchAndCacheModels(key);
        res.json(models);
      } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  return router;
}

