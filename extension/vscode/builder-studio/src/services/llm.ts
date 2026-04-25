/**
 * LLM service — Copilot implementation of the LlmClient interface.
 *
 * Mirrors the Java LlmClient contract from convengine / convengine-demo:
 *
 *   interface LlmClient {
 *     generateText(hint, context)                     → text output
 *     generateJson(hint, jsonSchema, context)          → JSON output (non-strict)
 *     generateJsonStrict(hint, jsonSchema, context)    → JSON output (strict)
 *   }
 *
 * Message construction follows the same patterns as OpenAiRestWebserviceHandler:
 *
 *   TEXT mode:
 *     [sys] "You are a concise conversational assistant."
 *     [sys] hint
 *     [user] context
 *
 *   JSON non-strict mode (buildJsonMessages):
 *     [sys] "You are a JSON extraction engine. Return ONLY valid JSON…"
 *     [sys] "JSON Schema:\n<schema>"
 *     [sys] hint   ← hint already contains combined system+user prompt
 *
 *   JSON strict mode:
 *     Same as non-strict + explicit "output ONLY the JSON object" instruction
 *     + validation-retry loop
 *
 * Note: vscode.lm has no System role — simulated with User/Assistant pairs.
 */
import * as vscode from 'vscode';
import type { AgentRequest, AgentResponse, AgentMemoryConfig } from '../types';
import {
  getAllCustomProviders,
  buildCustomProviderSection,
  createCustomProviderClient,
  resolveCustomProviderForModel,
} from './custom-providers';

/* ════════════════════════════════════════════════════════════
   In-process conversation memory store
   Keyed by conversationId — stores ordered turn pairs.
   Lives for the lifetime of the extension host process.
   ════════════════════════════════════════════════════════════ */

interface ConvTurn {
  user: string;
  assistant: string;
}

const _convStore = new Map<string, ConvTurn[]>();

function getHistory(conversationId: string): ConvTurn[] {
  return _convStore.get(conversationId) ?? [];
}

function appendTurn(conversationId: string, user: string, assistant: string): void {
  const turns = _convStore.get(conversationId) ?? [];
  turns.push({ user, assistant });
  _convStore.set(conversationId, turns);
}

/** Trim history to at most windowSize turns (most recent kept). */
function applyWindow(turns: ConvTurn[], windowSize: number): ConvTurn[] {
  return turns.length > windowSize ? turns.slice(-windowSize) : turns;
}

/** Rough token estimate: 1 token ≈ 4 chars. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Trim history so total token estimate stays within maxTokens (most recent kept). */
function applyTokenWindow(turns: ConvTurn[], maxTokens: number): ConvTurn[] {
  let budget = maxTokens;
  const result: ConvTurn[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(turns[i].user) + estimateTokens(turns[i].assistant);
    if (budget < cost) break;
    budget -= cost;
    result.unshift(turns[i]);
  }
  return result;
}

/**
 * Resolve the history turns to inject given the memory config.
 * Returns [] when memoryType is none/absent.
 */
function resolveHistory(memory: AgentMemoryConfig | null | undefined): ConvTurn[] {
  if (!memory || memory.type === undefined) return [];
  const convId = memory.conversationId;
  if (!convId) return [];
  const raw = getHistory(convId);
  if (memory.type === 'conversation') return raw;
  if (memory.type === 'sliding_window') return applyWindow(raw, memory.windowSize ?? 10);
  if (memory.type === 'sliding_window_tokens') return applyTokenWindow(raw, memory.maxTokens ?? 4000);
  return raw;
}

/* ════════════════════════════════════════════════════════════
   LlmClient interface  (mirrors Java LlmClient)
   ════════════════════════════════════════════════════════════ */

export interface LlmClient {
  /**
   * Generate a plain-text response.
   * @param hint      System-level instructions / persona prompt
   * @param context   The user's input / conversation context
   */
  generateText(hint: string, context: string): Promise<string>;

