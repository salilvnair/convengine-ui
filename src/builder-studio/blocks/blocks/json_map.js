/**
 * JSON Map block — converts a JSON object into a flat key-value map using
 * user-defined JSONPath expressions.
 *
 * Use case: Upstream returns a complex JSON payload. You want to pluck out
 * specific fields and expose them as `{{key}}` template variables for a
 * downstream Agent's prompt.
 *
 * The user configures a list of mappings:
 *   [ { key: "title", path: "$.article.title" },
 *     { key: "author", path: "$.article.metadata.author" } ]
 *
 * At runtime this block evaluates each JSONPath against the input and
 * produces a flat `{ title: "...", author: "..." }` map.
 */
import { JsonMapIcon } from '../../components/icons'

export const JsonMapBlock = {
  type: 'json_map',
  name: 'JSON Map',
  description: 'Convert JSON to key-value map via JSONPath',
  longDescription:
    'Takes a JSON input and extracts fields using JSONPath expressions into a flat key-value map. ' +
    'The resulting map can be referenced in downstream prompts as {{key}} template variables.',
  category: 'blocks',
  bgColor: '#0ea5e9',
  icon: JsonMapIcon,
  subBlocks: [
    {
      id: 'mappings',
      title: 'Mappings',
      type: 'code',
      language: 'json',
      placeholder: '[\n  { "key": "title", "path": "$.article.title" },\n  { "key": "url",   "path": "$.source.url" }\n]',
      defaultValue: '[\n  { "key": "value", "path": "$" }\n]',
    },
  ],
  inputs: {
    input: { type: 'json', description: 'JSON object to extract fields from' },
  },
  outputs: {
    result: { type: 'json', description: 'Flat key-value map of extracted fields' },
  },
}
