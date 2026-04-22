/**
 * Ported from sim/apps/sim/blocks/blocks/agent.ts.
 *
 * Schema matches sim. Some fetchOptions/model-provider lookups are simplified
 * since the client runs against convengine's LLM routes, not sim's providers
 * registry.
 */
import { AgentIcon } from '../../components/icons'
import { AuthMode, IntegrationType } from '../types'
import {
  getModelOptions,
  getDefaultModel,
  getProviderCredentialSubBlocks,
  RESPONSE_FORMAT_WAND_CONFIG,
} from '../utils'

export const AgentBlock = {
  type: 'agent',
  name: 'Agent',
  description: 'Build an agent',
  authMode: AuthMode.ApiKey,
  longDescription:
    'The Agent block is a core workflow block that is a wrapper around an LLM. It takes in system/user prompts and calls an LLM provider. It can also make tool calls by directly containing tools inside of its tool input. It can additionally return structured output.',
  bestPractices: `
  - Prefer using integrations as tools within the agent block over separate integration blocks unless complete determinism needed.
  - Response Format should be a valid JSON Schema. Fields can be accessed at root level by following blocks: e.g. <agent1.field>.
  `,
  docsLink: 'https://docs.sim.ai/blocks/agent',
  category: 'blocks',
  integrationType: IntegrationType.AI,
  tags: ['llm', 'agentic', 'automation'],
  bgColor: '#7A5CFF',
  icon: AgentIcon,
  subBlocks: [
    {
      id: 'systemPrompt',
      title: 'System Prompt',
      type: 'long-input',
      placeholder: 'You are a helpful assistant…',
      rows: 4,
    },
    {
      id: 'userPrompt',
      title: 'User Prompt',
      type: 'long-input',
      placeholder: 'User message or template with {{variables}}…',
      rows: 3,
    },
    {
      id: 'model',
      title: 'Model',
      type: 'combobox',
      placeholder: 'Type or select a model...',
      required: true,
      get defaultValue() { return getDefaultModel() },
      options: getModelOptions,
    },
    {
      id: 'reasoningEffort',
      title: 'Reasoning Effort',
      type: 'dropdown',
      placeholder: 'Select reasoning effort...',
      options: [
        { label: 'auto', id: 'auto' },
        { label: 'low', id: 'low' },
        { label: 'medium', id: 'medium' },
        { label: 'high', id: 'high' },
      ],
      dependsOn: ['model'],
      mode: 'advanced',
    },
    {
      id: 'verbosity',
      title: 'Verbosity',
      type: 'dropdown',
      placeholder: 'Select verbosity...',
      options: [
        { label: 'auto', id: 'auto' },
        { label: 'low', id: 'low' },
        { label: 'medium', id: 'medium' },
        { label: 'high', id: 'high' },
      ],
      dependsOn: ['model'],
      mode: 'advanced',
    },
    {
      id: 'thinkingLevel',
      title: 'Thinking Level',
      type: 'dropdown',
      placeholder: 'Select thinking level...',
      options: [
        { label: 'none', id: 'none' },
        { label: 'minimal', id: 'minimal' },
        { label: 'low', id: 'low' },
        { label: 'medium', id: 'medium' },
        { label: 'high', id: 'high' },
        { label: 'max', id: 'max' },
      ],
      dependsOn: ['model'],
      mode: 'advanced',
    },
    ...getProviderCredentialSubBlocks(),
    // In convengine, "skills" ARE the agent's tools — a skill is just a
    // tool whose implementation is a JS function stored in the workspace.
    // We expose one unified field so the card doesn't show two identical
    // JSON editors. Legacy workflows that still have a `tools` array get
    // merged with `skills` at runtime (see graph-runner.runAgentNode).
    { id: 'skills', title: 'Skills / Tools', type: 'skill-input', defaultValue: [] },
    {
      id: 'memoryType',
      title: 'Memory',
      type: 'dropdown',
      placeholder: 'Select memory...',
      options: [
        { label: 'None', id: 'none' },
        { label: 'Conversation', id: 'conversation' },
        { label: 'Sliding window (messages)', id: 'sliding_window' },
        { label: 'Sliding window (tokens)', id: 'sliding_window_tokens' },
      ],
      defaultValue: 'none',
    },
    {
      id: 'conversationId',
      title: 'Conversation ID',
      type: 'short-input',
      placeholder: 'e.g., user-123, session-abc',
      required: {
        field: 'memoryType',
        value: ['conversation', 'sliding_window', 'sliding_window_tokens'],
      },
      condition: {
        field: 'memoryType',
        value: ['conversation', 'sliding_window', 'sliding_window_tokens'],
      },
    },
    {
      id: 'slidingWindowSize',
      title: 'Sliding Window Size',
      type: 'short-input',
      placeholder: 'Enter number of messages (e.g., 10)...',
      condition: { field: 'memoryType', value: ['sliding_window'] },
    },
    {
      id: 'slidingWindowTokens',
      title: 'Max Tokens',
      type: 'short-input',
      placeholder: 'Enter max tokens (e.g., 4000)...',
      condition: { field: 'memoryType', value: ['sliding_window_tokens'] },
    },
    {
      id: 'temperature',
      title: 'Temperature',
      type: 'slider',
      min: 0,
      max: 2,
      defaultValue: 0.3,
      mode: 'advanced',
    },
    {
      id: 'maxTokens',
      title: 'Max Output Tokens',
      type: 'short-input',
      placeholder: 'Enter max tokens (e.g., 4096)...',
      mode: 'advanced',
    },
    {
      id: 'responseFormat',
      title: 'Response Format',
      type: 'code',
      placeholder: 'Enter JSON schema...',
      language: 'json',
      wandConfig: RESPONSE_FORMAT_WAND_CONFIG,
    },
    {
      id: 'strictOutput',
      title: 'Strict JSON',
      type: 'switch',
      description:
        'When on, the backend calls LlmClient.generateJsonStrict (OpenAI json_schema + strict:true). Only applies when a Response Format schema is set.',
      condition: { field: 'responseFormat', value: '', not: true },
      value: () => false,
    },
  ],
  tools: {
    access: [
      'openai_chat',
      'anthropic_chat',
      'google_chat',
      'xai_chat',
      'deepseek_chat',
      'deepseek_reasoner',
    ],
    config: {
      tool: (params) => {
        const model = params.model || getDefaultModel()
        if (model.startsWith('claude')) return 'anthropic_chat'
        if (model.startsWith('gpt') || model.startsWith('o')) return 'openai_chat'
        if (model.startsWith('gemini')) return 'google_chat'
        if (model.startsWith('grok')) return 'xai_chat'
        if (model.startsWith('deepseek-reasoner')) return 'deepseek_reasoner'
        if (model.startsWith('deepseek')) return 'deepseek_chat'
        return 'anthropic_chat'
      },
      params: (params) => params,
    },
  },
  inputs: {
    messages: {
      type: 'json',
      description:
        'Array of message objects with role and content: [{ role, content }]',
    },
    memoryType: { type: 'string', description: 'Memory type' },
    conversationId: { type: 'string', description: 'Conversation ID' },
    slidingWindowSize: { type: 'string', description: 'Number of recent messages' },
    slidingWindowTokens: { type: 'string', description: 'Max tokens for window' },
    model: { type: 'string', description: 'AI model to use' },
    apiKey: { type: 'string', description: 'Provider API key' },
    responseFormat: { type: 'json', description: 'JSON response format schema' },
    temperature: { type: 'number', description: 'Response randomness level' },
    maxTokens: { type: 'number', description: 'Maximum number of tokens in the response' },
    reasoningEffort: { type: 'string', description: 'Reasoning effort level' },
    verbosity: { type: 'string', description: 'Verbosity level' },
    thinkingLevel: { type: 'string', description: 'Thinking level' },
    skills: { type: 'json', description: 'Selected skills / tools configuration' },
  },
  outputs: {
    data: { type: 'string', description: 'Generated response content' },
    status: { type: 'number', description: 'HTTP-like status code (200 on success)' },
    headers: { type: 'json', description: 'Response metadata (model, duration, etc.)' },
  },
}