  /**
   * Generate a JSON response that conforms to the given schema (non-strict).
   * The model is instructed to return valid JSON but output is not validated
   * against the schema at the protocol level.
   * @param hint        Combined system + user prompt (hint already contains user data)
   * @param jsonSchema  JSON Schema string describing the expected output shape
   * @param context     Additional context / raw user input (appended when hint is minimal)
   */
  generateJson(hint: string, jsonSchema: string, context: string): Promise<string>;

  /**
   * Generate a JSON response with strict schema enforcement.
   * Includes validation + retry loop — mirrors generateJsonStrict in Java impl.
   */
  generateJsonStrict(hint: string, jsonSchema: string, context: string): Promise<string>;
}

/* ════════════════════════════════════════════════════════════
   Active model family
   ════════════════════════════════════════════════════════════ */

let _activeFamily: string | null = null;
let _activeCustomProviderKey: string | null = null;

export function setActiveFamily(family: string) {
  _activeFamily = family;
  _activeCustomProviderKey = null; // switching to Copilot clears custom selection
}

export function getActiveFamily(): string {
  if (_activeFamily) return _activeFamily;
  const cfg = vscode.workspace.getConfiguration('builderStudio');
  return cfg.get<string>('copilotFamily') ?? '';  // no hardcoded fallback
}

export function setActiveCustomProvider(key: string | null) {
  _activeCustomProviderKey = key;
  if (key) _activeFamily = null; // switching to custom clears copilot selection
}

export function getActiveCustomProviderKey(): string | null {
  return _activeCustomProviderKey;
}

/** Returns the currently active provider key — 'copilot' or a custom provider key. */
export function getActiveProviderKey(): string {
  return _activeCustomProviderKey ?? 'copilot';
}

/* ════════════════════════════════════════════════════════════
   Provider list — flat shape that llm-config-store.setModels() expects
   ════════════════════════════════════════════════════════════ */

/** Shape returned to the frontend — mirrors the consumer config format. */
export interface ProviderConfig {
  provider: string;
  copilot: {
    /** Active/default model family id */
    model: string;
    /** Full list of available models */
    models: { id: string; label: string; group: string; family: string }[];
  };
}

export async function getAvailableProviders(): Promise<ProviderConfig> {
  let lmModels: readonly vscode.LanguageModelChat[] = [];
  try {
    lmModels = await vscode.lm.selectChatModels({});
  } catch {
    // lm API not available — return empty list so UI shows nothing hardcoded
  }

  // Deduplicate by display name — multiple model variants can share the same
  // label (e.g. gpt-5-mini and gpt-5-mini-2 both show as "GPT-5 mini").
  const seen = new Set<string>();
  const models: { id: string; label: string; group: string; family: string }[] = [];

  for (const m of lmModels) {
    const key = m.name;
    if (seen.has(key)) continue;
    seen.add(key);
    models.push({
      id: m.family || m.id,
      label: m.name,
      group: 'GitHub Copilot',
      family: m.family || m.id,
    });
  }

  const active = getActiveFamily();
  const activeModel = models.find((m) => m.family === active)?.id ?? models[0]?.id ?? active;

  // Merge custom providers into the same consumer-config format.
  // apiKey is intentionally omitted — never sent to the webview.
  const customSections: Record<string, unknown> = {};
  for (const cp of getAllCustomProviders()) {
    customSections[cp.key] = buildCustomProviderSection(cp);
  }

  return {
    provider: getActiveProviderKey(),
    copilot: {
      model: activeModel,
      models,
    },
    ...customSections,
  };
}

/* ════════════════════════════════════════════════════════════
   CopilotLlmClient — vscode.lm implementation of LlmClient
   ════════════════════════════════════════════════════════════ */

export class CopilotLlmClient implements LlmClient {

  constructor(private readonly family: string) {}

  /* ── generateText ─────────────────────────────────────────
   * Mirrors OpenAiRestWebserviceHandler.buildTextMessages():
   *   system: "You are a concise conversational assistant."
   *   system: hint
   *   user:   context
   * ─────────────────────────────────────────────────────── */
  async generateText(hint: string, context: string, history: ConvTurn[] = []): Promise<string> {
    const messages = buildTextMessages(hint, context, history);
    return this._send(messages);
  }

