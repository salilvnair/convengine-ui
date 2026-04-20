/**
 * Canvas Visual Config
 * ─────────────────────────────────────────────────────────────────────────────
 * Single place to tune edge appearance and disabled-node overlay colors.
 * Hot-reload (Vite) picks up changes without a full rebuild.
 *
 * Disabled-node OVERLAY colors live in builder-studio-theme.css
 * under the "Canvas Node Overlay" section — see --bs-disabled-* vars.
 */

// ─── Edge Appearance ──────────────────────────────────────────────────────────
export const EDGE = {
  /** Default stroke width (px) for idle edges */
  strokeWidth: 3,

  /** Stroke width for flowing / animated edges */
  strokeWidthActive: 3.5,

  /**
   * Color each edge by its source port type (ComfyUI-style).
   * Colors come from the typeColors registry in panel/io-registry.js.
   * Set to false to use defaultColor for all edges.
   */
  colorByPortType: true,

  /**
   * Fallback stroke color when colorByPortType is false,
   * or when the port type is "any".
   */
  defaultColor: '#94a3b8',

  /** Opacity for idle edges (0–1) */
  opacity: 0.85,

  /** Opacity when edge is active / animated (0–1) */
  opacityActive: 1,
}
