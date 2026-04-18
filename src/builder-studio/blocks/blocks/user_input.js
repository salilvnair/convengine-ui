/**
 * User Input block — a runtime prompt. When the workflow runs, the RunModal
 * collects a value for every `user_input` node on the canvas, and forwards
 * the value as the node's output to downstream edges.
 *
 * Unlike `starter` (which has a baked "manual or chat" dropdown), this block
 * is purpose-built for inline runtime input: just a label + placeholder +
 * the kind of input we want (short text / long text / url / number).
 */
import { VariableIcon } from '../../components/icons'

export const UserInputBlock = {
  type: 'user_input',
  name: 'User Input',
  description: 'Prompt user at runtime',
  longDescription:
    'Collect a value from the user when the workflow runs. The value is passed as this node\'s output to the next block.',
  category: 'blocks',
  bgColor: '#FBBF24',
  icon: VariableIcon,
  subBlocks: [
    {
      id: 'label',
      title: 'Label',
      type: 'short-input',
      description: 'Shown next to the input field in the Run dialog.',
      value: () => 'Input',
    },
    {
      id: 'kind',
      title: 'Kind',
      type: 'dropdown',
      options: [
        { label: 'Short text', id: 'short-text' },
        { label: 'Long text', id: 'long-text' },
        { label: 'URL', id: 'url' },
        { label: 'Number', id: 'number' },
      ],
      value: () => 'short-text',
    },
    {
      id: 'placeholder',
      title: 'Placeholder',
      type: 'short-input',
      value: () => '',
    },
    {
      // Promoted from advanced → primary. If this is filled, the Run dock
      // skips the prompt step and auto-runs with this value. Behaves like
      // ComfyUI's "this field IS the input" ergonomics.
      id: 'defaultValue',
      title: 'Value (auto-run)',
      type: 'short-input',
      description:
        'If set, the workflow runs with this value without opening an input dialog.',
      value: () => '',
    },
    {
      id: 'required',
      title: 'Required',
      type: 'switch',
      value: () => true,
    },
  ],
  tools: { access: [] },
  inputs: {},
  outputs: {
    value: { type: 'string', description: 'The value the user typed in the Run dialog.' },
  },
}
