/** Merge block — combine data from multiple branches (n8n-inspired). */
import { ParallelIcon } from '../../components/icons'

export const MergeBlock = {
  type: 'merge',
  name: 'Merge',
  description: 'Combine data from multiple branches',
  longDescription:
    'Merges data from two or more input branches into a single output. Supports multiple merge strategies: append (concatenate arrays), combine by position, combine by key, or keep only matched items.',
  category: 'blocks',
  bgColor: '#8B5CF6',
  icon: ParallelIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Merge Mode',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'Append', id: 'append' },
        { label: 'Combine by Position', id: 'position' },
        { label: 'Combine by Key', id: 'key' },
        { label: 'Keep Matches', id: 'match' },
        { label: 'Remove Duplicates', id: 'dedupe' },
      ],
    },
    { id: 'mergeKey', title: 'Merge Key', type: 'short-input', placeholder: 'id' },
    {
      id: 'conflictStrategy',
      title: 'On Conflict',
      type: 'dropdown',
      options: [
        { label: 'Keep first', id: 'first' },
        { label: 'Keep last', id: 'last' },
        { label: 'Merge objects', id: 'merge' },
      ],
      mode: 'advanced',
    },
  ],
  tools: { access: [] },
  inputs: {
    input1: { type: 'any', description: 'First input branch' },
    input2: { type: 'any', description: 'Second input branch' },
    mode: { type: 'string', description: 'Merge mode' },
    mergeKey: { type: 'string', description: 'Key field for key-based merge' },
  },
  outputs: {
    merged: { type: 'json', description: 'Merged result' },
    count: { type: 'number', description: 'Number of items in result' },
  },
}
