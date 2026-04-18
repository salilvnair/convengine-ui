/** Ported verbatim from sim/apps/sim/blocks/blocks/variables.ts. */
import { VariableIcon } from '../../components/icons'

export const VariablesBlock = {
  type: 'variables',
  name: 'Variables',
  description: 'Set workflow-scoped variables',
  longDescription:
    'Set workflow-scoped variables accessible throughout the workflow using <variable.variableName> syntax. All Variables blocks share the same namespace.',
  bgColor: '#8B5CF6',
  bestPractices: `
  - Variables are workflow-scoped and persist throughout execution.
  - Reference variables using <variable.variableName> syntax in any block.
  `,
  icon: VariableIcon,
  category: 'blocks',
  docsLink: 'https://docs.sim.ai/blocks/variables',
  subBlocks: [
    {
      id: 'variables',
      title: 'Variable Assignments',
      type: 'variables-input',
      description:
        'Select workflow variables and update their values during execution.',
    },
  ],
  tools: { access: [] },
  inputs: {
    variables: { type: 'json', description: 'Array of variable objects with name/value' },
  },
  outputs: {},
}
