/**
 * Show Preview — canvas-only sink that renders whatever it receives as a
 * live, colorized JSON card body. Ditto Save-to-Files but without the file
 * side-effect: this one exists purely so the final payload of a workflow
 * shows up right on the graph while you iterate.
 *
 * Place it at the very end of a workflow. After each run the card expands
 * inline with the full upstream payload (Postman-style indigo keys / green
 * strings / amber numbers / pink booleans).
 */
import { ResponseIcon as EyeIcon } from '../../components/icons'

export const ShowPreviewBlock = {
  type: 'show_preview',
  name: 'Show Preview',
  description: 'Renders the last received payload inline on the card (no file, no side-effects).',
  category: 'blocks',
  bgColor: '#14B8A6',
  icon: EyeIcon,
  subBlocks: [
    {
      id: 'label',
      title: 'Label',
      type: 'short-input',
      placeholder: 'Final output',
      value: () => 'Final output',
      description: 'Title shown in the preview header on the canvas card.',
    },
    {
      id: '__preview',
      title: 'Preview',
      type: 'json-preview',
      description: 'Latest payload this block received on the last run.',
    },
  ],
  tools: { access: [] },
  inputs: {
    input: { type: 'any', description: 'Upstream payload to display' },
  },
  outputs: {
    payload: { type: 'any', description: 'Pass-through of upstream output' },
  },
}
