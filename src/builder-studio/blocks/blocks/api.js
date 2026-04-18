/** Ported verbatim from sim/apps/sim/blocks/blocks/api.ts. */
import { ApiIcon } from '../../components/icons'
import { IntegrationType } from '../types'

export const ApiBlock = {
  type: 'api',
  name: 'API',
  description: 'Use any API',
  longDescription:
    'Connect to any external API with support for all standard HTTP methods and customizable request parameters.',
  docsLink: 'https://docs.sim.ai/blocks/api',
  category: 'blocks',
  integrationType: IntegrationType.DeveloperTools,
  tags: ['automation', 'webhooks'],
  bgColor: '#2F55FF',
  icon: ApiIcon,
  subBlocks: [
    { id: 'url', title: 'URL', type: 'short-input', placeholder: 'Enter URL', required: true },
    {
      id: 'method',
      title: 'Method',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'GET', id: 'GET' },
        { label: 'POST', id: 'POST' },
        { label: 'PUT', id: 'PUT' },
        { label: 'DELETE', id: 'DELETE' },
        { label: 'PATCH', id: 'PATCH' },
      ],
    },
    { id: 'params', title: 'Query Params', type: 'table', columns: ['Key', 'Value'] },
    { id: 'headers', title: 'Headers', type: 'table', columns: ['Key', 'Value'] },
    {
      id: 'body',
      title: 'Body',
      type: 'code',
      placeholder: 'Enter JSON...',
      language: 'json',
    },
    {
      id: 'timeout',
      title: 'Timeout (ms)',
      type: 'short-input',
      placeholder: '300000',
      mode: 'advanced',
    },
    { id: 'retries', title: 'Retries', type: 'short-input', placeholder: '0', mode: 'advanced' },
    {
      id: 'retryDelayMs',
      title: 'Retry delay (ms)',
      type: 'short-input',
      placeholder: '500',
      mode: 'advanced',
    },
    {
      id: 'retryMaxDelayMs',
      title: 'Max retry delay (ms)',
      type: 'short-input',
      placeholder: '30000',
      mode: 'advanced',
    },
    {
      id: 'retryNonIdempotent',
      title: 'Retry non-idempotent methods',
      type: 'switch',
      mode: 'advanced',
    },
  ],
  tools: { access: ['http_request'] },
  inputs: {
    url: { type: 'string', description: 'Request URL' },
    method: { type: 'string', description: 'HTTP method' },
    headers: { type: 'json', description: 'Request headers' },
    body: { type: 'json', description: 'Request body data' },
    params: { type: 'json', description: 'URL query parameters' },
    timeout: { type: 'number', description: 'Request timeout in milliseconds' },
    retries: { type: 'number', description: 'Number of retry attempts' },
    retryDelayMs: { type: 'number', description: 'Initial retry delay' },
    retryMaxDelayMs: { type: 'number', description: 'Maximum retry delay' },
    retryNonIdempotent: { type: 'boolean', description: 'Allow retries for POST/PATCH' },
  },
  outputs: {
    data: { type: 'json', description: 'API response data' },
    status: { type: 'number', description: 'HTTP status code' },
    headers: { type: 'json', description: 'HTTP response headers' },
  },
}
