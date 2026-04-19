/** Aggregate block — reduce an array to a single value. */
import { CodeIcon } from '../../components/icons'

export const AggregateBlock = {
  type: 'aggregate',
  name: 'Aggregate',
  description: 'Reduce array items to a single value',
  longDescription:
    'Aggregates an array of items into a single value using built-in operations (sum, count, average, min, max, concat) or a custom reducer function. Supports grouping by a key field for multi-group aggregation.',
  category: 'blocks',
  bgColor: '#EC4899',
  icon: CodeIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'Sum', id: 'sum' },
        { label: 'Count', id: 'count' },
        { label: 'Average', id: 'avg' },
        { label: 'Min', id: 'min' },
        { label: 'Max', id: 'max' },
        { label: 'Concatenate', id: 'concat' },
        { label: 'Group By', id: 'group' },
        { label: 'Custom', id: 'custom' },
      ],
    },
    { id: 'field', title: 'Field', type: 'short-input', placeholder: 'e.g. price' },
    { id: 'groupKey', title: 'Group Key', type: 'short-input', placeholder: 'category', mode: 'advanced' },
    {
      id: 'customReducer',
      title: 'Custom Reducer',
      type: 'code',
      placeholder: '(acc, item) => acc + item.value',
      language: 'javascript',
      mode: 'advanced',
    },
    { id: 'initialValue', title: 'Initial Value', type: 'short-input', placeholder: '0', mode: 'advanced' },
  ],
  tools: { access: [] },
  inputs: {
    items: { type: 'json', description: 'Array of items to aggregate' },
    operation: { type: 'string', description: 'Aggregation operation' },
    field: { type: 'string', description: 'Field to aggregate on' },
  },
  outputs: {
    result: { type: 'any', description: 'Aggregated result' },
    count: { type: 'number', description: 'Number of input items' },
  },
}
