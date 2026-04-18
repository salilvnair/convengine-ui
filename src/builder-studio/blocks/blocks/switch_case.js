/**
 * Switch — 1 input → N outputs.
 *
 * Output count is driven by the `cases` slider (1..12) plus a trailing
 * `default` handle. Each case handle is `case_<i>`; the runner matches
 * `keyExpr` against each case's `value`, first-match-wins, falling through
 * to `default` if nothing matches.
 */
import { RouterIcon } from '../../components/icons'

export const SwitchBlock = {
  type: 'switch',
  name: 'Switch',
  description: 'Dispatch to one of N branches by matching a key',
  category: 'blocks',
  bgColor: '#0EA5E9',
  icon: RouterIcon,
  subBlocks: [
    {
      id: 'keyExpr',
      title: 'Key expression',
      type: 'short-input',
      placeholder: 'input.kind',
      description: 'JS expression evaluated against the incoming payload. Stringified for comparison.',
    },
    {
      id: 'caseCount',
      title: 'Case count',
      type: 'slider',
      min: 1,
      max: 12,
      step: 1,
      integer: true,
      defaultValue: 3,
      description: 'How many named case branches. A `default` handle is always added.',
    },
    {
      id: 'cases',
      title: 'Cases',
      type: 'table',
      columns: ['Match', 'Label'],
      description: 'One row per case. Match is compared as a string; label is purely for display.',
    },
  ],
  tools: { access: ['switch_dispatch'] },
  inputs: { input: { type: 'json', description: 'Upstream data' } },
  outputs: {
    case:    { type: 'json', description: 'Payload carried on the matched case branch' },
    default: { type: 'json', description: 'Payload carried when no case matches' },
  },
  outputHandlesFromValues(values) {
    const n = Math.max(1, Math.min(12, Number(values?.caseCount) || 3))
    const cases = Array.from({ length: n }, (_, i) => `case_${i + 1}`)
    return [...cases, 'default']
  },
}
