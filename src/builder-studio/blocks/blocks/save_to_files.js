/**
 * Save To Files — terminal node that takes whatever its upstream produced
 * (typically a Response node's JSON) and writes it to disk.
 *
 * If a path is configured the browser triggers a download; if not, we just
 * pass the payload through and the canvas card expands to show the received
 * JSON inline (Postman-style, colorized). That lets you wire this block
 * after a Response even when you don't actually want a file yet — handy for
 * debugging demo runs.
 */
import { ResponseIcon as DocumentIcon } from '../../components/icons'

export const SaveToFilesBlock = {
  type: 'save_to_files',
  name: 'Save To Files',
  description: 'Write upstream output to a file (or preview it on the card).',
  category: 'blocks',
  bgColor: '#0EA5E9',
  icon: DocumentIcon,
  subBlocks: [
    {
      id: 'path',
      title: 'Output path',
      type: 'short-input',
      placeholder: 'leave blank to preview only (no download)',
      description:
        'Relative path inside the browser sandbox. Blank = do not save; just preview the JSON below.',
    },
    {
      id: 'format',
      title: 'Format',
      type: 'dropdown',
      options: [
        { label: 'JSON (pretty)', id: 'json' },
        { label: 'Raw string', id: 'raw' },
      ],
      value: () => 'json',
    },
    {
      id: 'overwrite',
      title: 'Overwrite existing',
      type: 'switch',
      value: () => true,
    },
    // Purely presentational — the card renders this sub-block as a JSON
    // preview area showing the most recent upstream output. WorkflowNode
    // has a special-case renderer for `type: 'json-preview'`.
    {
      id: '__preview',
      title: 'Preview',
      type: 'json-preview',
      description: 'Live view of the most recent payload this block received.',
    },
  ],
  tools: { access: [] },
  inputs: {
    path: { type: 'string', description: 'Destination path (optional)' },
    format: { type: 'string', description: 'json | raw' },
    overwrite: { type: 'boolean', description: 'Overwrite existing file' },
  },
  outputs: {
    savedAt: { type: 'string', description: 'Resolved file path or null if preview-only' },
    bytes: { type: 'number', description: 'Size of the written payload' },
  },
}
