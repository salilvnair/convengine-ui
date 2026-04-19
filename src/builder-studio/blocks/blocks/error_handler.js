/** Error Handler block — catch and handle errors from upstream nodes. */
import { ConditionalIcon } from '../../components/icons'

export const ErrorHandlerBlock = {
  type: 'error_handler',
  name: 'Error Handler',
  description: 'Catch and handle workflow errors',
  longDescription:
    'Catches errors thrown by upstream blocks and routes execution to a recovery branch. Supports retry logic, fallback values, and error logging. Attach to any block to add resilience.',
  category: 'blocks',
  bgColor: '#EF4444',
  icon: ConditionalIcon,
  subBlocks: [
    {
      id: 'strategy',
      title: 'Strategy',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'Continue with fallback', id: 'fallback' },
        { label: 'Retry', id: 'retry' },
        { label: 'Stop workflow', id: 'stop' },
        { label: 'Route to error branch', id: 'branch' },
      ],
    },
    {
      id: 'fallbackValue',
      title: 'Fallback Value',
      type: 'code',
      placeholder: '{ "default": true }',
      language: 'json',
    },
    { id: 'maxRetries', title: 'Max Retries', type: 'short-input', placeholder: '3', mode: 'advanced' },
    { id: 'retryDelay', title: 'Retry Delay (ms)', type: 'short-input', placeholder: '1000', mode: 'advanced' },
    {
      id: 'logErrors',
      title: 'Log Errors',
      type: 'switch',
      defaultValue: true,
    },
  ],
  tools: { access: [] },
  inputs: {
    input: { type: 'any', description: 'Input from upstream block' },
    strategy: { type: 'string', description: 'Error handling strategy' },
    fallbackValue: { type: 'json', description: 'Value to use on error' },
    maxRetries: { type: 'number', description: 'Max retry count' },
    retryDelay: { type: 'number', description: 'Delay between retries in ms' },
  },
  outputs: {
    result: { type: 'any', description: 'Successful result or fallback' },
    error: { type: 'json', description: 'Error details if caught' },
    retryCount: { type: 'number', description: 'Number of retries attempted' },
  },
}
