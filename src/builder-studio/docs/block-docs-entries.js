/**
 * Block documentation entries for ALL blocks.
 * Auto-registers on import. Import this file once at app init.
 */
import { registerBlockDocs } from './block-docs-registry'

/* ═══════════════════════════════════════════════════════════════════════
 *  CORE BLOCKS
 * ═══════════════════════════════════════════════════════════════════════ */

registerBlockDocs('starter', {
  title: 'Starter',
  icon: '🚀',
  category: 'core',
  categoryColor: '#2FB3FF',
  summary:
    'The entry point of every workflow. Defines how the workflow is triggered — manually or via chat — and what input shape it expects.',
  tip: 'Every workflow must have exactly one Starter block. It is added automatically when you create a new workflow.',
  fields: [
    {
      name: 'startWorkflow',
      label: 'Start Workflow',
      type: 'dropdown',
      badge: 'trigger',
      badgeColor: '#2FB3FF',
      description:
        'Choose how the workflow is launched. "Run manually" opens a Run dialog where you fill in inputs. "Chat" exposes it as a conversational endpoint.',
      defaultValue: 'manual',
    },
    {
      name: 'inputFormat',
      label: 'Input Format',
      type: 'input-format',
      badge: 'schema',
      badgeColor: '#6366f1',
      description:
        'Define the shape of the data this workflow receives — name, type (string / number / json / boolean), and an optional default value. Downstream blocks can reference these fields via template variables.',
      tip: 'Use descriptive names like "userQuery" or "orderId" so downstream Agent blocks can reference them clearly in prompts.',
    },
  ],
})

registerBlockDocs('user_input', {
  title: 'User Input',
  icon: '📝',
  category: 'core',
  categoryColor: '#FBBF24',
  summary:
    'Collects a value from the user at runtime. When the workflow runs, a dialog appears prompting the user to enter this value before execution continues.',
  tip: 'Drop multiple User Input blocks to build multi-field forms in the Run dialog.',
  fields: [
    {
      name: 'label',
      label: 'Label',
      type: 'short-input',
      description: 'The display label shown in the Run dialog for this input field.',
      defaultValue: 'Input',
    },
    {
      name: 'kind',
      label: 'Kind',
      type: 'dropdown',
      badge: 'format',
      badgeColor: '#FBBF24',
      description:
        'The input control type: "short-text" for single-line, "long-text" for multi-line, "url" for validated URLs, "number" for numeric values.',
      defaultValue: 'short-text',
    },
    {
      name: 'placeholder',
      label: 'Placeholder',
      type: 'short-input',
      description: 'Ghost text displayed inside the input when empty. Guides the user on what to enter.',
    },
    {
      name: 'defaultValue',
      label: 'Default Value',
      type: 'short-input',
      description:
        'Pre-fill the input with this value. If set, the workflow can auto-run without showing the prompt dialog.',
      tip: 'Set a default value during development for faster iteration — the Run dialog will skip this field.',
    },
    {
      name: 'required',
      label: 'Required',
      type: 'switch',
      badge: 'validation',
      badgeColor: '#ef4444',
      description: 'When enabled, the user must provide a value before the workflow can start.',
      defaultValue: 'true',
    },
  ],
})

