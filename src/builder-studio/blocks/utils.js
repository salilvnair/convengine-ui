/**
 * Ported from sim/apps/sim/blocks/utils.ts (simplified).
 *
 * Helpers used across block configs — provider credential sub-blocks, model
 * options, and file-input normalization. Kept in sync with sim's surface but
 * stripped of server-side model registry dependencies.
 */

/**
 * Returns the list of models available in agent/router combobox.
 * Mirrors sim's getModelOptions() shape: Array<{ label, id, group? }>.
 */
export function getModelOptions() {
  return [
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
