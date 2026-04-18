/** For loop — run the enclosed sub-flow N times with counter `i`. */
import { LoopIcon } from '../../components/icons'

export const ForLoopBlock = {
  type: 'for_loop',
  name: 'For Loop',
  description: 'Iterate count times (0..n-1)',
  category: 'blocks',
  bgColor: '#8B5CF6',
  icon: LoopIcon,
  subBlocks: [
    { id: 'count', title: 'Count', type: 'short-input', placeholder: '10', defaultValue: 10 },
    { id: 'indexVar', title: 'Index var', type: 'short-input', placeholder: 'i', defaultValue: 'i' },
    { id: 'maxConcurrency', title: 'Max concurrency', type: 'slider', min: 1, max: 10, step: 1, integer: true, defaultValue: 1, mode: 'advanced' },
  ],
  tools: { access: ['loop_for'] },
  inputs: { input: { type: 'json', description: 'Upstream data available inside the loop' } },
  outputs: {
    iterations: { type: 'array', description: 'Results from each iteration' },
    last: { type: 'json', description: 'Output from the final iteration' },
  },
}
