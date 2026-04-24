/**
 * OpenAI-compatible adapter.
 *
 * Works with any API that speaks the OpenAI REST protocol:
 *   GET  {modelsUrl}  → { data: [{ id }] }
 *   POST {chatUrl}    → { model, messages: [{role, content}], temperature }
 *                     ← { choices: [{ message: { content } }] }
 */
import type { CustomProviderConfig, ModelInfo, CustomLlmClient } from './types';

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\n?/gm, '').replace(/```\s*$/gm, '').trim();
}

function buildHeaders(cfg: CustomProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    ...(cfg.headers ?? {}),
  };
}

type OAMessage = { role: string; content: string };

async function oaChat(
  cfg: CustomProviderConfig,
  messages: OAMessage[],
  model: string,
  temperature = 0.7,
): Promise<string> {
  const res = await fetch(cfg.chatUrl, {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    throw new Error(`[openai-adapter] chat failed ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

export async function fetchOpenAiModels(cfg: CustomProviderConfig): Promise<ModelInfo[]> {
  const res = await fetch(cfg.modelsUrl, { headers: buildHeaders(cfg) });
  if (!res.ok) {
    throw new Error(`[openai-adapter] fetchModels failed ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { id: string }[] };
  const seen = new Set<string>();
  return (data.data ?? []).reduce<ModelInfo[]>((acc, m) => {
    if (!m.id || seen.has(m.id)) return acc;
    seen.add(m.id);
    acc.push({ id: m.id, label: m.id, group: cfg.name, family: m.id });
    return acc;
  }, []);
}

export function createOpenAiClient(cfg: CustomProviderConfig): CustomLlmClient {
  return {
    async generateText(hint, context, model, temp) {
      const msgs: OAMessage[] = [];
      if (hint) msgs.push({ role: 'system', content: hint });
      msgs.push({ role: 'user', content: context || '' });
      return oaChat(cfg, msgs, model, temp);
    },

    async generateJson(hint, jsonSchema, context, model, temp) {
      const msgs: OAMessage[] = [
        {
          role: 'system',
          content:
            'You are a JSON extraction engine. Return ONLY valid JSON matching the provided schema. ' +
            'No markdown fences. No explanation.',
        },
        { role: 'system', content: `JSON Schema:\n${jsonSchema}` },
        { role: 'user', content: hint || context },
      ];
      return stripFences(await oaChat(cfg, msgs, model, temp));
    },

    async generateJsonStrict(hint, jsonSchema, context, model, temp) {
      const msgs: OAMessage[] = [
        {
          role: 'system',
          content:
            'You are a JSON extraction engine. Return ONLY valid JSON matching the schema. ' +
            'Output ONLY the JSON object. No markdown. No explanation.',
        },
        { role: 'system', content: `JSON Schema:\n${jsonSchema}` },
        { role: 'user', content: hint || context },
      ];
      let output = stripFences(await oaChat(cfg, msgs, model, temp));
      try {
        JSON.parse(output);
      } catch {
        msgs.push({ role: 'assistant', content: output });
        msgs.push({
          role: 'user',
          content: 'The response was not valid JSON. Return ONLY the JSON object.',
        });
        output = stripFences(await oaChat(cfg, msgs, model, temp));
      }
      return output;
    },
  };
}
