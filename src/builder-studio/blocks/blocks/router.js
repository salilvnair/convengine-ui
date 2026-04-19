/**
 * Router V2 block (port-based) ported from sim/apps/sim/blocks/blocks/router.ts.
 * Only the v2 block is exposed (v1 is hidden from toolbar in sim).
 */
import { ConnectIcon } from '../../components/icons'
import { AuthMode } from '../types'
import { getModelOptions, getDefaultModel, getProviderCredentialSubBlocks, PROVIDER_CREDENTIAL_INPUTS } from '../utils'

export const RouterBlock = {
  type: 'router_v2',
  name: 'Router',
  description: 'Route workflow based on context',
  authMode: AuthMode.ApiKey,
  docsLink: 'https://docs.sim.ai/blocks/router',
  longDescription:
    'Intelligently route workflow execution to different paths based on context analysis. Define multiple routes with descriptions, and an LLM will determine which route to take.',
  bestPractices: `
  - Write clear, specific descriptions for each route
  - Route descriptions should be mutually exclusive when possible
  `,
  category: 'blocks',
  bgColor: '#28C43F',
  icon: ConnectIcon,
  subBlocks: [
    {
      id: 'context',
      title: 'Context',
      type: 'long-input',
      placeholder: 'Enter the context to analyze for routing...',
      required: true,
    },
    { id: 'routes', type: 'router-input' },
    {
      id: 'model',
      title: 'Model',
      type: 'combobox',
      placeholder: 'Type or select a model...',
      required: true,
      get defaultValue() { return getDefaultModel() },
      options: getModelOptions,
    },
    ...getProviderCredentialSubBlocks(),
  ],
  tools: {
    access: ['openai_chat', 'anthropic_chat', 'google_chat'],
    config: {
      tool: (params) => {
        const model = params.model || getDefaultModel()
        if (model.startsWith('claude')) return 'anthropic_chat'
        if (model.startsWith('gpt') || model.startsWith('o')) return 'openai_chat'
        return 'anthropic_chat'
      },
    },
  },
  inputs: {
    context: { type: 'string', description: 'Context for routing decision' },
    routes: { type: 'json', description: 'Route definitions with descriptions' },
    model: { type: 'string', description: 'AI model to use' },
    ...PROVIDER_CREDENTIAL_INPUTS,
  },
  outputs: {
    context: { type: 'string', description: 'Context used for routing' },
    model: { type: 'string', description: 'Model used' },
    tokens: { type: 'json', description: 'Token usage' },
    cost: { type: 'json', description: 'Cost information' },
    selectedRoute: { type: 'string', description: 'Selected route ID' },
    reasoning: { type: 'string', description: 'Explanation of why this route was chosen' },
    selectedPath: { type: 'json', description: 'Selected routing path' },
  },
}
