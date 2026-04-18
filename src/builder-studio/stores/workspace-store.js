/**
 * Workspace store — teams, agent pools, agents, skills, workflows.
 *
 * Mirrors sim's stores/workflows structure but simplified:
 *   Workspace -> Teams -> AgentPools -> Agents (system/user prompts, model,
 *   JSON schema, attached skills) -> Skills (JS functions).
 *
 * Uses zustand v5 + devtools middleware per sim's store pattern.
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'

/**
 * @typedef {{id: string, name: string, language: 'javascript'|'python', source: string, inputSchema?: object, outputSchema?: object}} Skill
 * @typedef {{id: string, name: string, teamId: string, agentIds: string[]}} AgentPool
 * @typedef {{id: string, name: string, poolId: string, model: string, provider?: string,
 *   systemPrompt: string, userPrompt: string, inputSchema: object, outputSchema: object,
 *   strictInput: boolean, strictOutput: boolean, attachedSkillIds: string[]}} Agent
 * @typedef {{id: string, name: string, workspaceId: string, agentPoolIds: string[]}} Team
 * @typedef {{id: string, name: string, teamId?: string, nodes: object[], edges: object[], createdAt: string}} Workflow
 */

const seedWorkspaceId = 'ws_default'
const seedTeamId = 't_fullstack'
const seedPoolId = 'pool_default'
const seedSkillId = 'sk_url_extract'
const seedAgent1Id = 'ag_url_fetcher'
const seedAgent2Id = 'ag_summarizer'
const seedWorkflowId = 'wf_demo_url_summary'

const demoSkillSource = `// url_extract: fetches a URL and extracts plain-text content.
// params: { url: string }
// returns: { url, title, text, status }
async function run(params) {
  const res = await fetch(params.url, { redirect: 'follow' })
  const html = await res.text()
  const title = (html.match(/<title[^>]*>([^<]*)<\\/title>/i) || [, ''])[1].trim()
  const text = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
  return { url: params.url, title, text: text.slice(0, 12000), status: res.status }
}
return run(params)`

const demoSkill = {
  id: seedSkillId,
  name: 'url_extract',
  language: 'javascript',
  source: demoSkillSource,
  inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  outputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      title: { type: 'string' },
      text: { type: 'string' },
      status: { type: 'number' },
    },
    required: ['url', 'text'],
  },
}

const demoAgent1 = {
  id: seedAgent1Id,
  name: 'URL Data Extractor',
  poolId: seedPoolId,
  model: 'claude-sonnet-4-6',
  systemPrompt:
    'You are a data extraction agent. The user will give you a URL. Call the `url_extract` skill with that URL and return the extracted text verbatim plus a short JSON envelope { url, title, text }.',
  userPrompt: 'Extract the page at: {{url}}',
  inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  outputSchema: {
    type: 'object',
    properties: { url: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' } },
    required: ['text'],
  },
  strictInput: true,
  strictOutput: true,
  attachedSkillIds: [seedSkillId],
}

const demoAgent2 = {
  id: seedAgent2Id,
  name: 'Summarizer',
  poolId: seedPoolId,
  model: 'claude-sonnet-4-6',
  systemPrompt:
    'You are a concise summarization agent. Given an extracted page (title + text), produce a crisp summary in 3-5 bullet points, each under 140 characters. Stay faithful to the source.',
  userPrompt: 'Title: {{title}}\n\nContent:\n{{text}}',
  inputSchema: {
    type: 'object',
    properties: { title: { type: 'string' }, text: { type: 'string' } },
    required: ['text'],
  },
  outputSchema: {
    type: 'object',
    properties: { summary: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } },
    required: ['summary'],
  },
  strictInput: true,
  strictOutput: true,
  attachedSkillIds: [],
}

// Demo workflow: starter → userInput(url) → agent1 (url_extract) → agent2 (summarize) → response
const demoNodes = [
  {
    id: 'n_starter',
    type: 'builderBlock',
    position: { x: 40, y: 160 },
    data: { blockType: 'starter', title: 'Start', bgColor: '#2FB67C' },
  },
  {
    id: 'n_input',
    type: 'builderBlock',
    position: { x: 300, y: 160 },
    data: { blockType: 'user_input', title: 'URL', bgColor: '#FBBF24' },
  },
  {
    id: 'n_agent1',
    type: 'builderBlock',
    position: { x: 580, y: 160 },
    data: { blockType: 'agent', title: 'URL Data Extractor', bgColor: '#6F3DFA' },
  },
  {
    id: 'n_agent2',
    type: 'builderBlock',
    position: { x: 880, y: 160 },
    data: { blockType: 'agent', title: 'Summarizer', bgColor: '#6F3DFA' },
  },
  {
    id: 'n_response',
    type: 'builderBlock',
    position: { x: 1180, y: 160 },
    data: { blockType: 'response', title: 'Response', bgColor: '#2F55D4' },
  },
  {
    id: 'n_preview',
    type: 'builderBlock',
    position: { x: 1480, y: 160 },
    data: { blockType: 'show_preview', title: 'Final Preview', bgColor: '#14B8A6' },
  },
]