registerBlockDocs('agent', {
  title: 'Agent',
  icon: '🤖',
  category: 'core',
  categoryColor: '#7A5CFF',
  summary:
    'The Agent block is a wrapper around a Large Language Model (LLM). It takes system/user prompts, calls an LLM provider, and returns the generated response. It can also make tool calls by attaching skills/tools.',
  tip: 'Prefer using integrations as tools within the Agent block over separate integration blocks, unless you need complete determinism over the API call.',
  alert: 'Response Format must be a valid JSON Schema when set. Fields can be accessed by downstream blocks via <agent1.field> syntax.',
  fields: [
    {
      name: 'messages',
      label: 'Messages',
      type: 'messages-input',
      badge: 'prompt',
      badgeColor: '#7A5CFF',
      description:
        'The conversation history sent to the LLM. An array of {role, content} objects. Roles are typically "system" (instructions) and "user" (the query). Use the wand icon to auto-generate messages from a natural language description.',
      tip: 'Start with a clear system message that defines the agent\'s persona and task. Use {{templateVars}} to inject upstream data into prompts.',
    },
    {
      name: 'model',
      label: 'Model',
      type: 'combobox',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description:
        'The LLM model to use for generation. Models are loaded from your provider configuration (Settings → LLM Provider Configuration). The default model comes from your active provider.',
      tip: 'Different models have different strengths: use smaller models (Haiku, Flash, Mini) for simple tasks and larger ones (Opus, GPT-5, o3) for complex reasoning.',
    },
    {
      name: 'skills',
      label: 'Skills / Tools',
      type: 'skill-input',
      badge: 'tools',
      badgeColor: '#f59e0b',
      description:
        'Attach skills (JavaScript function tools defined in your workspace) or external tools that the Agent can call during generation. The LLM decides when to invoke a tool based on the conversation context.',
      tip: 'Create reusable skills in the Skills tab and attach them here. The agent will automatically decide when to call each tool.',
    },
    {
      name: 'memoryType',
      label: 'Memory',
      type: 'dropdown',
      badge: 'memory',
      badgeColor: '#8b5cf6',
      description:
        'Controls how conversation history is managed across multiple runs:\n\n• **None** — Each run is stateless. The agent has no memory of previous interactions.\n• **Conversation** — Full history is retained for the given Conversation ID. Every past message is sent to the LLM.\n• **Sliding window (messages)** — Only the last N messages are kept. Older messages are dropped.\n• **Sliding window (tokens)** — Messages are trimmed to fit within a token budget, keeping the most recent ones.',
      defaultValue: 'none',
      tip: 'Use "Conversation" for chatbots that need full context. Use "Sliding window" for long-running agents where you want to control cost and context length.',
    },
    {
      name: 'conversationId',
      label: 'Conversation ID',
      type: 'short-input',
      badge: 'key',
      badgeColor: '#0ea5e9',
      description:
        'A unique identifier that groups messages into a conversation. Messages with the same Conversation ID share history. Use a user ID, session token, or any string that uniquely identifies the conversation thread.',
      tip: 'Use dynamic values like {{userId}} or {{sessionId}} from upstream blocks to create per-user conversation threads.',
      alert: 'Required when Memory is set to Conversation, Sliding window (messages), or Sliding window (tokens).',
    },
    {
      name: 'slidingWindowSize',
      label: 'Sliding Window Size',
      type: 'short-input',
      badge: 'messages',
      badgeColor: '#06b6d4',
      description:
        'The number of most recent messages to retain in the conversation history. When the history exceeds this count, the oldest messages are discarded. For example, a value of 10 keeps the last 10 messages (5 user + 5 assistant exchanges).',
      tip: 'Start with 10–20 messages for typical chatbots. Increase for tasks that need more context, decrease to reduce token costs.',
    },
    {
      name: 'slidingWindowTokens',
      label: 'Max Tokens (Window)',
      type: 'short-input',
      badge: 'tokens',
      badgeColor: '#06b6d4',
      description:
        'The maximum number of tokens the conversation history may occupy. Messages are trimmed from the oldest until the total fits within this budget. This gives you fine-grained control over LLM context usage and cost.',
      tip: 'Check your model\'s context window size. For GPT-4o (128K context), a sliding window of 4000–8000 tokens is a good starting point.',
    },
    {
      name: 'temperature',
      label: 'Temperature',
      type: 'slider',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description:
        'Controls the randomness of the LLM output. Lower values (0–0.3) produce more focused, deterministic responses. Higher values (0.7–2.0) produce more creative, varied responses.',
      defaultValue: '0.3',
      tip: 'Use 0 for factual extraction and structured output. Use 0.7+ for creative writing and brainstorming.',
    },
    {
      name: 'maxTokens',
      label: 'Max Output Tokens',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description:
        'The maximum number of tokens the LLM is allowed to generate in its response. If the response would exceed this limit, it is truncated. Leave empty for the model\'s default limit.',
      tip: 'Set this to avoid unexpectedly long (and expensive) responses. 4096 is a good default for most tasks.',
    },
    {
      name: 'responseFormat',
      label: 'Response Format',
      type: 'code',
      badge: 'schema',
      badgeColor: '#6366f1',
      description:
        'A JSON Schema that constrains the LLM\'s output structure. When set, the model is forced to return a JSON object matching this schema. Downstream blocks can access individual fields at the root level.',
      tip: 'Use the wand icon to auto-generate a schema from a natural language description like "Extract name, email, and phone number".',
    },
    {
      name: 'strictOutput',
      label: 'Strict JSON',
      type: 'switch',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description:
        'When enabled, uses the provider\'s strict structured-output mode (e.g., OpenAI json_schema + strict:true). This guarantees the output exactly matches the Response Format schema, but may increase latency.',
      alert: 'Only applies when a Response Format schema is set. Not all models support strict mode.',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description:
        'Override the provider API key for this specific block. If left empty, the key from your LLM Provider Configuration (Settings) is used.',
    },
    {
      name: 'reasoningEffort',
      label: 'Reasoning Effort',
      type: 'dropdown',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Controls how much reasoning the model applies. Higher effort produces better results but costs more tokens and time.',
    },
    {
      name: 'verbosity',
      label: 'Verbosity',
      type: 'dropdown',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Controls how verbose the model\'s response is. "low" gives terse answers, "high" gives detailed explanations.',
    },
    {
      name: 'thinkingLevel',
      label: 'Thinking Level',
      type: 'dropdown',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'For models that support extended thinking (e.g., Claude), controls how much visible chain-of-thought reasoning is shown.',
    },
  ],
})

