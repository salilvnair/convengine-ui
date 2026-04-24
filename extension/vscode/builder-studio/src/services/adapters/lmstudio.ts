/**
 * LM Studio adapter — OpenAI-compatible API, apiKey is optional.
 *
 * LM Studio exposes the full OpenAI REST surface on localhost by default.
 * We reuse the openai adapter as-is; this file exists as a named entry
 * so the factory can select it by type = 'lmstudio'.
 */
import { createOpenAiClient, fetchOpenAiModels } from './openai';
import type { CustomProviderConfig, ModelInfo, CustomLlmClient } from './types';

export function createLmStudioClient(cfg: CustomProviderConfig): CustomLlmClient {
  return createOpenAiClient(cfg);
}

export async function fetchLmStudioModels(cfg: CustomProviderConfig): Promise<ModelInfo[]> {
  return fetchOpenAiModels(cfg);
}
