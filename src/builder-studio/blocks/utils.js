/**
 * Ported from sim/apps/sim/blocks/utils.ts (simplified).
 *
 * Helpers used across block configs — provider credential sub-blocks, model
 * options, and file-input normalization. Kept in sync with sim's surface but
 * stripped of server-side model registry dependencies.
 *
 * Model options are now consumer-driven via llm-config-store. When a consumer
 * config is set (e.g. from YAML), models come from that config. Otherwise,
 * built-in defaults are used.
 */
import { getConfiguredModelOptions, getConfiguredDefaultModel } from '../stores/llm-config-store'

/**
 * Returns the list of models available in agent/router combobox.
 * Consumer-configured models take priority over built-in defaults.
 * Mirrors sim's getModelOptions() shape: Array<{ label, id, group? }>.
 */
export function getModelOptions() {
  return getConfiguredModelOptions()
}

/**
 * Returns the default model id based on consumer config.
 */
export function getDefaultModel() {
  return getConfiguredDefaultModel()
}

/**
 * Provider credential sub-blocks appended to agent/router blocks.
 * Mirrors sim's getProviderCredentialSubBlocks() return value.
 */
export function getProviderCredentialSubBlocks() {
  return [
    {
      id: 'apiKey',
      title: 'API Key',
      type: 'short-input',
      placeholder: 'Enter provider API key',
      password: true,
      required: true,
      mode: 'advanced',
    },
  ]
}

export const PROVIDER_CREDENTIAL_INPUTS = {
  apiKey: { type: 'string', description: 'Provider API key' },
}

export const RESPONSE_FORMAT_WAND_CONFIG = {
  enabled: true,
  maintainHistory: true,
  prompt: `You generate a valid JSON Schema for a strict structured-output contract.
Return ONLY a JSON object with keys: name, schema, strict. No markdown.`,
  placeholder: 'Describe the output schema you want...',
  generationType: 'json-schema',
}

/**
 * Normalizes file inputs passed to tools.config.params.
 * Mirrors sim's normalizeFileInput from @/blocks/utils.
 * @param {unknown} input
 * @param {{single?: boolean}} [opts]
 */
export function normalizeFileInput(input, opts = {}) {
  if (input == null) return undefined
  const { single = false } = opts
  const arr = Array.isArray(input) ? input : [input]
  const cleaned = arr.filter((f) => f != null)
  if (cleaned.length === 0) return undefined
  return single ? cleaned[0] : cleaned
}