registerBlockDocs('function', {
  title: 'Function',
  icon: '⚡',
  category: 'core',
  categoryColor: '#FF402F',
  summary:
    'Execute custom JavaScript or Python code. The function receives `input` (the upstream block\'s output) and must return a result. Great for data transformation, validation, and custom logic.',
  tip: 'Use `return` to pass the result to downstream blocks. The `input` variable contains the previous block\'s output.',
  fields: [
    {
      name: 'language',
      label: 'Language',
      type: 'dropdown',
      badge: 'runtime',
      badgeColor: '#FF402F',
      description: 'The programming language for the code block. JavaScript runs in a sandboxed V8 isolate; Python runs in a subprocess.',
      defaultValue: 'javascript',
    },
    {
      name: 'code',
      label: 'Code',
      type: 'code',
      badge: 'editor',
      badgeColor: '#FF402F',
      description:
        'The function body. Has access to `input` (the upstream data). Must return the result that downstream blocks will receive. Use the wand icon to generate code from a natural language description.',
      tip: 'Keep functions small and focused. For complex logic, break it into multiple Function blocks chained together.',
    },
  ],
})

registerBlockDocs('condition', {
  title: 'Condition',
  icon: '🔀',
  category: 'core',
  categoryColor: '#FF752F',
  summary:
    'Evaluate one or more conditions to determine which path the workflow takes. Supports AND/OR logic with comparison operators.',
  fields: [
    {
      name: 'conditions',
      label: 'Conditions',
      type: 'condition-input',
      badge: 'logic',
      badgeColor: '#FF752F',
      description:
        'Define conditions using field references, comparison operators (equals, not equals, contains, greater than, etc.), and values. Multiple conditions can be combined with AND/OR logic.',
    },
  ],
})

registerBlockDocs('router_v2', {
  title: 'Router',
  icon: '🔀',
  category: 'core',
  categoryColor: '#28C43F',
  summary:
    'Intelligently routes workflow execution to different paths based on context analysis. An LLM evaluates the context and chooses the best-matching route.',
  tip: 'Write clear, specific descriptions for each route. Route descriptions should be mutually exclusive when possible.',
  fields: [
    {
      name: 'context',
      label: 'Context',
      type: 'long-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'The text or data the LLM will analyze to determine which route to take. Use template variables to inject dynamic content.',
    },
    {
      name: 'routes',
      label: 'Routes',
      type: 'router-input',
      badge: 'paths',
      badgeColor: '#28C43F',
      description: 'Define named routes with descriptions. The LLM reads each description and selects the best match for the given context.',
    },
    {
      name: 'model',
      label: 'Model',
      type: 'combobox',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'The LLM model used for route classification. Faster models work well here since routing is a simpler task.',
      tip: 'Use a smaller, faster model (e.g., Haiku, Flash, Mini) for routing — it\'s a classification task that doesn\'t need heavy reasoning.',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Override the provider API key for this block.',
    },
  ],
})

registerBlockDocs('api', {
  title: 'API',
  icon: '🌐',
  category: 'core',
  categoryColor: '#2F55FF',
  summary:
    'Make HTTP requests to external APIs. Supports all common methods (GET, POST, PUT, DELETE, PATCH) with customizable headers, query parameters, and request body.',
  fields: [
    {
      name: 'url',
      label: 'URL',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'The full URL to call. Supports template variables like {{baseUrl}}/api/users.',
    },
    {
      name: 'method',
      label: 'Method',
      type: 'dropdown',
      badge: 'HTTP',
      badgeColor: '#2F55FF',
      required: true,
      description: 'The HTTP method: GET (read), POST (create), PUT (replace), DELETE (remove), PATCH (partial update).',
    },
    {
      name: 'params',
      label: 'Query Parameters',
      type: 'table',
      description: 'Key-value pairs appended to the URL as query string parameters (e.g., ?page=1&limit=10).',
    },
    {
      name: 'headers',
      label: 'Headers',
      type: 'table',
      description: 'HTTP request headers. Common examples: Authorization, Content-Type, Accept.',
      tip: 'For Bearer token auth, add a header with key "Authorization" and value "Bearer {{token}}".',
    },
    {
      name: 'body',
      label: 'Body',
      type: 'code',
      badge: 'JSON',
      badgeColor: '#6366f1',
      description: 'The request body as JSON. Only used for POST, PUT, and PATCH requests.',
    },
    {
      name: 'timeout',
      label: 'Timeout',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Maximum time to wait for a response (in milliseconds). The request fails if exceeded.',
    },
    {
      name: 'retries',
      label: 'Retries',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Number of times to retry the request on failure. Uses exponential backoff between retries.',
    },
  ],
})

