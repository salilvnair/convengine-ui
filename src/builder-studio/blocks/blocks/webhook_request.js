/** Webhook trigger block — mirrors sim's webhook_request shape. */
import { WebhookIcon } from '../../components/icons'

export const WebhookRequestBlock = {
  type: 'webhook_request',
  name: 'Webhook',
  description: 'Trigger workflow from an incoming webhook',
  longDescription:
    'Registers a webhook URL that starts the workflow when called. The request body, headers, and query params are exposed as outputs.',
  docsLink: 'https://docs.sim.ai/triggers/webhook',
  category: 'triggers',
  bgColor: '#0EA5E9',
  icon: WebhookIcon,
  subBlocks: [
    { id: 'webhook', title: 'Webhook Config', type: 'webhook-config' },
    {
      id: 'method',
      title: 'Method',
      type: 'dropdown',
      options: [
        { label: 'POST', id: 'POST' },
        { label: 'GET', id: 'GET' },
        { label: 'PUT', id: 'PUT' },
        { label: 'PATCH', id: 'PATCH' },
        { label: 'DELETE', id: 'DELETE' },
      ],
      value: () => 'POST',
    },
  ],
  tools: { access: [] },
  inputs: {
    method: { type: 'string', description: 'Expected HTTP method' },
  },
  outputs: {
    body: { type: 'json', description: 'Request body' },
    headers: { type: 'json', description: 'Request headers' },
    query: { type: 'json', description: 'Query parameters' },
  },
}
