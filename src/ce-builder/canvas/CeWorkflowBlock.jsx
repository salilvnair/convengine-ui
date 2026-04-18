import { memo } from "react";
import { Handle, Position } from "reactflow";
import { getBlockConfig } from "../blocks/registry.js";
import { useCeBuilderStore } from "../store/ceBuilderStore.js";
import { BlockIcon } from "./BlockIcon.jsx";

// Ported from Sim Studio apps/sim/app/workspace/.../components/workflow-block/workflow-block.tsx
// Core visual grammar kept identical:
// - fixed 250px card width
// - 8px border-radius, 1px border
// - 24px square icon well filled with the block's bgColor
// - horizontal handles (left target, right source) sized 7px → 10px on hover
//
// The card renders a preview of the block's subBlocks so the canvas is
// self-describing without opening the right-side editor.

function CeWorkflowBlock({ id, data, selected }) {
  const config = getBlockConfig(data.type);
  const block = useCeBuilderStore((s) => s.blocks[id]);
  if (!config || !block) return null;

  const horizontal = block.horizontalHandles !== false;

  return (
    <div className={`ce-wf-block${selected ? " is-selected" : ""}${!block.enabled ? " is-disabled" : ""}`}>
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        className="ce-wf-handle ce-wf-handle-target"
      />

      <div className="ce-wf-block-header">
        <div className="ce-wf-block-icon" style={{ background: config.bgColor }}>
          <BlockIcon name={config.icon} />
        </div>
        <div className="ce-wf-block-title" title={block.name}>
          {block.name}
        </div>
        <span className="ce-wf-block-type">{config.table}</span>
      </div>

      <div className="ce-wf-block-body">
        {config.subBlocks.map((sb) => {
          const current = block.subBlocks[sb.id]?.value;
          return (
            <div key={sb.id} className="ce-wf-block-row">
              <span className="ce-wf-block-row-label">{sb.title || sb.id}</span>
              <span className="ce-wf-block-row-value">
                {formatPreview(current)}
              </span>
            </div>
          );
        })}
      </div>

      {(config.outputs?.handles || ["default"]).map((h, idx, arr) => (
        <Handle
          key={h}
          id={h}
          type="source"
          position={horizontal ? Position.Right : Position.Bottom}
          className={`ce-wf-handle ce-wf-handle-source${h !== "default" ? ` ce-wf-handle-${h}` : ""}`}
          style={
            horizontal && arr.length > 1
              ? { top: `${40 + idx * 22}px` }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function formatPreview(value) {
  if (value === null || value === undefined || value === "") return <em>empty</em>;
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? "" : "s"}` : <em>empty</em>;
  if (typeof value === "object") return <em>{"{…}"}</em>;
  const s = String(value);
  return s.length > 32 ? `${s.slice(0, 32)}…` : s;
}

export default memo(CeWorkflowBlock);