registerBlockDocs('response', {
  title: 'Response',
  icon: '📤',
  category: 'core',
  categoryColor: '#2F55FF',
  summary:
    'Define the workflow\'s HTTP response when triggered via webhook. Configure the response body, status code, and headers.',
  fields: [
    {
      name: 'dataMode',
      label: 'Data Mode',
      type: 'dropdown',
      badge: 'format',
      badgeColor: '#2F55FF',
      description: '"Builder" provides a visual form for structuring the response. "Editor" gives you a raw JSON code editor.',
      defaultValue: 'structured',
    },
    {
      name: 'builderData',
      label: 'Builder Data',
      type: 'response-format',
      description: 'Visual builder for the response payload. Define fields with types and values.',
    },
    {
      name: 'data',
      label: 'Data (JSON)',
      type: 'code',
      description: 'Raw JSON response body. Use template variables to inject dynamic data.',
    },
    {
      name: 'status',
      label: 'Status Code',
      type: 'short-input',
      badge: 'HTTP',
      badgeColor: '#22c55e',
      description: 'HTTP status code (e.g., 200 for success, 201 for created, 400 for bad request, 404 for not found).',
    },
    {
      name: 'headers',
      label: 'Headers',
      type: 'table',
      description: 'HTTP response headers. Add Content-Type, Cache-Control, CORS headers, etc.',
    },
  ],
})

registerBlockDocs('loop', {
  title: 'Loop',
  icon: '🔁',
  category: 'core',
  categoryColor: '#1F9D7A',
  summary:
    'A container block that repeats its child blocks. Supports three modes: fixed iterations (For), iterating over an array (ForEach), and condition-based looping (While).',
  tip: 'Drag blocks inside the loop container to include them in the iteration. Each iteration receives the current index/item.',
  fields: [
    {
      name: 'loopType',
      label: 'Loop Type',
      type: 'dropdown',
      badge: 'mode',
      badgeColor: '#1F9D7A',
      description: '"For" runs N times. "ForEach" iterates over each item in an array. "While" repeats as long as a condition is true.',
      defaultValue: 'for',
    },
    {
      name: 'iterations',
      label: 'Iterations',
      type: 'short-input',
      badge: 'count',
      badgeColor: '#1F9D7A',
      required: true,
      description: 'Number of times to execute the loop body. Only used in "For" mode.',
    },
    {
      name: 'collection',
      label: 'Collection',
      type: 'long-input',
      badge: 'array',
      badgeColor: '#0ea5e9',
      required: true,
      description: 'The array to iterate over. Use a template variable like {{agent1.items}} to reference upstream data. Only used in "ForEach" mode.',
    },
    {
      name: 'whileCondition',
      label: 'While Condition',
      type: 'long-input',
      badge: 'expression',
      badgeColor: '#f59e0b',
      required: true,
      description: 'A JavaScript expression that returns true/false. The loop continues as long as this evaluates to true. Only used in "While" mode.',
    },
    {
      name: 'maxIterations',
      label: 'Max Iterations',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Safety upper bound to prevent infinite loops. The loop stops after this many iterations even if the condition is still true.',
    },
  ],
})

registerBlockDocs('parallel', {
  title: 'Parallel',
  icon: '⚡',
  category: 'core',
  categoryColor: '#6E7FFF',
  summary:
    'A container block that runs its children concurrently. In "Concurrent" mode, all branches finish before proceeding. In "Race" mode, the first branch to finish wins.',
  fields: [
    {
      name: 'mode',
      label: 'Mode',
      type: 'dropdown',
      badge: 'execution',
      badgeColor: '#6E7FFF',
      description: '"Concurrent" waits for all branches to complete and collects all results. "Race" proceeds as soon as the first branch finishes.',
      defaultValue: 'all',
    },
    {
      name: 'maxConcurrency',
      label: 'Max Concurrency',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Maximum number of branches to run simultaneously. Set to 0 for unlimited. Useful for rate-limiting API calls.',
    },
  ],
})