  /* ── generateJson ─────────────────────────────────────────
   * Mirrors OpenAiRestWebserviceHandler.buildJsonMessages():
   *   system: "You are a JSON extraction engine…"
   *   system: "JSON Schema:\n<schema>"
   *   system: hint  (hint contains the full prompt incl. user data)
   * ─────────────────────────────────────────────────────── */
  async generateJson(hint: string, jsonSchema: string, context: string): Promise<string> {
    const messages = buildJsonMessages(hint, jsonSchema, context);
    let output = await this._send(messages);
    output = stripMarkdownFences(output);
    return output;
  }

  /* ── generateJsonStrict ───────────────────────────────────
   * Same messages as generateJson + explicit strict instruction
   * + validation-retry loop (mirrors generateJsonStrict in Java).
   * ─────────────────────────────────────────────────────── */
  async generateJsonStrict(hint: string, jsonSchema: string, context: string): Promise<string> {
    const messages = buildJsonStrictMessages(hint, jsonSchema, context);
    let output = await this._send(messages);
    output = stripMarkdownFences(output);

    // Validate — retry once if not valid JSON
    try {
      JSON.parse(output);
    } catch {
      messages.push(vscode.LanguageModelChatMessage.Assistant(output));
      messages.push(vscode.LanguageModelChatMessage.User(
        'The response is not valid JSON. Return ONLY the JSON object that matches the schema. ' +
        'No markdown, no code fences, no explanations.'
      ));
      output = await this._send(messages);
      output = stripMarkdownFences(output);
    }

    return output;
  }

  /* ── Internal send ────────────────────────────────────────── */
  private async _send(messages: vscode.LanguageModelChatMessage[]): Promise<string> {
    const model = await resolveModel(this.family);
    const cts = new vscode.CancellationTokenSource();
    const response = await model.sendRequest(messages, {}, cts.token);
    let output = '';
    for await (const chunk of response.text) {
      output += chunk;
    }
    return output;
  }
}

/* ════════════════════════════════════════════════════════════
   Message builders  (mirrors Java handler buildXxxMessages)
   ════════════════════════════════════════════════════════════ */

/**
 * TEXT mode — mirrors buildTextMessages() in OpenAiRestWebserviceHandler
 */
function buildTextMessages(
  hint: string,
  context: string,
  history: ConvTurn[] = [],
): vscode.LanguageModelChatMessage[] {
  const msgs: vscode.LanguageModelChatMessage[] = [];

  // system: persona
  msgs.push(vscode.LanguageModelChatMessage.User(
    '[System]: You are a concise conversational assistant.'
  ));
  msgs.push(vscode.LanguageModelChatMessage.Assistant('Understood.'));

  // system: hint (task instructions / system prompt)
  if (hint) {
    msgs.push(vscode.LanguageModelChatMessage.User(`[System]: ${hint}`));
    msgs.push(vscode.LanguageModelChatMessage.Assistant('Understood.'));
  }

  // prior conversation turns (memory)
  for (const turn of history) {
    msgs.push(vscode.LanguageModelChatMessage.User(turn.user));
    msgs.push(vscode.LanguageModelChatMessage.Assistant(turn.assistant));
  }

  // user: context (the actual user input)
  msgs.push(vscode.LanguageModelChatMessage.User(context));

  return msgs;
}

/**
 * JSON non-strict mode — mirrors buildJsonMessages() in OpenAiRestWebserviceHandler
 * hint = combined system+user prompt (hint already embeds user data for JSON mode)
 */
