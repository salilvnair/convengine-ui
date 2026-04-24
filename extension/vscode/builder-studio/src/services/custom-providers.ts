/**
 * Custom provider registry — persists user-defined LLM providers in SQLite,
 * fetches their model lists, and creates LlmClient instances for graph execution.
 */
import { findAll, upsert, remove } from '../storage/db';
import type { CustomProviderConfig, ModelInfo, CustomLlmClient } from './adapters/types';
import { fetchOpenAiModels, createOpenAiClient } from './adapters/openai';
import { fetchAnthropicModels, createAnthropicClient } from './adapters/anthropic';
import { fetchLmStudioModels, createLmStudioClient } from './adapters/lmstudio';
import { fetchOllamaModels, createOllamaClient } from './adapters/ollama';

export type { CustomProviderConfig, ModelInfo };

const COLLECTION = 'custom_providers';

/* ── CRUD ─────────────────────────────────────────────────────────── */

export function getAllCustomProviders(): CustomProviderConfig[] {
  return findAll<CustomProviderConfig>(COLLECTION);
}

export function saveCustomProvider(cfg: CustomProviderConfig): CustomProviderConfig {
  return upsert(COLLECTION, cfg.key, cfg);
}

export function deleteCustomProvider(key: string): void {
  remove(COLLECTION, key);
}

/* ── Model fetching ───────────────────────────────────────────────── */

/**
 * Fetch models live from the provider's modelsUrl.
 * Updates the cached model list on the stored provider record.
 */
export async function fetchAndCacheModels(key: string): Promise<ModelInfo[]> {
  const providers = getAllCustomProviders();
  const cfg = providers.find((p) => p.key === key);
  if (!cfg) throw new Error(`Custom provider not found: ${key}`);

  const models = await fetchModelsFromConfig(cfg);

  // Update cache in DB
  upsert(COLLECTION, cfg.key, { ...cfg, cachedModels: models });

  return models;
}

async function fetchModelsFromConfig(cfg: CustomProviderConfig): Promise<ModelInfo[]> {
  switch (cfg.type) {
    case 'openai':    return fetchOpenAiModels(cfg);
    case 'anthropic': return fetchAnthropicModels(cfg);
    case 'lmstudio':  return fetchLmStudioModels(cfg);
    case 'ollama':    return fetchOllamaModels(cfg);
    default:
      throw new Error(`Unknown provider type: ${String((cfg as { type: unknown }).type)}`);
  }
}

/* ── Client factory ───────────────────────────────────────────────── */

export function createCustomProviderClient(key: string): CustomLlmClient {
  const providers = getAllCustomProviders();
  const cfg = providers.find((p) => p.key === key);
  if (!cfg) throw new Error(`Custom provider not found: ${key}`);

  switch (cfg.type) {
    case 'openai':    return createOpenAiClient(cfg);
    case 'anthropic': return createAnthropicClient(cfg);
    case 'lmstudio':  return createLmStudioClient(cfg);
    case 'ollama':    return createOllamaClient(cfg);
    default:
      throw new Error(`Unknown provider type: ${String((cfg as { type: unknown }).type)}`);
  }
}

/**
 * Given a model id, find which custom provider owns it
 * (by checking activeModel or cachedModels).
 */
export function resolveCustomProviderForModel(modelId: string): CustomProviderConfig | undefined {
  const providers = getAllCustomProviders();
  // Exact activeModel match first
  const byActive = providers.find((p) => p.activeModel === modelId);
  if (byActive) return byActive;
  // Cached model list fallback
  return providers.find((p) =>
    (p.cachedModels ?? []).some((m) => m.id === modelId)
  );
}

/**
 * Build the provider section for getAvailableProviders() response.
 * Uses cachedModels (fast, no network); returns empty models if not yet fetched.
 */
export function buildCustomProviderSection(
  cfg: CustomProviderConfig,
): Record<string, unknown> {
  const cachedModels = cfg.cachedModels ?? [];
  // Deduplicate by id before sending to the webview
  const seen = new Set<string>();
  const models = cachedModels.reduce<{ id: string; label: string; group: string; family: string }[]>((acc, m) => {
    if (!m.id || seen.has(m.id)) return acc;
    seen.add(m.id);
    acc.push({ id: m.id, label: m.label, group: cfg.name, family: m.family });
    return acc;
  }, []);

  return {
    name: cfg.name,
    provider: cfg.key,
    type: cfg.type,
    model: cfg.activeModel ?? models[0]?.id ?? '',
    models,
    // chatUrl is kept server-side; not exposed to the webview
  };
}
