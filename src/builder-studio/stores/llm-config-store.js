/**
 * LLM Provider Configuration Store
 *
 * Consumer-driven LLM provider configuration. Instead of hardcoded models,
 * the consumer provides a config (e.g. from YAML) specifying providers,
 * models, and which provider is the default.
 *
 * Example consumer config shape:
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
 * When configured, getModelOptions() returns only the consumer's models,
 * and the default model is the one from the active provider.
 * When NOT configured, falls back to the built-in model list.
 */
import { create } from 'zustand'

/* ── Built-in fallback models (used when no consumer config is set) ──── */
const BUILTIN_MODELS = [
  { label: 'Claude Sonnet 4.6', id: 'claude-sonnet-4-6', group: 'Anthropic' },
  { label: 'Claude Opus 4', id: 'claude-opus-4', group: 'Anthropic' },
  { label: 'Claude Haiku 3.5', id: 'claude-haiku-3-5', group: 'Anthropic' },
  { label: 'GPT-4o', id: 'gpt-4o', group: 'OpenAI' },
  { label: 'GPT-4o mini', id: 'gpt-4o-mini', group: 'OpenAI' },
  { label: 'GPT-5', id: 'gpt-5', group: 'OpenAI' },
  { label: 'o3', id: 'o3', group: 'OpenAI' },
  { label: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro', group: 'Google' },
  { label: 'Gemini 2.5 Flash', id: 'gemini-2.5-flash', group: 'Google' },
  { label: 'Grok 4', id: 'grok-4', group: 'xAI' },
  { label: 'DeepSeek Chat', id: 'deepseek-chat', group: 'DeepSeek' },
  { label: 'DeepSeek Reasoner', id: 'deepseek-reasoner', group: 'DeepSeek' },
]

const BUILTIN_DEFAULT_MODEL = 'claude-sonnet-4-6'

/* ── Well-known provider group names ─────────────────────────────────── */
const PROVIDER_GROUP_MAP = {
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
 */
function deriveModelsFromConfig(config) {
  const models = []
  const reserved = new Set(['provider', 'temperature', 'maxTokens', 'timeout'])

  for (const [key, value] of Object.entries(config)) {
    if (reserved.has(key)) continue
    if (value && typeof value === 'object' && value.model) {
      models.push({
        label: value.model,
        id: value.model,
        group: humanizeProvider(key),
        provider: key,
        baseUrl: value.baseUrl || value['base-url'] || undefined,
        apiKey: value.apiKey || value['api-key'] || undefined,
      })
      // If the provider defines additional `models` array, include those too
      if (Array.isArray(value.models)) {
        for (const m of value.models) {
          if (typeof m === 'string' && m !== value.model) {
            models.push({
              label: m,
              id: m,
              group: humanizeProvider(key),
              provider: key,
              baseUrl: value.baseUrl || value['base-url'] || undefined,
              apiKey: value.apiKey || value['api-key'] || undefined,
            })
          } else if (m && typeof m === 'object' && m.id) {
            models.push({
              label: m.label || m.id,
              id: m.id,
              group: humanizeProvider(key),
              provider: key,
              baseUrl: value.baseUrl || value['base-url'] || undefined,
              apiKey: value.apiKey || value['api-key'] || undefined,
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

  /** Derived model options */
  models: BUILTIN_MODELS,

  /** Default model id */
  defaultModel: BUILTIN_DEFAULT_MODEL,

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
  setConfig(config) {
    if (!config) {
      set({
        consumerConfig: null,
        models: BUILTIN_MODELS,
        defaultModel: BUILTIN_DEFAULT_MODEL,
        activeProvider: null,
        temperature: null,
      })
      return
    }

    const models = deriveModelsFromConfig(config)
    const defaultModel = deriveDefaultModel(config)
    const activeProvider = config.provider || null
    const temperature = config.temperature ?? null

    set({
      consumerConfig: config,
      models: models.length > 0 ? models : BUILTIN_MODELS,
      defaultModel: defaultModel || (models.length > 0 ? models[0].id : BUILTIN_DEFAULT_MODEL),
      activeProvider,
      temperature,
    })
  },

  /** Get model options in the { label, id, group } format for combobox */
  getModelOptions() {
    return get().models
  },

  /** Get the default model id */
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