registerBlockDocs('if_else', {
  title: 'If / Else',
  icon: '🔀',
  category: 'core',
  categoryColor: '#F59E0B',
  summary:
    'Evaluates a JavaScript expression and routes data to the "true" or "false" output path based on the result.',
  fields: [
    {
      name: 'expression',
      label: 'Expression',
      type: 'code',
      badge: 'JS',
      badgeColor: '#F59E0B',
      description:
        'A JavaScript expression that should return true or false. The `input` variable contains the upstream block\'s output. Examples: `input?.valid === true`, `input.score > 0.8`.',
      tip: 'Keep expressions simple. For complex logic, use a Function block upstream and check its result here.',
    },
  ],
})

registerBlockDocs('if_elseif_else', {
  title: 'If / Else-If / Else',
  icon: '🔀',
  category: 'core',
  categoryColor: '#F59E0B',
  summary:
    'Multi-branch conditional routing. Evaluates conditions top-to-bottom and routes data to the first matching branch. Falls through to "else" if none match.',
  fields: [
    {
      name: 'branches',
      label: 'Branches',
      type: 'slider',
      badge: 'count',
      badgeColor: '#F59E0B',
      description: 'Number of condition branches (1–8). Each branch gets its own output handle on the node.',
      defaultValue: '2',
    },
    {
      name: 'conditions',
      label: 'Conditions',
      type: 'table',
      badge: 'expressions',
      badgeColor: '#F59E0B',
      description: 'A table of Label + Expression pairs. Conditions are evaluated top-to-bottom; the first truthy one wins. The "else" branch catches everything that didn\'t match.',
    },
  ],
})

registerBlockDocs('switch', {
  title: 'Switch',
  icon: '🎛️',
  category: 'core',
  categoryColor: '#0EA5E9',
  summary:
    'Pattern-match a value against multiple cases. Similar to a switch/case statement — evaluates an expression and routes to the matching case.',
  fields: [
    {
      name: 'keyExpr',
      label: 'Key Expression',
      type: 'short-input',
      badge: 'JS',
      badgeColor: '#0EA5E9',
      description: 'A JavaScript expression whose result is compared against the case values. Example: `input.kind` or `input.status`.',
    },
    {
      name: 'caseCount',
      label: 'Case Count',
      type: 'slider',
      badge: 'count',
      badgeColor: '#0EA5E9',
      description: 'Number of cases to match against (1–12). A "default" output is always available.',
      defaultValue: '3',
    },
    {
      name: 'cases',
      label: 'Cases',
      type: 'table',
      badge: 'patterns',
      badgeColor: '#0EA5E9',
      description: 'A table of Match + Label pairs. "Match" is compared as a string against the key expression result.',
    },
  ],
})

registerBlockDocs('for_loop', {
  title: 'For Loop',
  icon: '🔁',
  category: 'core',
  categoryColor: '#8B5CF6',
  summary: 'Execute a block chain a fixed number of times. Each iteration exposes the current index as a variable.',
  fields: [
    {
      name: 'count',
      label: 'Count',
      type: 'short-input',
      badge: 'iterations',
      badgeColor: '#8B5CF6',
      description: 'Number of iterations to run.',
      defaultValue: '10',
    },
    {
      name: 'indexVar',
      label: 'Index Variable',
      type: 'short-input',
      description: 'Name of the loop variable exposed inside the body. Defaults to "i".',
      defaultValue: 'i',
    },
    {
      name: 'maxConcurrency',
      label: 'Max Concurrency',
      type: 'slider',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'How many iterations can run in parallel. Set to 1 for sequential execution.',
      defaultValue: '1',
    },
  ],
})

registerBlockDocs('for_each', {
  title: 'For Each',
  icon: '🔁',
  category: 'core',
  categoryColor: '#6366F1',
  summary: 'Iterate over each item in an array. Each iteration receives the current item and can process it independently.',
  fields: [
    {
      name: 'collection',
      label: 'Collection',
      type: 'short-input',
      badge: 'array',
      badgeColor: '#6366F1',
      description: 'Reference to the array to iterate over. Use angle-bracket syntax: <agent1.items>.',
    },
    {
      name: 'itemVar',
      label: 'Item Variable',
      type: 'short-input',
      description: 'Name of the variable that holds the current item. Defaults to "item".',
      defaultValue: 'item',
    },
    {
      name: 'maxConcurrency',
      label: 'Max Concurrency',
      type: 'slider',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'How many items are processed in parallel. Set to 1 for sequential.',
      defaultValue: '1',
    },
  ],
})

