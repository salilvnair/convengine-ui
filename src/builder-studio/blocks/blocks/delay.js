/** Delay block — pause workflow execution for a specified duration. */
import { WaitIcon } from '../../components/icons'

export const DelayBlock = {
  type: 'delay',
  name: 'Delay',
  description: 'Pause execution for a set duration',
  longDescription:
    'Pauses workflow execution for a specified duration. Useful for rate-limiting API calls, implementing polling patterns, or adding cooldown periods between operations.',
  category: 'blocks',
  bgColor: '#F59E0B',
  icon: WaitIcon,
  subBlocks: [
    {
      id: 'duration',
      title: 'Duration',
      type: 'short-input',
      placeholder: '1000',
      required: true,
    },
    {
      id: 'unit',
      title: 'Unit',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'Milliseconds', id: 'ms' },
        { label: 'Seconds', id: 's' },
        { label: 'Minutes', id: 'm' },
        { label: 'Hours', id: 'h' },
      ],
      defaultValue: 'ms',
    },
    {
      id: 'resumeCondition',
      title: 'Resume Condition',
      type: 'code',
      placeholder: '// Return true to resume early\nreturn true',
      language: 'javascript',
      mode: 'advanced',
    },
  ],
  tools: { access: [] },
  inputs: {
    input: { type: 'any', description: 'Pass-through data' },
    duration: { type: 'number', description: 'Delay duration' },
    unit: { type: 'string', description: 'Time unit' },
  },
  outputs: {
    output: { type: 'any', description: 'Pass-through input data' },
    elapsed: { type: 'number', description: 'Actual elapsed time in ms' },
  },
}
