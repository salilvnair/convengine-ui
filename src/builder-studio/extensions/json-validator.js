/**
 * Example community extension — JSON Validator.
 *
 * Validates an incoming JSON payload against a table of JSONPath rules.
 * Each row is `{ path, rule, value }` where `rule` is one of:
 *   mandatory · min · max · minItems · maxItems · regex · type · eq · neq
 *
 * Outputs `{ valid: boolean, errors: string[] }` and renders two handles
 * (`valid` and `invalid`) so the next node can branch on the outcome —
 * typical downstream is an If/Else or Switch that halts the workflow
 * when validation fails.
 *
 * Drop this file under `builder-studio/extensions/` and it auto-registers
 * (Vite `import.meta.glob` picks it up). That's the whole contract for a
 * custom block — no code changes to the registry.
 */
import { ResponseIcon } from '../components/icons'

const JsonValidatorBlock = {
  type: 'ext_json_validator',
  name: 'JSON Validator',
  description: 'Assert JSONPath rules on a payload',
  longDescription:
    'Community extension. Each rule row evaluates a JSONPath against the input and asserts a constraint. If any rule fails, the `invalid` handle fires with the error list; the workflow can be halted by wiring only the `valid` handle forward.',
  category: 'custom',
  bgColor: '#14B8A6',
  icon: ResponseIcon,
  subBlocks: [
    {
      id: 'input',
      title: 'Input JSON',
      type: 'code',
      language: 'json',
      placeholder: '<agent1.output>',
      description: 'JSON string or upstream reference to validate.',
    },
    {
      id: 'rules',
      title: 'Validation rules',
      type: 'table',
      columns: ['JSONPath', 'Rule', 'Value'],
      description:
        'Examples — $.lastName ∙ mandatory ∙ ""   •   $.age ∙ min ∙ 10   •   $.hobbies ∙ minItems ∙ 1',
    },
    {
      id: 'haltOnFail',
      title: 'Halt workflow on failure',
      type: 'switch',
      defaultValue: true,
      description: 'When on, the workflow stops instead of taking the `invalid` branch.',
    },
  ],
  tools: { access: ['json_validate'] },
  inputs: {
    input: { type: 'json', description: 'Upstream JSON payload to validate' },
  },
  outputs: {
    valid: { type: 'boolean', description: 'True when every rule passes' },
    errors: { type: 'array', description: 'List of human-readable error messages' },
  },
  outputHandles: ['valid', 'invalid'],
}

export default JsonValidatorBlock
