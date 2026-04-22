/**
 * LLM Provider Configuration Store
 *
 * Consumer-driven LLM provider configuration. Instead of hardcoded models,
 * the consumer provides a config (e.g. from YAML) specifying providers,
 * models, and which provider is the default.
 *
 * Example consumer config shape:
 *   Normal app:
 *   {
 *     provider: 'openai',          // active provider key
 *     temperature: 0.3,
 *     openai: {
 *       apiKey: '${OPENAI_API_KEY}',
 *       model: 'gpt-4.1',
 *       baseUrl: 'https://api.openai.com',
 *     },
 *     lmstudio: {
 *       apiKey: '${LMSTUDIO_API_KEY}',
 *       model: 'openai/gpt-oss-20b',
 *       baseUrl: 'http://localhost:1234',
 *     },
 *   }
 *
 *   VS Code extension (same format, apiKey omitted — Copilot handles auth):
 *   {
 *     provider: 'copilot',
 *     copilot: {
 *       model: 'claude-sonnet-4-6',
 *       models: [{ id, label, group, family }, ...],
 *     },
 *   }
 *
 * Models are loaded exclusively from the API (/builder-studio/llm/providers).
 * If no models are returned, getModelOptions() returns [] and the run panel
 * surfaces a "No model provider found" error in Problems/Trace.
 */
import { create } from 'zustand'

/* ── Well-known provider group names ─────────────────────────────────── */
const PROVIDER_GROUP_MAP = {
  copilot: 'GitHub Copilot',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  lmstudio: 'LM Studio',
  ollama: 'Ollama',
  azure: 'Azure OpenAI',
  mistral: 'Mistral',
  groq: 'Groq',
  together: 'Together AI',
  fireworks: 'Fireworks AI',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
}

function humanizeProvider(key) {
  return PROVIDER_GROUP_MAP[key] || key.charAt(0).toUpperCase() + key.slice(1)
}

/**
 * Derive model options from a consumer LLM config object.
 * Each top-level key that is an object with a `model` field is treated as a provider.
 *
 * Supports two sub-formats for the provider value:
 *  1. Simple:  { model: 'gpt-4.1', apiKey: '...', baseUrl: '...' }
 *  2. Extended: { model: 'claude-sonnet-4-6', models: [{id,label,group,family}, ...] }
 *              apiKey is optional (e.g. Copilot, LM Studio, Ollama).
 */
function deriveModelsFromConfig(config) {
  const models = []
  const reserved = new Set(['provider', 'temperature', 'maxTokens', 'timeout', 'defaults', 'source'])

  for (const [key, value] of Object.entries(config)) {
    if (reserved.has(key)) continue
    if (value && typeof value === 'object' && value.model) {
      const baseUrl = value.baseUrl || value['base-url'] || undefined
      const apiKey  = value.apiKey  || value['api-key']  || undefined
      const group   = humanizeProvider(key)

      // If the provider supplies a full models array of objects, use that list
      // directly (preserving label/family/group) and skip adding the bare primary entry
      // to avoid duplicates. The active model is already included in the array.
      const hasObjectModels = Array.isArray(value.models) &&
        value.models.some((m) => m && typeof m === 'object' && m.id)

      if (!hasObjectModels) {
        // Simple format — only a primary model string, no full list provided
        models.push({
          label: value.model,
          id: value.model,
          family: value.model,
          group,
          provider: key,
          baseUrl,
          apiKey,
        })
      }

      // Additional models from the array (string entries or full objects)
      if (Array.isArray(value.models)) {
        for (const m of value.models) {
          if (typeof m === 'string' && m !== value.model) {
            models.push({
              label: m,
              id: m,
              family: m,
              group,
              provider: key,
              baseUrl,
              apiKey,
            })
          } else if (m && typeof m === 'object' && m.id) {
            models.push({
              label: m.label || m.id,
              id: m.id,
              family: m.family || m.id,
              group: m.group || group,
              provider: key,
              baseUrl,
              apiKey,
            })
          }
        }
      }
    }
  }
  return models
}

