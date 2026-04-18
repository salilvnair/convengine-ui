/**
 * Ported from sim/apps/sim/blocks/types.ts
 *
 * JavaScript mirror of sim's block schema. Since convengine-ui is JS-only, types
 * are represented via JSDoc + runtime constants. The SHAPE of every BlockConfig
 * and SubBlockConfig object matches sim's TypeScript definitions byte-for-byte.
 */

/** @typedef {'blocks' | 'tools' | 'triggers'} BlockCategory */

/** @enum {string} */
export const IntegrationType = Object.freeze({
  AI: 'ai',
  Analytics: 'analytics',
  Communication: 'communication',
  CRM: 'crm',
  CustomerSupport: 'customer-support',
  Databases: 'databases',
  Design: 'design',
  DeveloperTools: 'developer-tools',
  Documents: 'documents',
  Ecommerce: 'ecommerce',
  Email: 'email',
  FileStorage: 'file-storage',
  HR: 'hr',
  Other: 'other',
  Productivity: 'productivity',
  Sales: 'sales',
  Search: 'search',
  Security: 'security',
})

/** @enum {string} */
export const AuthMode = Object.freeze({
  OAuth: 'oauth',
  ApiKey: 'api_key',
  BotToken: 'bot_token',
})

/**
 * Complete list of SubBlockType values supported by sim's inspector.
 * The inspector component (panel/SubBlockRenderer) must handle every one.
 */
export const SUB_BLOCK_TYPES = Object.freeze([
  'short-input',
  'long-input',
  'dropdown',
  'combobox',
  'slider',
  'table',
  'code',
  'switch',
  'tool-input',
  'skill-input',
  'checkbox-list',
  'grouped-checkbox-list',
  'condition-input',
  'eval-input',
  'time-input',
  'oauth-input',
  'webhook-config',
  'schedule-info',
  'file-selector',
  'sheet-selector',
  'project-selector',
  'channel-selector',
  'user-selector',
  'folder-selector',
  'knowledge-base-selector',
  'knowledge-tag-filters',
  'document-selector',
  'document-tag-entry',
  'mcp-server-selector',
  'mcp-tool-selector',
  'mcp-dynamic-args',
  'input-format',
  'response-format',
  'filter-builder',
  'sort-builder',
  'file-upload',
  'input-mapping',
  'variables-input',
  'messages-input',
  'workflow-selector',
  'workflow-input-mapper',
  'text',
  'router-input',
  'table-selector',
])

/**
 * @typedef {Object} SubBlockConfig
 * Mirrors sim's SubBlockConfig. Every field optional unless noted.
 * @property {string} id
 * @property {string} [title]
 * @property {string} type  One of SUB_BLOCK_TYPES
 * @property {'basic'|'advanced'|'both'|'trigger'|'trigger-advanced'} [mode]
 * @property {string} [canonicalParamId]
 * @property {'user-or-llm'|'user-only'|'llm-only'|'hidden'} [paramVisibility]
 * @property {boolean|Object|Function} [required]
 * @property {any} [defaultValue]
 * @property {Array|Function} [options]
 * @property {number} [min]
 * @property {number} [max]
 * @property {string[]} [columns]
 * @property {string} [placeholder]
 * @property {boolean} [password]
 * @property {boolean} [readOnly]
 * @property {boolean} [hidden]
 * @property {boolean} [multiple]
 * @property {string} [description]
 * @property {Function} [value]
 * @property {Object|Function} [condition]
 * @property {'javascript'|'json'|'python'} [language]
 * @property {Object} [wandConfig]
 * @property {string[]|Object} [dependsOn]
 * @property {Function} [fetchOptions]
 */

/**
 * @typedef {Object} BlockConfig
 * @property {string} type
 * @property {string} name
 * @property {string} description
 * @property {BlockCategory} category
 * @property {string} [integrationType]
 * @property {string[]} [tags]
 * @property {string} [longDescription]
 * @property {string} [bestPractices]
 * @property {string} [docsLink]
 * @property {string} bgColor
 * @property {Function} icon   React component (BlockIcon)
 * @property {SubBlockConfig[]} subBlocks
 * @property {boolean} [hideFromToolbar]
 * @property {string} [authMode]
 * @property {{access: string[], config?: {tool: Function, params?: Function}}} tools
 * @property {Object} inputs
 * @property {Object} outputs
 * @property {{enabled: boolean, available: string[]}} [triggers]
 */
