/**
 * If / Else-If / Else — 1 input → N outputs.
 *
 * Output count is driven by `branches` (default 2 intermediate branches,
 * so N = branches + 1 total outputs: branch_1 … branch_N-1 … else).
 *
 * The node card surfaces:
 *  - `branches` — integer stepper (1..8), how many `if` / `else if` arms there are
 *  - `conditions` — table of JS expressions, one row per branch
 *
 * The canvas renders one output handle per arm plus a trailing `else` handle.
 * Evaluation in the client runner is first-match-wins; if nothing matches, the
 * `else` handle fires.
 */
import { ConditionalIcon } from '../../components/icons'

export const IfElseIfElseBlock = {
  type: 'if_elseif_else',
  name: 'If / Else-If / Else',
  description: 'Chain N conditions; first match wins, else fallback',
  category: 'blocks',
  bgColor: '#F59E0B',
  icon: ConditionalIcon,
  subBlocks: [
    {
      id: 'branches',
      title: 'Branch count',
      type: 'slider',
      min: 1,
      max: 8,
      step: 1,
      integer: true,
      defaultValue: 2,
      description: 'Number of if / else-if arms before the `else` fallback.',
    },
    {
      id: 'conditions',
      title: 'Conditions',
      type: 'table',
      columns: ['Label', 'Expression'],
      description: 'One row per branch. Evaluated top-to-bottom; first truthy row wins.',
    },
  ],
  tools: { access: ['condition_evaluate'] },
  inputs: { input: { type: 'json', description: 'Upstream data' } },
  outputs: {
    branch: { type: 'json', description: 'Payload forwarded on the matched branch' },
    else:   { type: 'json', description: 'Payload forwarded when no branch matches' },
  },
  /**
   * Dynamic output handles — read from the node's current `branches` value.
   * Yields ['branch_1', 'branch_2', …, 'else'].
   */
  outputHandlesFromValues(values) {
    const n = Math.max(1, Math.min(8, Number(values?.branches) || 2))
    const arms = Array.from({ length: n }, (_, i) => `branch_${i + 1}`)
    return [...arms, 'else']
  },
}
