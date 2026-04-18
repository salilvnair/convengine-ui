/** ForEach loop — iterate each item of an array/object. */
import { LoopIcon } from '../../components/icons'

export const ForEachBlock = {
  type: 'for_each',
  name: 'ForEach Loop',
  description: 'Iterate each item of a collection',
  category: 'blocks',
  bgColor: '#6366F1',
  icon: LoopIcon,
  subBlocks: [
    { id: 'collection', title: 'Collection (JSON/JSONPath)', type: 'short-input', placeholder: '<agent1.items>' },
    { id: 'itemVar', title: 'Item var', type: 'short-input', placeholder: 'item', defaultValue: 'item' },
    { id: 'maxConcurrency', title: 'Max concurrency', type: 'slider', min: 1, max: 10, step: 1, integer: true, defaultValue: 1, mode: 'advanced' },
  ],
  tools: { access: ['loop_for_each'] },
  inputs: { input: { type: 'json', description: 'Upstream data available inside the loop' } },
  outputs: {
    iterations: { type: 'array', description: 'Per-item outputs' },
    last: { type: 'json', description: 'Output from the final item' },
  },
}
