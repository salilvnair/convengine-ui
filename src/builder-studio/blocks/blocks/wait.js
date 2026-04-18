/** Wait block — mirrors sim's wait shape. */
import { WaitIcon } from '../../components/icons'

export const WaitBlock = {
  type: 'wait',
  name: 'Wait',
  description: 'Pause execution for a duration',
  category: 'blocks',
  bgColor: '#6B7280',
  icon: WaitIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Duration (ms)', id: 'duration' },
        { label: 'Until ISO timestamp', id: 'until' },
      ],
      value: () => 'duration',
    },
    { id: 'duration', title: 'Duration (ms)', type: 'short-input', placeholder: '1000', condition: { field: 'mode', value: 'duration' } },
    { id: 'until', title: 'Until', type: 'short-input', placeholder: '2026-04-17T12:00:00Z', condition: { field: 'mode', value: 'until' } },
  ],
  tools: { access: [] },
  inputs: {
    mode: { type: 'string', description: 'duration or until' },
    duration: { type: 'number', description: 'Milliseconds to wait' },
    until: { type: 'string', description: 'ISO 8601 timestamp' },
  },
  outputs: {
    waitedMs: { type: 'number', description: 'Actual milliseconds waited' },
  },
}
