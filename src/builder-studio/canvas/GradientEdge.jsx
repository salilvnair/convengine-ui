/**
 * GradientEdge — a ReactFlow custom edge that paints a linear gradient
 * from srcColor (source port type) to tgtColor (target port type).
 *
 * Used automatically by Canvas.jsx when the two port-type colors differ.
 * When they are the same, the standard edge with a solid stroke is used.
 */
import { getBezierPath } from 'reactflow'

export default function GradientEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  data = {},
  style = {},
  markerEnd,
}) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const srcColor = data.srcColor || '#94a3b8'
  const tgtColor = data.tgtColor || '#94a3b8'
  const gradId = `ge-${id}`

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY}
          x2={targetX} y2={targetY}
        >
          <stop offset="0%"   stopColor={srcColor} />
          <stop offset="100%" stopColor={tgtColor} />
        </linearGradient>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: `url(#${gradId})`,
        }}
      />
    </>
  )
}
