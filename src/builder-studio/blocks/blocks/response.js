/** Ported from sim/apps/sim/blocks/blocks/response.ts. */
import { ResponseIcon } from '../../components/icons'

export const ResponseBlock = {
  type: 'response',
  name: 'Response',
  description: 'Send structured API response',
  longDescription:
    'Send build or edit structured responses into a final workflow response.',
  docsLink: 'https://docs.sim.ai/blocks/response',
  category: 'blocks',
  bgColor: '#2F55FF',
  icon: ResponseIcon,
  subBlocks: [
    {
      id: 'dataMode',
      title: 'Response Data Mode',
      type: 'dropdown',
      options: [
        { label: 'Builder', id: 'structured' },
        { label: 'Editor', id: 'json' },
      ],
      value: () => 'structured',
    },
    {
      id: 'builderData',
      title: 'Response Structure',
      type: 'response-format',
      condition: { field: 'dataMode', value: 'structured' },
    },
    {
      id: 'data',
      title: 'Response Data',
      type: 'code',
      placeholder: '{\n  "message": "Hello world"\n}',
      language: 'json',
      condition: { field: 'dataMode', value: 'json' },
    },
    { id: 'status', title: 'Status Code', type: 'short-input', placeholder: '200' },
    { id: 'headers', title: 'Response Headers', type: 'table', columns: ['Key', 'Value'] },
  ],
  tools: { access: [] },
  inputs: {
    dataMode: { type: 'string', description: 'Response data mode' },
    builderData: { type: 'json', description: 'Structured response data' },
    data: { type: 'json', description: 'JSON response body' },
    status: { type: 'number', description: 'HTTP status code' },
    headers: { type: 'json', description: 'Response headers' },
  },
  outputs: {
    data: { type: 'json', description: 'Response data' },
    status: { type: 'number', description: 'HTTP status code' },
    headers: { type: 'json', description: 'Response headers' },
  },
}
