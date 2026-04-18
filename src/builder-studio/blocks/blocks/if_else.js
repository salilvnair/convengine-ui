/** If / Else — simple boolean branch with `true` and `false` handles. */
import { ConditionalIcon } from '../../components/icons'

export const IfElseBlock = {
  type: 'if_else',
  name: 'If / Else',
  description: 'Branch on a boolean expression',
  category: 'blocks',
  bgColor: '#F59E0B',
  icon: ConditionalIcon,
  subBlocks: [
    {
      id: 'expression',
      title: 'Expression',
      type: 'code',
      language: 'javascript',
      placeholder: '// return true or false\ninput.valid === true',
      description: 'JavaScript expression. Return truthy to take the `true` branch.',
    },
  ],
  tools: { access: ['condition_evaluate'] },
  inputs: { input: { type: 'json', description: 'Upstream data' } },
  outputs: {
    true: { type: 'json', description: 'Output when expression is truthy' },
    false: { type: 'json', description: 'Output when expression is falsy' },
  },
  outputHandles: ['true', 'false'],
}
