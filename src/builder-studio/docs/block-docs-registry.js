/**
 * Block Documentation Registry
 * 
 * Registry-driven documentation system for workflow blocks.
 * Each block can register its own documentation with field descriptions,
 * tips, alerts, and rich metadata.
 * 
 * To add docs for a new block:
 *   1. Import registerBlockDocs
 *   2. Call registerBlockDocs('your_block_type', { ...docConfig })
 *   3. The about icon will automatically appear in the inspector
 */

const _docs = new Map()

/**
 * Register documentation for a block type.
 * @param {string} blockType — must match the block's `type` key
 * @param {BlockDoc} doc
 *
 * BlockDoc shape:
 * {
 *   title: string,
 *   icon: string (emoji or short label),
 *   category: 'core' | 'tool' | 'trigger' | 'custom',
 *   categoryColor: string (hex),
 *   summary: string,
 *   tip?: string,
 *   alert?: string,
 *   fields: [
 *     {
 *       name: string,
 *       label: string,
 *       type: string,
 *       badge?: string,
 *       badgeColor?: string,
 *       description: string,
 *       tip?: string,
 *       alert?: string,
 *       defaultValue?: string,
 *       required?: boolean,
 *       advanced?: boolean,
 *     }
 *   ]
 * }
 */
export function registerBlockDocs(blockType, doc) {
  _docs.set(blockType, doc)
}

/** Get docs for a block type */
export function getBlockDocs(blockType) {
  return _docs.get(blockType) || null
}

/** Check if a block has docs registered */
export function hasBlockDocs(blockType) {
  return _docs.has(blockType)
}

/** Get all registered doc keys */
export function getAllDocKeys() {
  return [..._docs.keys()]
}
