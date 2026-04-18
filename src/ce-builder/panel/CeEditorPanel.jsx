import { useCeBuilderStore } from "../store/ceBuilderStore.js";
import { getBlockConfig } from "../blocks/registry.js";
import SubBlockField from "./subBlocks/SubBlockField.jsx";
import { BlockIcon } from "../canvas/BlockIcon.jsx";

// Right-side property editor. Ported from Sim's
// apps/sim/components/panel/components/editor/editor.tsx — renders all
// subBlocks for the currently-selected node as a stacked form.

export default function CeEditorPanel() {
  const selectedId = useCeBuilderStore((s) => s.selectedBlockId);
  const block = useCeBuilderStore((s) => (selectedId ? s.blocks[selectedId] : null));
  const updateName = useCeBuilderStore((s) => s.updateBlockName);
  const updateSubBlockValue = useCeBuilderStore((s) => s.updateSubBlockValue);
  const setBlockEnabled = useCeBuilderStore((s) => s.setBlockEnabled);
  const removeBlock = useCeBuilderStore((s) => s.removeBlock);

  if (!block) {
    return (
      <aside className="ce-editor-panel ce-editor-panel-empty">
        <div className="ce-editor-empty-copy">
          <h4>No block selected</h4>
          <p>Drag a block onto the canvas or click an existing one to edit its fields.</p>
        </div>
      </aside>
    );
  }

  const config = getBlockConfig(block.type);
  if (!config) return null;

  return (
    <aside className="ce-editor-panel">
      <header className="ce-editor-head">
        <div className="ce-editor-head-icon" style={{ background: config.bgColor }}>
          <BlockIcon name={config.icon} />
        </div>
        <div className="ce-editor-head-copy">
          <input
            className="ce-editor-name"
            value={block.name}
            onChange={(e) => updateName(block.id, e.target.value)}
          />
          <span className="ce-editor-table">{config.table}</span>
        </div>
        <div className="ce-editor-head-actions">
          <button
            type="button"
            className={`ce-editor-chip ${block.enabled ? "is-on" : ""}`}
            onClick={() => setBlockEnabled(block.id, !block.enabled)}
            title={block.enabled ? "Disable block" : "Enable block"}
          >
            {block.enabled ? "enabled" : "disabled"}
          </button>
          <button
            type="button"
            className="ce-editor-chip ce-editor-chip-danger"
            onClick={() => removeBlock(block.id)}
            title="Delete block"
          >
            delete
          </button>
        </div>
      </header>

      {config.description ? <p className="ce-editor-description">{config.description}</p> : null}

      <div className="ce-editor-fields">
        {config.subBlocks.map((def) => {
          const entry = block.subBlocks[def.id];
          return (
            <SubBlockField
              key={def.id}
              def={def}
              value={entry?.value}
              onChange={(val) => updateSubBlockValue(block.id, def.id, val)}
            />
          );
        })}
      </div>
    </aside>
  );
}