const demoEdges = [
  { id: 'e_s_in', source: 'n_starter', target: 'n_input', animated: true },
  { id: 'e_in_a1', source: 'n_input', target: 'n_agent1', animated: true },
  { id: 'e_a1_a2', source: 'n_agent1', target: 'n_agent2', animated: true },
  { id: 'e_a2_r', source: 'n_agent2', target: 'n_response', animated: true },
  { id: 'e_r_prev', source: 'n_response', target: 'n_preview', animated: true },
]

const demoSubBlockValues = {
  n_starter: { startWorkflow: 'manual' },
  n_input: {
    label: 'URL',
    kind: 'url',
    placeholder: 'https://example.com',
    // Typed-in default so the demo auto-runs without a popup. Users can
    // edit this inline on the card.
    defaultValue: 'https://www.salilvnair.com/docs/v2/architecture',
    required: true,
  },
  n_agent1: {
    systemPrompt: demoAgent1.systemPrompt,
    userPrompt: demoAgent1.userPrompt,
    model: demoAgent1.model,
    temperature: 0.2,
    // Single unified Skills/Tools field (was split into tools+skills).
    skills: JSON.stringify([seedSkillId], null, 2),
    responseFormat: JSON.stringify(demoAgent1.outputSchema, null, 2),
  },
  n_agent2: {
    systemPrompt: demoAgent2.systemPrompt,
    userPrompt: demoAgent2.userPrompt,
    model: demoAgent2.model,
    temperature: 0.3,
    responseFormat: JSON.stringify(demoAgent2.outputSchema, null, 2),
  },
  n_response: { data: '<n_agent2.output>' },
  n_preview: { label: 'Final output' },
}

const demoWorkflow = {
  id: seedWorkflowId,
  name: 'Demo · URL → Summary',
  teamId: seedTeamId,
  nodes: demoNodes,
  edges: demoEdges,
  subBlockValues: demoSubBlockValues,
  createdAt: new Date().toISOString(),
}

const initialState = {
  activeWorkspaceId: seedWorkspaceId,
  activeWorkflowId: seedWorkflowId,
  workspaces: [{ id: seedWorkspaceId, name: 'Default' }],
  teams: [
    { id: seedTeamId, name: 'fullstack builders', workspaceId: seedWorkspaceId, agentPoolIds: [seedPoolId] },
  ],
  agentPools: [{ id: seedPoolId, name: 'Default Pool', teamId: seedTeamId, agentIds: [seedAgent1Id, seedAgent2Id] }],
  agents: [demoAgent1, demoAgent2],
  skills: [demoSkill],
  workflows: [demoWorkflow],
}

