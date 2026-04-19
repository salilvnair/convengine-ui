/** Filter block — filter items from an array based on conditions. */
import { ConditionalIcon } from '../../components/icons'

export const FilterBlock = {
  type: 'filter',
  name: 'Filter',
  description: 'Filter items based on conditions',
  longDescription:
    'Filters items from an array based on one or more conditions. Items that match the conditions go to the "kept" output, and items that don\'t match go to the "rejected" output. Supports complex filter expressions with AND/OR logic.',
  category: 'blocks',
  bgColor: '#06B6D4',
  icon: ConditionalIcon,
  subBlocks: [
    {
      id: 'conditions',
      title: 'Filter Conditions',
      type: 'code',
      placeholder: '// Return true to keep the item\n(item) => item.status === "active"',
      language: 'javascript',
      required: true,
    },
    {
      id: 'mode',
      title: 'Logic',
      type: 'dropdown',
      options: [
        { label: 'Keep matches', id: 'keep' },
        { label: 'Remove matches', id: 'remove' },
      ],
    },
    { id: 'limit', title: 'Max Items', type: 'short-input', placeholder: 'No limit', mode: 'advanced' },
  ],
  tools: { access: [] },
  inputs: {
    items: { type: 'json', description: 'Array of items to filter' },
    conditions: { type: 'string', description: 'Filter function or expression' },
    mode: { type: 'string', description: 'Keep or remove matches' },
  },
  outputs: {
    kept: { type: 'json', description: 'Items that matched the filter' },
    rejected: { type: 'json', description: 'Items that did not match' },
    count: { type: 'number', description: 'Number of kept items' },
  },
}
