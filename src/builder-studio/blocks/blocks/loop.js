/** Loop container block — mirrors sim's loop block shape. */
import { LoopIcon } from '../../components/icons'

export const LoopBlock = {
  type: 'loop',
  name: 'Loop',
  description: 'Iterate over items or repeat N times',
  longDescription:
    'Container block that repeats its nested blocks N times or once per item in an input array. Use <loop.index>, <loop.item>, and <loop.items> inside the body.',
  docsLink: 'https://docs.sim.ai/blocks/loop',
  category: 'blocks',
  bgColor: '#1F9D7A',
  icon: LoopIcon,
  subBlocks: [
    {
      id: 'loopType',
      title: 'Loop Type',
      type: 'dropdown',
      options: [
        { label: 'For (N iterations)', id: 'for' },
        { label: 'ForEach (over array)', id: 'forEach' },
        { label: 'While', id: 'while' },
      ],
      value: () => 'for',
    },
    {
      id: 'iterations',
      title: 'Iterations',
      type: 'short-input',
      placeholder: '10',
      condition: { field: 'loopType', value: 'for' },
      required: true,
    },
    {
      id: 'collection',
      title: 'Collection',
      type: 'long-input',
      placeholder: '<block.output.items>',
      condition: { field: 'loopType', value: 'forEach' },
      required: true,
    },
    {
      id: 'whileCondition',
      title: 'While Condition',
      type: 'long-input',
      placeholder: '<block.output.keepGoing> === true',
      condition: { field: 'loopType', value: 'while' },
      required: true,
    },
    {
      id: 'maxIterations',
      title: 'Max Iterations',
      type: 'short-input',
      placeholder: '1000',
      mode: 'advanced',
    },
  ],
  tools: { access: [] },
  inputs: {
    loopType: { type: 'string', description: 'Loop type' },
    iterations: { type: 'number', description: 'Number of iterations' },
    collection: { type: 'json', description: 'Collection to iterate over' },
    whileCondition: { type: 'string', description: 'While-loop predicate' },
    maxIterations: { type: 'number', description: 'Safety upper bound' },
  },
  outputs: {
    iterations: { type: 'number', description: 'Total iterations executed' },
    results: { type: 'array', description: 'Output of each iteration' },
  },
}
