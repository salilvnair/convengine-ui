/** Sort block — sort arrays by a field or expression. */
import { TableIcon } from '../../components/icons'

export const SortBlock = {
  type: 'sort',
  name: 'Sort',
  description: 'Sort array items by field or expression',
  longDescription:
    'Sorts an array of items by a specified field, expression, or custom comparator. Supports ascending/descending order, numeric and string sorting, and multi-key sorting.',
  category: 'blocks',
  bgColor: '#14B8A6',
  icon: TableIcon,
  subBlocks: [
    {
      id: 'sortKey',
      title: 'Sort Key',
      type: 'short-input',
      placeholder: 'name',
      required: true,
    },
    {
      id: 'order',
      title: 'Order',
      type: 'dropdown',
      options: [
        { label: 'Ascending', id: 'asc' },
        { label: 'Descending', id: 'desc' },
      ],
    },
    {
      id: 'type',
      title: 'Sort Type',
      type: 'dropdown',
      options: [
        { label: 'Auto-detect', id: 'auto' },
        { label: 'String', id: 'string' },
        { label: 'Numeric', id: 'number' },
        { label: 'Date', id: 'date' },
      ],
      mode: 'advanced',
    },
  ],
  tools: { access: [] },
  inputs: {
    items: { type: 'json', description: 'Array of items to sort' },
    sortKey: { type: 'string', description: 'Field to sort by' },
    order: { type: 'string', description: 'asc or desc' },
  },
  outputs: {
    sorted: { type: 'json', description: 'Sorted array' },
    count: { type: 'number', description: 'Number of items' },
  },
}
