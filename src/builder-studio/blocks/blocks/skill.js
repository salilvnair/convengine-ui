/**
 * Skill block — execute a single workspace skill as a standalone node.
 *
 * Unlike the Agent block (which calls an LLM and optionally runs skills as
 * pre-processing tools), this block runs exactly one skill directly —
 * no LLM involved. Input is passed as `{ input: <value> }` params; the
 * skill's return value becomes the node output.
 */
import { SkillsIcon } from '../../components/icons'

export const SkillBlock = {
  type: 'skill',
  name: 'Skill',
  description: 'Execute a workspace skill directly',
  longDescription:
    'Runs a single workspace skill as a standalone node — no LLM required. ' +
    'Select a skill from the dropdown; the node passes its input to the skill ' +
    'and outputs the result as-is. Great for reusable JS logic without wrapping it in an Agent.',
  bestPractices: `
  - The skill receives { input: <upstream value> } as its params argument.
  - The skill's return value is passed directly to downstream nodes.
  - Use a Mapper block if you need to convert the output type before connecting to the next node.
  `,
  category: 'tools',
  bgColor: '#7c3aed',
  icon: SkillsIcon,
  subBlocks: [
    {
      id: 'skillId',
      title: 'Skill',
      type: 'skill-picker',
      placeholder: 'Select a skill...',
      required: true,
    },
  ],
  inputs: {
    input: { type: 'any', description: 'Value passed to the skill as params.input' },
  },
  outputs: {
    result: { type: 'any', description: 'Return value from the skill execution' },
  },
}
