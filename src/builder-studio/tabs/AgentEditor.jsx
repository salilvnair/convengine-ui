/**
 * Agent editor — opens as a tab when an agent row is clicked in the SideNav.
 * Shows the fields users expect: name, model, system/user prompts, response
 * schema, and attached skills. All edits write through to the workspace store.
 */
import { useMemo } from 'react'
import { changeRuntimeProvider } from '../api/llm-provider-client'
import { useWorkspaceStore } from '../stores/workspace-store'
import { getConfiguredProviderForModel, useLlmConfigStore } from '../stores/llm-config-store'
import { AgentsIcon, SkillsIcon } from '../components/icons'
import JsonEditor from '../components/JsonEditor'
import FullscreenWrapper from '../components/FullscreenWrapper'
import StyledSelect from '../components/StyledSelect'

export default function AgentEditor({ agentId }) {
  const agent = useWorkspaceStore((s) => s.agents.find((a) => a.id === agentId))
  const skills = useWorkspaceStore((s) => s.skills)
  const updateAgent = useWorkspaceStore((s) => s.updateAgent)
  const models = useLlmConfigStore((s) => s.models)
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
        <StyledSelect
          value={agent.model}
          options={models}
          placeholder="Select model…"
          onChange={(model) => {
            updateAgent(agent.id, { model })
            void changeRuntimeProvider({
              provider: getConfiguredProviderForModel(model) || undefined,
              model,
            }).then((config) => useLlmConfigStore.getState().setConfig(config)).catch(() => {})
          }}
        />
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
        <FullscreenWrapper label="Response schema">
          <JsonEditor
            value={agent.responseSchema || ''}
            onChange={(text) => updateAgent(agent.id, { responseSchema: text })}
            defaultMode="tree"
            height="520px"
          />
        </FullscreenWrapper>
        <div className="bs-hint">
          Click <strong>Fullscreen</strong> to edit larger schemas comfortably.
          Use the <strong>Format</strong> button to pretty-print. Invalid JSON
          is highlighted with an error bar below the editor.
        </div>
      </section>

      <section className="bs-editor-section">
        <label className="bs-check-row">
          <input
            type="checkbox"
            className="bs-check"
            checked={agent.strictOutput === true}
            onChange={(e) => updateAgent(agent.id, { strictOutput: e.target.checked })}
          />
          <span className="bs-check-body">
            <span className="bs-check-title">Strict JSON output</span>
            <span className="bs-check-sub">
              When enabled with a Response Schema, the backend routes through{' '}
              <code>LlmClient.generateJsonStrict</code> — on OpenAI that sets{' '}
              <code>response_format: {'{ type: "json_schema", strict: true }'}</code>{' '}
              so the model is guaranteed to produce schema-conformant JSON or fail.
            </span>
          </span>
        </label>
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
