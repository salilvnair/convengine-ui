/**
 * Text Template block — string interpolation with {{key}} placeholders.
 *
 * Use case: Build a custom prompt or message from upstream data without
 * needing an Agent block. The user writes a template with {{var}} placeholders
 * and the block substitutes them from the input (if it's a JSON object)
 * or from a single {{input}} token.
 */
import { TextTemplateIcon } from '../../components/icons'

export const TextTemplateBlock = {
  type: 'text_template',
  name: 'Text Template',
  description: 'Interpolate {{vars}} into a template string',
  longDescription:
    'Write a template with {{variable}} placeholders. At runtime the block substitutes ' +
    'each placeholder from the upstream JSON object fields. If the upstream is a plain string, ' +
    'use {{input}} to reference it.',
  category: 'blocks',
  bgColor: '#f59e0b',
  icon: TextTemplateIcon,
  subBlocks: [
    {
      id: 'template',
      title: 'Template',
      type: 'code',
      language: 'plaintext',
      placeholder: 'Title: {{title}}\nAuthor: {{author}}\nSummary: {{input}}',
      defaultValue: '{{input}}',
    },
  ],
  inputs: {
    input: { type: 'json', description: 'JSON object or string — fields become template variables' },
  },
  outputs: {
    result: { type: 'string', description: 'Interpolated text output' },
  },
}
