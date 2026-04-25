/** Ported from sim/apps/sim/blocks/blocks/mcp.ts. */
import { McpIcon } from '../../components/icons'
import { IntegrationType } from '../types'

export const McpBlock = {
  type: 'mcp',
  name: 'MCP Tool',
  description: 'Execute tools from Model Context Protocol (MCP) servers',
  longDescription:
    'Integrate MCP into the workflow. Can execute tools from MCP servers. Requires MCP servers in workspace settings.',
  docsLink: 'https://docs.sim.ai/mcp',
  category: 'tools',
  integrationType: IntegrationType.DeveloperTools,
  tags: ['agentic', 'automation', 'llm'],
  bgColor: '#181C1E',
  icon: McpIcon,
  subBlocks: [
    {
      id: 'server',
      title: 'MCP Server',
      type: 'mcp-server-selector',
      required: true,
      placeholder: 'Select an MCP server',
      description: 'Choose from configured MCP servers in your workspace',
    },
    {
      id: 'tool',
      title: 'Tool',
      type: 'mcp-tool-selector',
      required: true,
      placeholder: 'Select a tool',
      dependsOn: ['server'],
      condition: { field: 'server', value: '', not: true },
    },
  ],
  tools: {
    access: [],
    config: {
      tool: (params) => {
        if (params.server && params.tool) {
          const serverId = params.server
          let toolName = params.tool
          if (toolName.startsWith(`${serverId}-`)) toolName = toolName.slice(serverId.length + 1)
          return `mcp:${serverId}:${toolName}`
        }
        return 'mcp-dynamic'
      },
    },
  },
  inputs: {
    input: { type: 'any', description: 'Arguments to pass to the tool — wire any upstream node here' },
    server: { type: 'string', description: 'MCP server ID' },
    tool: { type: 'string', description: 'Tool name to execute' },
  },
  outputs: {
    content: { type: 'array', description: 'Content array from MCP tool response' },
  },
}
