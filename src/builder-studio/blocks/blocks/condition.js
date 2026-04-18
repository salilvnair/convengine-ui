/** Ported verbatim from sim/apps/sim/blocks/blocks/condition.ts. */
import { ConditionalIcon } from '../../components/icons'

export const ConditionBlock = {
  type: 'condition',
  name: 'Condition',
  description: 'Add a condition',
  longDescription:
    'This is a core workflow block. Add a condition to the workflow to branch the execution path based on a boolean expression.',
  bestPractices: `
  - Write conditions using standard javascript syntax except referencing outputs of previous blocks using <> syntax.
  `,
  docsLink: 'https://docs.sim.ai/blocks/condition',
  bgColor: '#FF752F',
  icon: ConditionalIcon,
  category: 'blocks',
  subBlocks: [{ id: 'conditions', type: 'condition-input' }],
  tools: { access: [] },
  inputs: {},
  outputs: {
    conditionResult: { type: 'boolean', description: 'Condition result' },
    selectedPath: { type: 'json', description: 'Selected execution path' },
    selectedOption: { type: 'string', description: 'Selected condition option ID' },
  },
}
