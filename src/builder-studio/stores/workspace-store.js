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
import { syncWorkspaceToServer, loadWorkspaceFromServer } from '../api/workspace-client'
import { useLlmConfigStore } from './llm-config-store'
import _demo from './demo-workflow.json'

// demo-workflow.json canonical format:
//   { seedWorkspaceId, seedTeamId, …, skill, agent1, agent2, workflow: { id, name, teamId, nodes, edges, subBlockValues, createdAt } }
// All exported workflows use the same nested shape — no dual-format handling needed.
const _w = _demo.workflow || {}

const SEED_WORKSPACE_ID = _demo.seedWorkspaceId || 'ws_default'
const SEED_TEAM_ID      = _demo.seedTeamId      || 't_fullstack'
const SEED_POOL_ID      = _demo.seedPoolId      || 'pool_default'
const SEED_WORKFLOW_ID  = _demo.seedWorkflowId  || _w.id || 'wf_demo'
const demoSkill         = _demo.skill  || null
const demoAgent1        = _demo.agent1 || null
const demoAgent2        = _demo.agent2 || null
const demoWorkflow      = {
  id:             _w.id             || SEED_WORKFLOW_ID,
  name:           _w.name           || 'Demo Workflow',
  teamId:         _w.teamId         || SEED_TEAM_ID,
  nodes:          _w.nodes          || [],
  edges:          _w.edges          || [],
  subBlockValues: _w.subBlockValues || {},
  createdAt:      _w.createdAt      || new Date().toISOString(),
}

/**
 * @typedef {{id: string, name: string, language: 'javascript'|'python', source: string, inputSchema?: object, outputSchema?: object}} Skill
 * @typedef {{id: string, name: string, teamId: string, agentIds: string[]}} AgentPool
 * @typedef {{id: string, name: string, poolId: string, model: string, provider?: string,
 *   systemPrompt: string, userPrompt: string, inputSchema: object, outputSchema: object,
 *   strictInput: boolean, strictOutput: boolean, attachedSkillIds: string[]}} Agent
 * @typedef {{id: string, name: string, workspaceId: string, agentPoolIds: string[]}} Team
 * @typedef {{id: string, name: string, teamId?: string, nodes: object[], edges: object[], createdAt: string}} Workflow
 */

const seedWorkspaceId = SEED_WORKSPACE_ID
const seedTeamId      = SEED_TEAM_ID
const seedPoolId      = SEED_POOL_ID
const seedWorkflowId  = SEED_WORKFLOW_ID

// Only include seed agents/skills if the JSON actually defines them
const seedAgents = [demoAgent1, demoAgent2].filter(Boolean)
const seedSkills = [demoSkill].filter(Boolean)

