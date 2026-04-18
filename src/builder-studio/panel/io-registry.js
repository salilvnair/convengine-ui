/**
 * IO Panel Registry — extensible configuration for the Inspector's I/O panel.
 *
 * Extensions can register:
 *   - Custom type colors (for typed badges in inputs/outputs)
 *   - Custom IO sections (connections, template vars, custom panels)
 *   - Block-level feature flags (e.g. which blocks show template variables)
 *
 * Usage from an extension:
 *   import { registerTypeColor, registerIOSection, enableFeature } from './io-registry'
 *   registerTypeColor('vector', { bg: '...', border: '...', text: '...' })
 *   enableFeature('templateVars', 'my_custom_block')
 */

// ─── Type Colors ────────────────────────────────────────────────────────────
const typeColors = {
  string:  { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  text: '#86efac' },
  number:  { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', text: '#fde68a' },
  boolean: { bg: 'rgba(244,114,182,0.12)',border: 'rgba(244,114,182,0.3)',text: '#f9a8d4' },
  json:    { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', text: '#a5b4fc' },
  array:   { bg: 'rgba(14,165,233,0.12)', border: 'rgba(14,165,233,0.3)', text: '#7dd3fc' },
  any:     { bg: 'rgba(148,163,184,0.12)',border: 'rgba(148,163,184,0.3)',text: '#cbd5e1' },
}

export function registerTypeColor(typeName, colors) {
  if (!typeName || !colors) return
  typeColors[typeName] = colors
}

export function getTypeColor(typeName) {
  return typeColors[typeName] || typeColors.any
}

export function getAllTypeColors() {
  return { ...typeColors }
}

// ─── Feature Flags (block-type → Set of features) ──────────────────────────
// Features: 'templateVars' — show upstream template variable discovery
const featureFlags = {
  templateVars: new Set(['agent']),
}

export function enableFeature(feature, blockType) {
  if (!featureFlags[feature]) featureFlags[feature] = new Set()
  featureFlags[feature].add(blockType)
}

export function disableFeature(feature, blockType) {
  featureFlags[feature]?.delete(blockType)
}

export function hasFeature(feature, blockType) {
  return featureFlags[feature]?.has(blockType) ?? false
}

// ─── Custom IO Sections ─────────────────────────────────────────────────────
// Each section: { key, priority, match(cfg, node), Component }
// Component receives: { node, cfg, nodes, edges, lastOutputs, subBlockValues }
const customSections = []

export function registerIOSection(section) {
  if (!section?.key || !section?.Component) {
    throw new Error('registerIOSection: key and Component are required')
  }
  const existing = customSections.findIndex((s) => s.key === section.key)
  if (existing >= 0) customSections[existing] = section
  else customSections.push(section)
  customSections.sort((a, b) => (a.priority || 100) - (b.priority || 100))
}

export function getCustomIOSections() {
  return [...customSections]
}
