/**
 * Mapper block — type conversion utility.
 *
 * Converts values between types: string→json, json→string, string→number, etc.
 * Consumer-owned responsibility: place a Mapper between two nodes when their
 * port types don't match natively.
 */
import { MapperIcon } from '../../components/icons'

export const MapperBlock = {
  type: 'mapper',
  name: 'Mapper',
  description: 'Convert between types',
  longDescription:
    'Converts a value from one type to another. Use it to bridge nodes whose output/input types ' +
    'don\'t match — for example, parsing a JSON string into an object, or stringifying an object for a text prompt.',
  category: 'blocks',
  bgColor: '#14b8a6',
  icon: MapperIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'JSON Parse (string → json)', id: 'json_parse' },
        { label: 'JSON Stringify (json → string)', id: 'json_stringify' },
        { label: 'To Number', id: 'to_number' },
        { label: 'To Boolean', id: 'to_boolean' },
        { label: 'To String', id: 'to_string' },
        { label: 'Merge Fields (add keys to input obj)', id: 'merge_fields' },
        { label: 'Skill', id: 'skill' },
      ],
      value: () => 'json_parse',
    },
    {
      id: 'fields',
      title: 'Fields to merge',
      type: 'table',
      columns: ['Key', 'Value'],
      description: 'Key/value pairs to add or override on the incoming object.',
      value: () => [],
      required: { field: 'mode', value: ['merge_fields'] },
      condition: { field: 'mode', value: ['merge_fields'] },
    },
    {
      id: 'skillId',
      title: 'Skill',
      type: 'skill-picker',
      description: 'Skill to use as transformer. Receives the input value and returns the mapped output.',
      value: () => '',
      required: { field: 'mode', value: ['skill'] },
      condition: { field: 'mode', value: ['skill'] },
    },
  ],
  inputs: {
    input: { type: 'any', description: 'Value to convert' },
  },
  outputs: {
    result: { type: 'any', description: 'Converted value' },
  },
}
