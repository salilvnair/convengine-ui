/**
 * JSON Path block — extract a single value from a JSON object using a
 * JSONPath expression.
 *
 * Use case: Upstream returns `{ data: { items: [ ... ] } }` and you need
 * just `data.items` passed to the next block. Configure path as `$.data.items`.
 */
import { JsonPathIcon } from '../../components/icons'

export const JsonPathBlock = {
  type: 'json_path',
  name: 'JSON Path',
  description: 'Extract a value from JSON using a path expression',
  longDescription:
    'Evaluate a JSONPath expression (e.g. $.data.items[0].name) against the incoming JSON ' +
    'and output the matched value. Supports dot-notation and bracket-notation.',
  category: 'blocks',
  bgColor: '#8b5cf6',
  icon: JsonPathIcon,
  subBlocks: [
    {
      id: 'path',
      title: 'JSONPath',
      type: 'short-input',
      placeholder: '$.data.items[0].name',
      defaultValue: '$',
    },
    {
      id: 'fallback',
      title: 'Fallback',
      type: 'short-input',
      placeholder: 'Value if path not found (optional)',
      mode: 'advanced',
    },
  ],
  inputs: {
    input: { type: 'json', description: 'JSON object to query' },
  },
  outputs: {
    result: { type: 'json', description: 'Extracted value (or fallback)' },
  },
}
