/** Parallel container block — mirrors sim's parallel block shape. */
import { ParallelIcon } from '../../components/icons'

export const ParallelBlock = {
  type: 'parallel',
  name: 'Parallel',
  description: 'Run branches concurrently',
  longDescription:
    'Container block that fans out to multiple branches and runs them in parallel, gathering results when all branches complete.',
  docsLink: 'https://docs.sim.ai/blocks/parallel',
  category: 'blocks',
  bgColor: '#6E7FFF',
  icon: ParallelIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Concurrent (wait all)', id: 'all' },
        { label: 'Race (first wins)', id: 'race' },
      ],
      value: () => 'all',
    },
    {
      id: 'maxConcurrency',
      title: 'Max Concurrency',
      type: 'short-input',
      placeholder: '0 (unlimited)',
      mode: 'advanced',
    },
  ],
  tools: { access: [] },
  inputs: {
    mode: { type: 'string', description: 'all | race' },
    maxConcurrency: { type: 'number', description: 'Max simultaneous branches' },
  },
  outputs: {
    results: { type: 'array', description: 'Array of branch outputs' },
    winner: { type: 'json', description: 'First-completed branch output (race mode)' },
  },
}
