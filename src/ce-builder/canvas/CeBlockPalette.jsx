import { CE_BLOCK_LIST } from "../blocks/registry.js";
import { BlockIcon } from "./BlockIcon.jsx";

// Left-rail palette of block types. Mirrors the drag-to-canvas pattern from
// Sim Studio's toolbar — each entry sets application/ce-block-type on the
// dataTransfer so CeCanvas.onDrop can look up the config and place the block.

export default function CeBlockPalette({ onAdd }) {
  const onDragStart = (event, type) => {
    event.dataTransfer.setData("application/ce-block-type", type);
    event.dataTransfer.effectAllowed = "move";
  };

  const grouped = CE_BLOCK_LIST.reduce((acc, b) => {
    (acc[b.category] ||= []).push(b);
    return acc;
  }, {});

  return (
    <aside className="ce-palette">
      <div className="ce-palette-head">
        <h4>Blocks</h4>
        <p>Drag onto canvas or click to add</p>
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="ce-palette-group">
          <div className="ce-palette-group-title">{category}</div>
          {items.map((b) => (
            <button
              key={b.type}
              type="button"
              className="ce-palette-item"
              draggable
              onDragStart={(e) => onDragStart(e, b.type)}
              onClick={() => onAdd?.(b)}
              title={b.description}
            >
              <span className="ce-palette-item-icon" style={{ background: b.bgColor }}>
                <BlockIcon name={b.icon} size={14} />
              </span>
              <span className="ce-palette-item-body">
                <span className="ce-palette-item-name">{b.name}</span>
                <span className="ce-palette-item-table">{b.table}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
