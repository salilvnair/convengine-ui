/** Switch — dispatch to one of N named branches by matching a key. */
import { RouterIcon } from '../../components/icons'

export const SwitchBlock = {
  type: 'switch',
  name: 'Switch',
  description: 'Route based on a matched case',
  category: 'blocks',
  bgColor: '#0EA5E9',
  icon: RouterIcon,
  subBlocks: [
    {
      id: 'keyExpr',
      title: 'Key expression',
      type: 'short-input',
      placeholder: 'input.kind',
      description: 'JS expression evaluated against the incoming payload.',
    },
    {
      id: 'cases',
      title: 'Cases',
      type: 'table',
      columns: ['Match', 'Label'],
      description: 'One row per case. Evaluation is first-match-wins; final row is "default".',
    },
  ],
  tools: { access: ['switch_dispatch'] },
  inputs: { input: { type: 'json', description: 'Upstream data' } },
  outputs: { case: { type: 'json', description: 'Output carried on the matched branch' } },
}