export const useWorkspaceStore = create()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // ---------- Teams ----------
        createTeam(name) {
          const team = { id: `t_${uuid()}`, name, workspaceId: get().activeWorkspaceId, agentPoolIds: [] }
          set((s) => ({ teams: [...s.teams, team] }))
          return team
        },
        renameTeam(id, name) {
          set((s) => ({ teams: s.teams.map((t) => (t.id === id ? { ...t, name } : t)) }))
        },
        duplicateTeam(id) {
          const src = get().teams.find((t) => t.id === id)
          if (!src) return null
          const copy = { ...src, id: `t_${uuid()}`, name: `${src.name} (copy)`, agentPoolIds: [] }
          set((s) => ({ teams: [...s.teams, copy] }))
          return copy
        },
        deleteTeam(id) {
          set((s) => ({ teams: s.teams.filter((t) => t.id !== id) }))
        },

        // ---------- Agent Pools ----------
        createAgentPool(teamId, name) {
          const pool = { id: `pool_${uuid()}`, name, teamId, agentIds: [] }
          set((s) => ({
            agentPools: [...s.agentPools, pool],
            teams: s.teams.map((t) => (t.id === teamId ? { ...t, agentPoolIds: [...t.agentPoolIds, pool.id] } : t)),
          }))
          return pool
        },
        deleteAgentPool(id) {
          set((s) => ({
            agentPools: s.agentPools.filter((p) => p.id !== id),
            teams: s.teams.map((t) => ({ ...t, agentPoolIds: t.agentPoolIds.filter((x) => x !== id) })),
          }))
        },

        // ---------- Agents ----------
        createAgent(poolId, partial = {}) {
          const agent = {
            id: `ag_${uuid()}`,
            name: partial.name || 'New Agent',
            poolId,
            model: partial.model || 'claude-sonnet-4-6',
            provider: partial.provider,
            systemPrompt: partial.systemPrompt || 'You are a helpful agent.',
            userPrompt: partial.userPrompt || '{{input}}',
            inputSchema: partial.inputSchema || { type: 'object', properties: {}, required: [] },
            outputSchema: partial.outputSchema || { type: 'object', properties: {}, required: [] },
            strictInput: partial.strictInput ?? true,
            strictOutput: partial.strictOutput ?? true,
            attachedSkillIds: partial.attachedSkillIds || [],
          }
          set((s) => ({
            agents: [...s.agents, agent],
            agentPools: s.agentPools.map((p) => (p.id === poolId ? { ...p, agentIds: [...p.agentIds, agent.id] } : p)),
          }))
          return agent
        },
        updateAgent(id, patch) {
          set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
        },
        duplicateAgent(id) {
          const src = get().agents.find((a) => a.id === id)
          if (!src) return null
          const copy = { ...src, id: `ag_${uuid()}`, name: `${src.name} (copy)` }
          set((s) => ({
            agents: [...s.agents, copy],
            agentPools: s.agentPools.map((p) => (p.id === src.poolId ? { ...p, agentIds: [...p.agentIds, copy.id] } : p)),
          }))
          return copy
        },
        deleteAgent(id) {
          set((s) => ({
            agents: s.agents.filter((a) => a.id !== id),
            agentPools: s.agentPools.map((p) => ({ ...p, agentIds: p.agentIds.filter((x) => x !== id) })),
          }))
        },

        // ---------- Skills ----------
        createSkill(partial = {}) {
          const skill = {
            id: `sk_${uuid()}`,
            name: partial.name || 'new_skill',
            language: partial.language || 'javascript',
            source: partial.source || '// async function(params, env) {\n//   return { ok: true }\n// }\nreturn { ok: true }',
            inputSchema: partial.inputSchema,
            outputSchema: partial.outputSchema,
          }
          set((s) => ({ skills: [...s.skills, skill] }))
          return skill
        },
        updateSkill(id, patch) {
          set((s) => ({ skills: s.skills.map((k) => (k.id === id ? { ...k, ...patch } : k)) }))
        },
        duplicateSkill(id) {
          const src = get().skills.find((k) => k.id === id)
          if (!src) return null
          const copy = { ...src, id: `sk_${uuid()}`, name: `${src.name}_copy` }
          set((s) => ({ skills: [...s.skills, copy] }))
          return copy
        },
        deleteSkill(id) {
          set((s) => ({ skills: s.skills.filter((k) => k.id !== id) }))
        },

        // ---------- Workflows ----------
        createWorkflow(name, teamId, partial = {}) {
          const wf = {
            id: `wf_${uuid()}`,
            name,
            teamId,
            description: partial.description || '',
            nodes: [],
            edges: [],
            // Advanced / runtime defaults surfaced in the workflow inspector.
            metadata: {
              defaultTimeoutMs: partial.defaultTimeoutMs ?? 30000,
              maxRetries: partial.maxRetries ?? 0,
              failFast: partial.failFast ?? true,
              logLevel: partial.logLevel || 'info',
              tags: partial.tags || [],
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          set((s) => ({ workflows: [...s.workflows, wf], activeWorkflowId: wf.id }))
          return wf
        },

        /** Patch any top-level fields on a workflow — description, teamId,
         *  metadata.*, etc. Used by the workflow-level inspector. */
        updateWorkflow(id, patch) {
          set((s) => ({
            workflows: s.workflows.map((w) =>
              w.id === id
                ? {
                    ...w,
                    ...patch,
                    metadata: patch.metadata ? { ...w.metadata, ...patch.metadata } : w.metadata,
                    updatedAt: new Date().toISOString(),
                  }
                : w
            ),
          }))
        },
        openWorkflow(id) {
          set({ activeWorkflowId: id })
        },
        renameWorkflow(id, name) {
          set((s) => ({ workflows: s.workflows.map((w) => (w.id === id ? { ...w, name } : w)) }))
        },
        duplicateWorkflow(id) {
          const src = get().workflows.find((w) => w.id === id)
          if (!src) return null
          const copy = {
            ...src,
            id: `wf_${uuid()}`,
            name: `${src.name} (copy)`,
            createdAt: new Date().toISOString(),
          }
          set((s) => ({ workflows: [...s.workflows, copy] }))
          return copy
        },
        saveWorkflow(id, { nodes, edges, subBlockValues }) {
          set((s) => ({
            workflows: s.workflows.map((w) =>
              w.id === id ? { ...w, nodes, edges, subBlockValues } : w
            ),
          }))
        },
        deleteWorkflow(id) {
          set((s) => ({
            workflows: s.workflows.filter((w) => w.id !== id),
            activeWorkflowId: s.activeWorkflowId === id ? null : s.activeWorkflowId,
          }))
        },

        reset() {
          set(initialState)
        },
      }),
      {
        name: 'builder-studio/workspace',
        version: 6,
        migrate: (persisted, fromVersion) => {
          // Any older-version blob is discarded in favor of the bundled seed
          // (demo workflow now includes a dedicated user_input node).
          if (!persisted || fromVersion < 4) return initialState
          return persisted
        },
      }
    ),
    { name: 'builder-studio-workspace' }
  )
)
