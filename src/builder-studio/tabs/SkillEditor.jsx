/**
 * Skill editor tab. Same shape as the inline skill editor in the SideNav,
 * but at full canvas width with better whitespace and a monospace source
 * editor for the skill body.
 */
import { useWorkspaceStore } from '../stores/workspace-store'
import { SkillsIcon } from '../components/icons'
import CodeEditor from '../components/CodeEditor'

export default function SkillEditor({ skillId }) {
  const skill = useWorkspaceStore((s) => s.skills.find((k) => k.id === skillId))
  const updateSkill = useWorkspaceStore((s) => s.updateSkill)

  if (!skill) return <div className="bs-editor-empty">Skill not found.</div>

  return (
    <div className="bs-editor">
      <header className="bs-editor-head">
        <SkillsIcon className="bs-editor-ico" />
        <div className="bs-editor-heading">
          <div className="bs-editor-title">{skill.name}</div>
          <div className="bs-editor-sub">{skill.language} skill</div>
        </div>
      </header>

      <section className="bs-editor-section">
        <label className="bs-label">Name</label>
        <input
          className="bs-input"
          value={skill.name}
          onChange={(e) => updateSkill(skill.id, { name: e.target.value })}
        />
      </section>

      <section className="bs-editor-section">
        <label className="bs-label">Language</label>
        <select
          className="bs-input"
          value={skill.language}
          onChange={(e) => updateSkill(skill.id, { language: e.target.value })}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="jsonpath">JSONPath</option>
        </select>
      </section>

      <section className="bs-editor-section bs-editor-section-grow">
        <label className="bs-label">Source</label>
        <CodeEditor
          language={skill.language || 'javascript'}
          value={skill.source || ''}
          onChange={(v) => updateSkill(skill.id, { source: v })}
          placeholder="// your skill implementation"
          minHeight="320px"
          maxHeight="60vh"
        />
      </section>
    </div>
  )
}
