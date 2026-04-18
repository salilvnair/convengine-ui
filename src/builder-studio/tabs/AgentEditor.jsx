/**
 * Agent editor — opens as a tab when an agent row is clicked in the SideNav.
 * Shows the fields users expect: name, model, system/user prompts, response
 * schema, and attached skills. All edits write through to the workspace store.
 */
import { useMemo } from 'react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { AgentsIcon, SkillsIcon } from '../components/icons'
import JsonEditor from '../components/JsonEditor'

const MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'claude-sonnet-4',
  'claude-opus-4',
  'llama-3.1-70b',
]

export default function AgentEditor({ agentId }) {
  const agent = useWorkspaceStore((s) => s.agents.find((a) => a.id === agentId))
  const skills = useWorkspaceStore((s) => s.skills)
  const updateAgent = useWorkspaceStore((s) => s.updateAgent)
  const pool = useWorkspaceStore((s) =>
    agent ? s.agentPools.find((p) => p.id === agent.poolId) : null
  )

  const attached = useMemo(() => new Set(agent?.attachedSkillIds || []), [agent])

  if (!agent) {
    return <div className="bs-editor-empty">Agent not found.</div>
  }

  function toggleSkill(skillId) {
    const next = new Set(attached)
    if (next.has(skillId)) next.delete(skillId); else next.add(skillId)
    updateAgent(agent.id, { attachedSkillIds: Array.from(next) })
  }

  return (
    <div className="bs-editor">
      <header className="bs-editor-head">
        <AgentsIcon className="bs-editor-ico" />
        <div className="bs-editor-heading">
          <div className="bs-editor-title">{agent.name}</div>
          <div className="bs-editor-sub">
            {pool?.name || 'Unassigned pool'} · {agent.model}
          </div>
        </div>
      </header>

      <section className="bs-editor-section">
        <label className="bs-label">Name</label>
        <input
          className="bs-input"
          value={agent.name}
          onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
        />
      </section>

      <section className="bs-editor-section">
        <label className="bs-label">Model</label>
        <select
          className="bs-input"
          value={agent.model}
          onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
        >
          {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </section>

      <section className="bs-editor-section">
        <label className="bs-label">System prompt</label>
        <textarea
          className="bs-textarea"
          rows={5}
          value={agent.systemPrompt || ''}
          onChange={(e) => updateAgent(agent.id, { systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant that …"
        />
      </section>

      <section className="bs-editor-section">
        <label className="bs-label">User prompt template</label>
        <textarea
          className="bs-textarea"
          rows={4}
          value={agent.userPrompt || ''}
          onChange={(e) => updateAgent(agent.id, { userPrompt: e.target.value })}
          placeholder="Input: {{input}}"
        />
        <div className="bs-hint">
          Use <code>{'{{input}}'}</code> to reference the upstream node's output.
        </div>
      </section>

      <section className="bs-editor-section">
        <label className="bs-label">Response schema (JSON)</label>
        <JsonEditor
          value={agent.responseSchema || ''}
          onChange={(text) => updateAgent(agent.id, { responseSchema: text })}
          defaultMode="tree"
          height="280px"
        />
        <div className="bs-hint">
          Tree mode lets you expand nodes and edit keys/values visually. Switch
          to Text mode in the top bar of the editor for raw JSON.
        </div>
      </section>

      <section className="bs-editor-section">
        <label className="bs-label-inline">
          <input
            type="checkbox"
            checked={agent.strictOutput === true}
            onChange={(e) => updateAgent(agent.id, { strictOutput: e.target.checked })}
          />
          <span>Strict JSON output</span>
        </label>
        <div className="bs-hint">
          When enabled with a Response Schema, the backend routes through{' '}
          <code>LlmClient.generateJsonStrict</code> — on OpenAI that sets{' '}
          <code>response_format: {'{ type: "json_schema", strict: true }'}</code>{' '}
          so the model is guaranteed to produce schema-conformant JSON or fail.
        </div>
      </section>

      <section className="bs-editor-section">
        <label className="bs-label">Attached skills</label>
        <ul className="bs-chip-list">
          {skills.length === 0 && <li className="bs-empty">No skills defined yet.</li>}
          {skills.map((k) => {
            const on = attached.has(k.id)
            return (
              <li key={k.id}>
                <button
                  className={`bs-chip ${on ? 'is-on' : ''}`}
                  onClick={() => toggleSkill(k.id)}
                  type="button"
                >
                  <SkillsIcon className="bs-ico-xs" />
                  <span>{k.name}</span>
                  <span className="bs-chip-meta">{k.language}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