const initialState = {
  activeWorkspaceId: seedWorkspaceId,
  activeWorkflowId:  seedWorkflowId,
  workspaces: [{ id: seedWorkspaceId, name: 'Default' }],
  teams: [
    { id: seedTeamId, name: 'fullstack builders', workspaceId: seedWorkspaceId, agentPoolIds: [seedPoolId] },
  ],
  agentPools: [{ id: seedPoolId, name: 'Default Pool', teamId: seedTeamId, agentIds: seedAgents.map((a) => a.id) }],
  agents:    seedAgents,
  skills:    seedSkills,
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
            model: partial.model || useLlmConfigStore.getState().models?.[0]?.id || 'claude-sonnet-4-6',
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
            subBlockValues: {},
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

        /**
         * Import a workflow from a parsed JSON object (from file picker or drag-drop).
         * Always assigns a fresh id to avoid collisions.
         * Returns the created workflow.
         */
        importWorkflow(name, teamId, { nodes, edges, subBlockValues }) {
          const wf = {
            id: `wf_${uuid()}`,
            name,
            teamId,
            description: '',
            nodes: nodes || [],
            edges: edges || [],
            subBlockValues: subBlockValues || {},
            metadata: {
              defaultTimeoutMs: 30000,
              maxRetries: 0,
              failFast: true,
              logLevel: 'info',
              tags: [],
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

        // ---------- Server sync (dual-persistence) ----------

        /**
         * Pushes the current store snapshot to Postgres.
         * Called alongside localStorage persist (e.g. on Save button).
         * Fire-and-forget — returns { ok } but doesn't block the UI.
         */
        async syncToServer() {
          const s = get()
          const workspaceId = s.activeWorkspaceId || 'ws_default'
          const snapshot = {
            activeWorkspaceId: s.activeWorkspaceId,
            activeWorkflowId: s.activeWorkflowId,
            workspaces: s.workspaces,
            teams: s.teams,
            agentPools: s.agentPools,
            agents: s.agents,
            skills: s.skills,
            // Ensure every workflow has subBlockValues (never null) for Postgres NOT NULL constraint
            workflows: s.workflows.map((w) => ({
              ...w,
              subBlockValues: w.subBlockValues || {},
            })),
            llmConfig: useLlmConfigStore.getState().consumerConfig,
          }
          return syncWorkspaceToServer(workspaceId, snapshot)
        },

        /**
         * Loads the workspace from Postgres and merges into the store.
         * Called on app startup when localStorage is empty.
         * Returns true if server data was loaded, false otherwise.
         */
        async loadFromServer(workspaceId) {
          const id = workspaceId || get().activeWorkspaceId || 'ws_default'
          const snapshot = await loadWorkspaceFromServer(id)
          if (!snapshot) return false
          // Only merge if server actually has data
          const hasData = snapshot.workflows?.length > 0 ||
                          snapshot.teams?.length > 0 ||
                          snapshot.agents?.length > 0 ||
                          snapshot.skills?.length > 0
          if (!hasData) return false
          // Restore LLM config if present
          if (snapshot.llmConfig) {
            useLlmConfigStore.getState().setConfig(snapshot.llmConfig)
          }
          set({
            activeWorkspaceId: snapshot.activeWorkspaceId || id,
            activeWorkflowId: snapshot.activeWorkflowId || get().activeWorkflowId,
            workspaces: snapshot.workspaces?.length ? snapshot.workspaces : get().workspaces,
            teams: snapshot.teams?.length ? snapshot.teams : get().teams,
            agentPools: snapshot.agentPools?.length ? snapshot.agentPools : get().agentPools,
            agents: snapshot.agents?.length ? snapshot.agents : get().agents,
            skills: snapshot.skills?.length ? snapshot.skills : get().skills,
            workflows: snapshot.workflows?.length ? snapshot.workflows : get().workflows,
          })
          return true
        },

        reset() {
          set(initialState)
        },
      }),
      {
        name: 'builder-studio/workspace',
        version: 8,
        migrate: (persisted, fromVersion) => {
          // Any older-version blob is discarded in favor of the bundled seed.
          // Bump whenever the demo topology changes (new node/edge) so users
          // who already ran the studio get the updated canvas instead of a
          // stale rehydrate.
          if (!persisted || fromVersion < 8) return initialState
          return persisted
        },
        /** Ensure seed entities always exist on rehydrate — even if the user
         *  previously deleted them. The demo workflow, agents, skills, team,
         *  and pool are guaranteed to be present on every app start. */
        merge: (persistedState, currentState) => {
          const merged = { ...currentState, ...persistedState }

          // Re-inject seed entities if missing
          if (!merged.workflows?.find((w) => w.id === seedWorkflowId)) {
            merged.workflows = [...(merged.workflows || []), demoWorkflow]
          }
          if (!merged.agents?.find((a) => a.id === seedAgent1Id)) {
            merged.agents = [...(merged.agents || []), demoAgent1]
          }
          if (!merged.agents?.find((a) => a.id === seedAgent2Id)) {
            merged.agents = [...(merged.agents || []), demoAgent2]
          }
          if (!merged.skills?.find((s) => s.id === seedSkillId)) {
            merged.skills = [...(merged.skills || []), demoSkill]
          }
          if (!merged.teams?.find((t) => t.id === seedTeamId)) {
            merged.teams = [...(merged.teams || []), { id: seedTeamId, name: 'fullstack builders', workspaceId: seedWorkspaceId, agentPoolIds: [seedPoolId] }]
          }
          if (!merged.agentPools?.find((p) => p.id === seedPoolId)) {
            merged.agentPools = [...(merged.agentPools || []), { id: seedPoolId, name: 'Default Pool', teamId: seedTeamId, agentIds: [seedAgent1Id, seedAgent2Id] }]
          }
          // Ensure activeWorkflowId is valid
          if (!merged.activeWorkflowId || !merged.workflows?.find((w) => w.id === merged.activeWorkflowId)) {
            merged.activeWorkflowId = seedWorkflowId
          }
          return merged
        },
      }
    ),
    { name: 'builder-studio-workspace' }
  )
)