registerBlockDocs('variables', {
  title: 'Variables',
  icon: '📦',
  category: 'core',
  categoryColor: '#8B5CF6',
  summary:
    'Set or update workflow variables. Variables are accessible by all downstream blocks and persist throughout the workflow run.',
  fields: [
    {
      name: 'variables',
      label: 'Variables',
      type: 'variables-input',
      badge: 'assignments',
      badgeColor: '#8B5CF6',
      description: 'Define variable name-value pairs. Values can be static or use template references to upstream data.',
    },
  ],
})

registerBlockDocs('json_map', {
  title: 'JSON Map',
  icon: '🗺️',
  category: 'core',
  categoryColor: '#0ea5e9',
  summary:
    'Extract and reshape JSON data using JSONPath expressions. Define key-path mappings to pull specific fields from complex JSON structures.',
  fields: [
    {
      name: 'mappings',
      label: 'Mappings',
      type: 'code',
      badge: 'JSONPath',
      badgeColor: '#0ea5e9',
      description: 'A JSON array of {key, path} objects. Each "path" is a JSONPath expression (e.g., "$.data.items[*].name") and "key" is the output field name.',
      tip: 'Use "$" to reference the root of the input. "$.users[0].name" extracts the first user\'s name.',
    },
  ],
})

registerBlockDocs('text_template', {
  title: 'Text Template',
  icon: '📝',
  category: 'core',
  categoryColor: '#f59e0b',
  summary: 'Render a text template with {{placeholder}} variables replaced by values from the input.',
  fields: [
    {
      name: 'template',
      label: 'Template',
      type: 'code',
      badge: 'mustache',
      badgeColor: '#f59e0b',
      description: 'A text string with {{placeholder}} variables. Each placeholder is replaced with the matching field from the input object.',
      tip: 'Use {{input}} for the raw input value, or {{input.fieldName}} to access nested fields.',
    },
  ],
})

registerBlockDocs('json_path', {
  title: 'JSON Path',
  icon: '🎯',
  category: 'core',
  categoryColor: '#8b5cf6',
  summary: 'Extract a value from a JSON object using a JSONPath expression.',
  fields: [
    {
      name: 'path',
      label: 'Path',
      type: 'short-input',
      badge: 'JSONPath',
      badgeColor: '#8b5cf6',
      description: 'A JSONPath expression like "$.data.items[0].name". Use "$" for the root.',
      defaultValue: '$',
    },
    {
      name: 'fallback',
      label: 'Fallback',
      type: 'short-input',
      badge: 'advanced',
      badgeColor: '#64748b',
      advanced: true,
      description: 'Value returned if the path doesn\'t match anything in the input.',
    },
  ],
})

registerBlockDocs('save_to_files', {
  title: 'Save to Files',
  icon: '💾',
  category: 'core',
  categoryColor: '#0EA5E9',
  summary: 'Save workflow output to a file on the server. Leave the path blank for preview-only mode.',
  fields: [
    {
      name: 'path',
      label: 'Path',
      type: 'short-input',
      description: 'The output file path. Leave blank to preview without saving.',
    },
    {
      name: 'format',
      label: 'Format',
      type: 'dropdown',
      badge: 'output',
      badgeColor: '#0EA5E9',
      description: '"JSON (pretty)" formats the output with indentation. "Raw string" writes the value as-is.',
      defaultValue: 'json',
    },
    {
      name: 'overwrite',
      label: 'Overwrite',
      type: 'switch',
      description: 'When enabled, overwrites the file if it already exists.',
      defaultValue: 'true',
    },
  ],
})

registerBlockDocs('show_preview', {
  title: 'Show Preview',
  icon: '👁️',
  category: 'core',
  categoryColor: '#14B8A6',
  summary: 'Display a live preview of the upstream block\'s output in the canvas. Useful for debugging and visualizing data flow.',
  fields: [
    {
      name: 'label',
      label: 'Label',
      type: 'short-input',
      description: 'The heading shown above the preview panel.',
      defaultValue: 'Final output',
    },
  ],
})

/* ═══════════════════════════════════════════════════════════════════════
 *  TOOL BLOCKS
 * ═══════════════════════════════════════════════════════════════════════ */

