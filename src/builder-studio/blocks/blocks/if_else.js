/**
 * If / Else — 1 input → 2 outputs (`true`, `false`).
 *
 * The expression is evaluated in the client graph-runner; the edge connected
 * to the matching output is the only one that receives the upstream payload.
 */
import { ConditionalIcon } from '../../components/icons'

export const IfElseBlock = {
  type: 'if_else',
  name: 'If / Else',
  description: 'Branch on a boolean expression — true vs false',
  category: 'blocks',
  bgColor: '#F59E0B',
  icon: ConditionalIcon,
  subBlocks: [
    {
      id: 'expression',
      title: 'Condition',
      type: 'code',
      language: 'javascript',
      placeholder: '// return true or false\ninput?.valid === true',
      description: 'JavaScript expression. Return truthy to take the `true` branch, falsy for `false`.',
    },
  ],
  tools: { access: ['condition_evaluate'] },
  inputs: { input: { type: 'json', description: 'Upstream data' } },
  outputs: {
    true:  { type: 'json', description: 'Carries the upstream payload when the expression is truthy' },
    false: { type: 'json', description: 'Carries the upstream payload when the expression is falsy' },
  },
  outputHandles: ['true', 'false'],
}