function buildJsonMessages(
  hint: string,
  jsonSchema: string,
  context: string,
): vscode.LanguageModelChatMessage[] {
  const msgs: vscode.LanguageModelChatMessage[] = [];

  // system: JSON engine instruction
  msgs.push(vscode.LanguageModelChatMessage.User(
    '[System]: You are a JSON extraction engine.\n' +
    'You MUST return ONLY valid JSON.\n' +
    'Do NOT add explanations.\n' +
    'Do NOT use markdown.'
  ));
  msgs.push(vscode.LanguageModelChatMessage.Assistant('Understood.'));

  // system: JSON Schema
  if (jsonSchema) {
    msgs.push(vscode.LanguageModelChatMessage.User(`[System]: JSON Schema:\n${jsonSchema}`));
    msgs.push(vscode.LanguageModelChatMessage.Assistant('Understood.'));
  }

  // system: hint (the full prompt — already contains user data for JSON mode)
  // If context is provided separately, append it so nothing is lost
  const fullHint = context ? `${hint}\n\n${context}` : hint;
  if (fullHint) {
    msgs.push(vscode.LanguageModelChatMessage.User(`[System]: ${fullHint}`));
    msgs.push(vscode.LanguageModelChatMessage.Assistant('Understood. I will return only valid JSON.'));
  }

  return msgs;
}

/**
 * JSON strict mode — same messages as non-strict + explicit strict instruction
 */
function buildJsonStrictMessages(
  hint: string,
  jsonSchema: string,
  context: string,
): vscode.LanguageModelChatMessage[] {
  const msgs = buildJsonMessages(hint, jsonSchema, context);

  // Additional strict instruction (mirrors generateJsonStrict intent)
  msgs.push(vscode.LanguageModelChatMessage.User(
    'Output ONLY the JSON object. ' +
    'It must be valid JSON that strictly conforms to the provided schema. ' +
    'No markdown code fences. No explanation text. No extra keys.'
  ));
  msgs.push(vscode.LanguageModelChatMessage.Assistant('Understood. Returning only the JSON object.'));

  return msgs;
}

/* ════════════════════════════════════════════════════════════
   callAgentViaCopilot — bridge entry point (used by routes/agent.ts)
   Routes to generateText / generateJson / generateJsonStrict
   based on agent config, mirroring Java LlmClient dispatch.
   ════════════════════════════════════════════════════════════ */

export async function callAgentViaCopilot(req: AgentRequest): Promise<AgentResponse> {
  const t0 = Date.now();
  const { agent, input } = req;

  const family = mapModelToFamily(agent.model ?? getActiveFamily());
  const client = new CopilotLlmClient(family);

  /* Interpolate {{input}} and other bag keys in prompt templates */
  const bag = buildBag(input);
  const systemPrompt = interpolateBag(agent.systemPrompt ?? '', bag);
  const userPrompt   = interpolateBag(agent.userPrompt ?? '{{input}}', bag);

  // Resolve prior conversation history
  const history = resolveHistory(agent.memory);

  let output: string;

  if (agent.responseFormat) {
    // JSON mode — hint = combined system+user prompt (mirrors Java JSON path where
    // hint embeds the full instruction and userContext isn't a separate message)
    const hint = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
    const jsonSchema = agent.responseFormat;
    const context = input; // raw input as fallback context

    if (agent.strictOutput) {
      output = await client.generateJsonStrict(hint, jsonSchema, context);
    } else {
      output = await client.generateJson(hint, jsonSchema, context);
    }
  } else {
    // Text mode — hint = systemPrompt, context = userPrompt
    output = await client.generateText(systemPrompt, userPrompt || input, history);
  }

  // Persist this turn into conversation memory
  if (agent.memory?.conversationId) {
    appendTurn(agent.memory.conversationId, userPrompt || input, output);
  }

  // Resolve model name for the response metadata
  let modelName = family;
  try {
    const resolved = await vscode.lm.selectChatModels({ family });
    if (resolved && resolved.length > 0) modelName = resolved[0].name;
  } catch { /* best effort */ }

  return { output, model: modelName, ms: Date.now() - t0 };
}

/* ════════════════════════════════════════════════════════════
   callAgent — unified entry point that routes to Copilot or
   a custom provider adapter based on agent.provider.
   ════════════════════════════════════════════════════════════ */