registerBlockDocs('postgresql', {
  title: 'PostgreSQL',
  icon: '🐘',
  category: 'tool',
  categoryColor: '#336791',
  summary:
    'Connect to a PostgreSQL database and execute queries, insert/update/delete data, or introspect the schema.',
  alert: 'Database credentials are stored in the workflow. Use environment variables for production deployments.',
  fields: [
    {
      name: 'operation',
      label: 'Operation',
      type: 'dropdown',
      badge: 'action',
      badgeColor: '#336791',
      description: 'The database operation: Query (SELECT), Insert, Update, Delete, Execute Raw SQL, or Introspect Schema.',
      defaultValue: 'query',
    },
    {
      name: 'host',
      label: 'Host',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'The database server hostname or IP address.',
    },
    {
      name: 'port',
      label: 'Port',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'The PostgreSQL port. Default is 5432.',
      defaultValue: '5432',
    },
    {
      name: 'database',
      label: 'Database',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'The name of the database to connect to.',
    },
    {
      name: 'username',
      label: 'Username',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Database user.',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'short-input',
      badge: 'secret',
      badgeColor: '#ef4444',
      required: true,
      description: 'Database password. Stored securely.',
    },
    {
      name: 'ssl',
      label: 'SSL',
      type: 'dropdown',
      description: 'SSL connection mode: Disabled, Required, or Preferred.',
      defaultValue: 'preferred',
    },
    {
      name: 'query',
      label: 'Query / SQL',
      type: 'code',
      badge: 'SQL',
      badgeColor: '#336791',
      description: 'The SQL query or statement to execute. Use parameterized queries for safety.',
      tip: 'Always use parameterized queries to prevent SQL injection. Never concatenate user input directly into SQL.',
    },
    {
      name: 'table',
      label: 'Table',
      type: 'short-input',
      description: 'Target table name for Insert, Update, and Delete operations.',
    },
    {
      name: 'data',
      label: 'Data',
      type: 'code',
      badge: 'JSON',
      badgeColor: '#6366f1',
      description: 'JSON data for Insert and Update operations. Must be an object or array of objects.',
    },
    {
      name: 'where',
      label: 'WHERE Clause',
      type: 'short-input',
      badge: 'filter',
      badgeColor: '#f59e0b',
      description: 'SQL WHERE clause for Update and Delete operations (e.g., "id = 42").',
    },
  ],
})

registerBlockDocs('mcp', {
  title: 'MCP Tool',
  icon: '🔧',
  category: 'tool',
  categoryColor: '#181C1E',
  summary:
    'Call a tool from an MCP (Model Context Protocol) server. First configure MCP servers in Settings, then select a server and tool here.',
  tip: 'MCP tools are dynamically discovered from the connected server. The arguments form auto-generates based on the tool\'s schema.',
  fields: [
    {
      name: 'server',
      label: 'Server',
      type: 'mcp-server-selector',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Select an MCP server from the ones configured in Settings → MCP Servers.',
    },
    {
      name: 'tool',
      label: 'Tool',
      type: 'mcp-tool-selector',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Select a tool exposed by the chosen MCP server. Tools are discovered dynamically.',
    },
    {
      name: 'arguments',
      label: 'Arguments',
      type: 'mcp-dynamic-args',
      badge: 'dynamic',
      badgeColor: '#06b6d4',
      description: 'Input arguments for the selected tool. The form is auto-generated from the tool\'s JSON schema. Use template variables to pass dynamic data.',
    },
  ],
})

registerBlockDocs('smtp', {
  title: 'SMTP Email',
  icon: '📧',
  category: 'tool',
  categoryColor: '#2D3748',
  summary:
    'Send emails via SMTP. Configure your email server credentials and compose the email with dynamic content from upstream blocks.',
  fields: [
    {
      name: 'smtpHost',
      label: 'SMTP Host',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'The SMTP server hostname (e.g., smtp.gmail.com, smtp.sendgrid.net).',
    },
    {
      name: 'smtpPort',
      label: 'SMTP Port',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'SMTP port number. Common values: 587 (TLS), 465 (SSL), 25 (unencrypted).',
      defaultValue: '587',
    },
    {
      name: 'smtpUsername',
      label: 'Username',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'SMTP authentication username (usually your email address).',
    },
    {
      name: 'smtpPassword',
      label: 'Password',
      type: 'short-input',
      badge: 'secret',
      badgeColor: '#ef4444',
      required: true,
      description: 'SMTP authentication password or app-specific password.',
    },
    {
      name: 'from',
      label: 'From',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Sender email address.',
    },
    {
      name: 'to',
      label: 'To',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Recipient email address(es). Separate multiple with commas.',
    },
    {
      name: 'subject',
      label: 'Subject',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Email subject line. Supports template variables.',
    },
    {
      name: 'body',
      label: 'Body',
      type: 'long-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Email body content. Can be plain text or HTML depending on Content Type.',
    },
    {
      name: 'contentType',
      label: 'Content Type',
      type: 'dropdown',
      description: '"Plain Text" for simple emails. "HTML" for formatted emails with links, images, etc.',
      defaultValue: 'text',
    },
  ],
})

