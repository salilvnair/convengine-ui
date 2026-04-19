/** Ported verbatim from sim/apps/sim/blocks/blocks/starter.ts */
import { StartIcon } from '../../components/icons'

export const StarterBlock = {
  type: 'starter',
  name: 'Starter',
  description: 'Start workflow',
  longDescription: 'Initiate your workflow manually with optional structured input.',
  category: 'blocks',
  bgColor: '#2FB3FF',
  icon: StartIcon,
  singleton: true,
  subBlocks: [
    {
      id: 'startWorkflow',
      title: 'Start Workflow',
      type: 'dropdown',
      options: [
        { label: 'Run manually', id: 'manual' },
        { label: 'Chat', id: 'chat' },
      ],
      value: () => 'manual',
    },
    {
      id: 'inputFormat',
      title: 'Input Format',
      type: 'input-format',
      description:
        'Name and Type define your input schema. Value is used only for manual test runs.',
      mode: 'advanced',
      condition: { field: 'startWorkflow', value: 'manual' },
    },
  ],
  tools: { access: [] },
  inputs: {
    input: { type: 'json', description: 'Workflow input data' },
  },
  outputs: {},
}
