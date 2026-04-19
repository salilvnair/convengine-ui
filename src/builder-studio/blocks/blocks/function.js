/** Ported from sim/apps/sim/blocks/blocks/function.ts. */
import { CodeIcon } from '../../components/icons'

export const FunctionBlock = {
  type: 'function',
  name: 'Function',
  description: 'Run custom logic',
  longDescription:
    'This is a core workflow block. Execute custom JavaScript or Python code within your workflow. JavaScript without imports runs locally for fast execution, while code with imports or Python uses a sandbox.',
  bestPractices: `
  - JavaScript code without external imports runs in a local VM for fastest execution.
  - Python code always requires a sandbox and runs in a secure environment.
  - Reference workflow variables using <blockName.output> syntax within code.
  `,
  docsLink: 'https://docs.sim.ai/blocks/function',
  category: 'tools',
  bgColor: '#FF402F',
  icon: CodeIcon,
  subBlocks: [
    {
      id: 'language',
      type: 'dropdown',
      options: [
        { label: 'JavaScript', id: 'javascript' },
        { label: 'Python', id: 'python' },
      ],
      placeholder: 'Select language',
      value: () => 'javascript',
    },
    {
      id: 'code',
      title: 'Code',
      type: 'code',
      language: 'javascript',
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt:
          'Generate ONLY the raw body of an async JavaScript function (params, environmentVariables). Reference inputs using <paramName> and env vars using {{VAR_NAME}}. Return the function body only.',
        placeholder: 'Describe the function you want to create...',
        generationType: 'javascript-function-body',
      },
    },
  ],
  tools: { access: ['function_execute'] },
  inputs: {
    code: { type: 'string', description: 'JavaScript or Python code to execute' },
    language: { type: 'string', description: 'Language (javascript or python)' },
    timeout: { type: 'number', description: 'Execution timeout' },
  },
  outputs: {
    result: { type: 'json', description: 'Return value from the executed function' },
    stdout: { type: 'string', description: 'Console output and debug messages' },
  },
}