/* ═══════════════════════════════════════════════════════════════════════
 *  TRIGGER BLOCKS
 * ═══════════════════════════════════════════════════════════════════════ */

registerBlockDocs('webhook_request', {
  title: 'Webhook Request',
  icon: '🔔',
  category: 'trigger',
  categoryColor: '#0EA5E9',
  summary:
    'Triggers the workflow when an HTTP request is received at the webhook URL. The request body, headers, and query parameters are passed to downstream blocks.',
  tip: 'Use this to build API endpoints powered by your workflow. The workflow responds with whatever the Response block returns.',
  fields: [
    {
      name: 'webhook',
      label: 'Webhook Config',
      type: 'webhook-config',
      badge: 'endpoint',
      badgeColor: '#0EA5E9',
      description: 'Auto-generated webhook URL. Copy and share this URL with external systems that need to trigger this workflow.',
    },
    {
      name: 'method',
      label: 'Method',
      type: 'dropdown',
      badge: 'HTTP',
      badgeColor: '#0EA5E9',
      description: 'The HTTP method this webhook listens for. POST is most common for receiving data payloads.',
      defaultValue: 'POST',
    },
  ],
})

registerBlockDocs('schedule', {
  title: 'Schedule',
  icon: '⏰',
  category: 'trigger',
  categoryColor: '#F59E0B',
  summary:
    'Triggers the workflow automatically on a recurring schedule defined by a cron expression.',
  fields: [
    {
      name: 'cron',
      label: 'Cron Expression',
      type: 'short-input',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description:
        'A standard cron expression defining the schedule. Format: "minute hour day-of-month month day-of-week". Examples: "0 */5 * * *" (every 5 hours), "0 9 * * 1-5" (weekdays at 9 AM).',
      tip: 'Use crontab.guru to build and validate cron expressions.',
    },
    {
      name: 'timezone',
      label: 'Timezone',
      type: 'short-input',
      description: 'IANA timezone for the schedule (e.g., "America/New_York", "Europe/London"). Defaults to UTC.',
      defaultValue: 'UTC',
    },
  ],
})

registerBlockDocs('wait', {
  title: 'Wait',
  icon: '⏳',
  category: 'trigger',
  categoryColor: '#6B7280',
  summary:
    'Pause the workflow execution for a specified duration or until a specific timestamp.',
  fields: [
    {
      name: 'mode',
      label: 'Mode',
      type: 'dropdown',
      badge: 'timing',
      badgeColor: '#6B7280',
      description: '"Duration" waits for a fixed number of milliseconds. "Until" waits until a specific ISO timestamp.',
      defaultValue: 'duration',
    },
    {
      name: 'duration',
      label: 'Duration (ms)',
      type: 'short-input',
      badge: 'milliseconds',
      badgeColor: '#6B7280',
      description: 'Time to wait in milliseconds (e.g., 5000 for 5 seconds, 60000 for 1 minute).',
    },
    {
      name: 'until',
      label: 'Until',
      type: 'short-input',
      badge: 'ISO timestamp',
      badgeColor: '#6B7280',
      description: 'An ISO 8601 timestamp to wait until (e.g., "2026-04-20T09:00:00Z").',
    },
  ],
})

registerBlockDocs('table', {
  title: 'Table',
  icon: '📊',
  category: 'trigger',
  categoryColor: '#14B8A6',
  summary:
    'Read, insert, or update rows in a built-in data table. Tables provide simple persistent storage within your workspace.',
  fields: [
    {
      name: 'operation',
      label: 'Operation',
      type: 'dropdown',
      badge: 'action',
      badgeColor: '#14B8A6',
      description: '"Read rows" queries existing data. "Insert rows" adds new records. "Update rows" modifies existing records.',
      defaultValue: 'read',
    },
    {
      name: 'table',
      label: 'Table',
      type: 'table-selector',
      badge: 'required',
      badgeColor: '#ef4444',
      required: true,
      description: 'Select the table to operate on from your workspace.',
    },
    {
      name: 'filters',
      label: 'Filters',
      type: 'filter-builder',
      description: 'Conditions for filtering rows during Read and Update operations.',
    },
    {
      name: 'sort',
      label: 'Sort',
      type: 'sort-builder',
      description: 'Sort order for Read operations. Define columns and ascending/descending direction.',
    },
    {
      name: 'data',
      label: 'Data',
      type: 'code',
      badge: 'JSON',
      badgeColor: '#6366f1',
      description: 'JSON rows to insert or fields to update. Must be an array of objects for Insert, or an object for Update.',
    },
  ],
})