export async function callAgent(req: AgentRequest): Promise<AgentResponse> {
  const { agent } = req;

  // Determine which provider to use:
  //   1. Explicit provider on the node (set via applyDefaultModelToAll)
  //   2. Active custom provider key (user switched in Settings)
  //   3. Fall back to Copilot
  const providerKey =
    agent.provider && agent.provider !== 'copilot'
      ? agent.provider
      : _activeCustomProviderKey ?? 'copilot';

  if (providerKey === 'copilot') {
    return callAgentViaCopilot(req);
  }

  // Resolve which custom provider to use — prefer explicit key, then model id lookup
  let customKey = providerKey;
  if (customKey === 'custom' || !getAllCustomProviders().find((p) => p.key === customKey)) {
    // Try to resolve by model id
    const resolved = resolveCustomProviderForModel(agent.model ?? '');
    if (!resolved) return callAgentViaCopilot(req); // safe fallback
    customKey = resolved.key;
  }

  const t0 = Date.now();
  const client = createCustomProviderClient(customKey);
  const bag = buildBag(req.input);
  const systemPrompt = interpolateBag(agent.systemPrompt ?? '', bag);
  const userPrompt   = interpolateBag(agent.userPrompt ?? '{{input}}', bag);
  const model        = agent.model ?? '';
  const temperature  = agent.temperature ?? 0.7;

  // Inject conversation history as formatted prior-context prefix
  const history = resolveHistory(agent.memory);
  const historyPrefix = history.length > 0
    ? history.map((t) => `[User]: ${t.user}\n[Assistant]: ${t.assistant}`).join('\n\n') + '\n\n'
    : '';
  const contextWithHistory = historyPrefix + (userPrompt || req.input);

  let output: string;

  if (agent.responseFormat) {
    const hint = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
    if (agent.strictOutput) {
      output = await client.generateJsonStrict(hint, agent.responseFormat, req.input, model, temperature);
    } else {
      output = await client.generateJson(hint, agent.responseFormat, req.input, model, temperature);
    }
  } else {
    output = await client.generateText(systemPrompt, contextWithHistory, model, temperature);
  }

  // Persist this turn into conversation memory
  if (agent.memory?.conversationId) {
    appendTurn(agent.memory.conversationId, userPrompt || req.input, output);
  }

  return { output, model, ms: Date.now() - t0 };
}

async function resolveModel(family: string): Promise<vscode.LanguageModelChat> {
  let models: readonly vscode.LanguageModelChat[];
  try {
    models = await vscode.lm.selectChatModels({ family });
  } catch (err: unknown) {
    throw new Error(
      `vscode.lm.selectChatModels failed: ${err instanceof Error ? err.message : String(err)}. ` +
      'Is GitHub Copilot installed and signed in?'
    );
  }

  if (!models || models.length === 0) {
    // Fallback: no family filter
    try {
      models = await vscode.lm.selectChatModels({});
    } catch { /* ignore */ }
    if (!models || models.length === 0) {
      throw new Error(
        `No GitHub Copilot model found for family "${family}". ` +
        'Please ensure GitHub Copilot Chat is installed and you are signed in.'
      );
    }
  }

  return models[0];
}

function mapModelToFamily(model: string): string {
  if (model.startsWith('claude-')) return 'claude-sonnet';
  if (model.startsWith('gpt-4o') || model === 'gpt-4') return 'gpt-4o';
  if (model.startsWith('gpt-4.1') || model.startsWith('gpt-4-')) return 'gpt-4o';
  if (model.startsWith('gpt-5')) return 'gpt-4o';
  if (model.startsWith('o1') || model.startsWith('o3')) return 'o1';
  if (model.startsWith('gemini')) return 'gemini-2.0-flash';
  return model; // pass through — vscode.lm will match best effort
}

function buildBag(input: string): Record<string, unknown> {
  const bag: Record<string, unknown> = { input };
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(bag, parsed);
    }
  } catch { /* not JSON — use raw string */ }
  return bag;
}

function interpolateBag(template: string, bag: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_m, key: string) => {
    const val = bag[key.trim()];
    if (val === undefined) return '';
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

/** Strip ```json ... ``` fences that some models add despite instructions */
function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}
