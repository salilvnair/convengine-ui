/** Sub-Workflow block — call another workflow as a reusable unit. */
import { LoopIcon } from '../../components/icons'

export const SubWorkflowBlock = {
  type: 'sub_workflow',
  name: 'Sub-Workflow',
  description: 'Execute another workflow as a sub-routine',
  longDescription:
    'Calls another workflow in the workspace and passes data to it. The sub-workflow runs to completion and its final output is returned. Great for reusable logic, modular design, and keeping individual workflows small and focused.',
  category: 'blocks',
  bgColor: '#7C3AED',
  icon: LoopIcon,
  subBlocks: [
    {
      id: 'workflowId',
      title: 'Workflow',
      type: 'workflow-selector',
      required: true,
    },
    {
      id: 'inputMapping',
      title: 'Input Mapping',
      type: 'workflow-input-mapper',
    },
    {
      id: 'timeout',
      title: 'Timeout (ms)',
      type: 'short-input',
      placeholder: '30000',
      mode: 'advanced',
    },
    {
      id: 'failOnError',
      title: 'Fail on sub-workflow error',
      type: 'switch',
      defaultValue: true,
      mode: 'advanced',
    },
  ],
  tools: { access: [] },
  inputs: {
    workflowId: { type: 'string', description: 'ID of the workflow to execute' },
    inputMapping: { type: 'json', description: 'Data to pass to the sub-workflow' },
    timeout: { type: 'number', description: 'Execution timeout in ms' },
  },
  outputs: {
    result: { type: 'any', description: 'Sub-workflow output' },
    status: { type: 'string', description: 'Execution status (success/error)' },
    duration: { type: 'number', description: 'Execution time in ms' },
  },
}