/**
 * Determine the default model from consumer config.
 * Uses the `provider` field to find the matching provider entry's `model`.
 */
function deriveDefaultModel(config) {
  const activeProvider = config.provider
  if (!activeProvider) return null
  const providerConfig = config[activeProvider]
  if (providerConfig && providerConfig.model) {
    return providerConfig.model
  }
  return null
}

/* ── Zustand store ───────────────────────────────────────────────────── */

export const useLlmConfigStore = create((set, get) => ({
  /** Raw consumer config object (null = use built-in defaults) */
  consumerConfig: null,

  /** Derived model options. Empty on init — populated exclusively from API. */
  models: [],

  /** Default model id */
  defaultModel: null,

  /** Active provider key */
  activeProvider: null,

  /** Global temperature override from config */
  temperature: null,

  /**
   * Set the consumer LLM config. Call this at app init or from settings.
   * Pass `null` to revert to built-in defaults.
   *
   * @param {object|null} config — consumer config object
   */
  /**
   * Directly set a pre-normalised model list from the API response.
   * Shape expected: { provider, models: [{ id, label, group, family }], active? }
   * This is what the bridge endpoint (and future Postgres endpoint) returns.
   * No fallback to built-in models — if the API returns nothing, the list stays empty.
   */
  setModels({ models: apiModels, provider, active } = {}) {
    const models = (apiModels || []).map((m) => ({
      label: m.label || m.name || m.id,
      id: m.id,
      group: m.group || provider || 'API',
      family: m.family || m.id,
      provider: m.provider || provider || null,
    }))
    const defaultModel = active || (models.length > 0 ? models[0].id : null)
    set({
      models,
      defaultModel,
      activeProvider: provider || null,
    })
  },

  setConfig(config) {
    if (!config) {
      set({
        consumerConfig: null,
        models: [],
        defaultModel: null,
        activeProvider: null,
        temperature: null,
      })
      return
    }

    // If the response is the flat API shape { provider, models: [...] }, delegate to setModels.
    if (Array.isArray(config.models)) {
      get().setModels(config)
      return
    }

    const models = deriveModelsFromConfig(config)
    const defaultModel = deriveDefaultModel(config)
    const activeProvider = config.provider || null
    const temperature = config.temperature ?? null

    set({
      consumerConfig: config,
      models,
      defaultModel: defaultModel || (models.length > 0 ? models[0].id : null),
      activeProvider,
      temperature,
    })
  },

  /** Get model options in the { label, id, group } format for combobox */
  getModelOptions() {
    return get().models
  },

  /** Get the default model id. Returns null if no models loaded from API yet. */
  getDefaultModel() {
    return get().defaultModel
  },

  /** Check if consumer config is active (not using built-in defaults) */
  isConsumerConfigured() {
    return get().consumerConfig !== null
  },

  /** Get provider config by key */
  getProviderConfig(providerKey) {
    const cfg = get().consumerConfig
    if (!cfg || !cfg[providerKey]) return null
    return cfg[providerKey]
  },

  /** Resolve which provider owns a given model id. */
  getProviderForModel(modelId) {
    const match = get().models.find((m) => m.id === modelId)
    return match?.provider || null
  },

  /** Get the active provider's config */
  getActiveProviderConfig() {
    const cfg = get().consumerConfig
    if (!cfg || !cfg.provider) return null
    return cfg[cfg.provider] || null
  },
}))

/* ── Convenience functions (non-React, callable from block definitions) ─ */

/** Returns model options — consumer-configured or built-in fallback */
export function getConfiguredModelOptions() {
  return useLlmConfigStore.getState().getModelOptions()
}

/** Returns the default model id */
export function getConfiguredDefaultModel() {
  return useLlmConfigStore.getState().getDefaultModel()
}

/** Returns the configured temperature or fallback */
export function getConfiguredTemperature(fallback = 0.3) {
  return useLlmConfigStore.getState().temperature ?? fallback
}

export function getConfiguredProviderForModel(modelId) {
  return useLlmConfigStore.getState().getProviderForModel(modelId)
}
