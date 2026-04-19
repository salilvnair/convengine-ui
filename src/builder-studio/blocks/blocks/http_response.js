/** HTTP Response block — send a custom HTTP response (n8n-inspired). */
import { ResponseIcon } from '../../components/icons'

export const HttpResponseBlock = {
  type: 'http_response',
  name: 'HTTP Response',
  description: 'Return a custom HTTP response',
  longDescription:
    'Sends a custom HTTP response with configurable status code, headers, and body. Use after a Webhook trigger to return data to the caller.',
  category: 'blocks',
  bgColor: '#0EA5E9',
  icon: ResponseIcon,
  subBlocks: [
    {
      id: 'statusCode',
      title: 'Status Code',
      type: 'short-input',
      placeholder: '200',
      required: true,
    },
    { id: 'headers', title: 'Response Headers', type: 'table', columns: ['Key', 'Value'] },
    {
      id: 'body',
      title: 'Response Body',
      type: 'code',
      placeholder: '{ "ok": true }',
      language: 'json',
    },
    {
      id: 'contentType',
      title: 'Content-Type',
      type: 'dropdown',
      options: [
        { label: 'application/json', id: 'application/json' },
        { label: 'text/html', id: 'text/html' },
        { label: 'text/plain', id: 'text/plain' },
        { label: 'application/xml', id: 'application/xml' },
      ],
      mode: 'advanced',
    },
  ],
  tools: { access: [] },
  inputs: {
    statusCode: { type: 'number', description: 'HTTP status code' },
    headers: { type: 'json', description: 'Response headers' },
    body: { type: 'any', description: 'Response body' },
    contentType: { type: 'string', description: 'Content-Type header' },
  },
  outputs: {
    sent: { type: 'boolean', description: 'Whether the response was sent' },
  },
}
