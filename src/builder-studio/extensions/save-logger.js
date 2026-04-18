/**
 * EXAMPLE EXTENSION — auto-registered via the registry's import.meta.glob.
 *
 * Drop any `.js` file into `builder-studio/extensions/` that exports a default
 * BlockConfig (or a named `block` / `<Name>Block` export) and it will appear
 * in the toolbar automatically. This mirrors the ComfyUI custom-nodes pattern:
 * zero boilerplate, zero registration call required.
 */
import { ExtensionIcon } from '../components/icons'

/** @type {import('../blocks/types').BlockConfig} */
const SaveLoggerBlock = {
  type: 'ext_save_logger',
  name: 'Save Logger',
  description: 'Append a labeled payload to an in-memory run log',
  longDescription:
    'Example third-party extension. Demonstrates how a dropped-in block auto-appears in the Builder Studio toolbar without modifying core files.',
  category: 'tools',
  bgColor: '#EC4899',
  icon: ExtensionIcon,
  subBlocks: [
    {
      id: 'label',
      title: 'Label',
      type: 'short-input',
      placeholder: 'checkout.step1',
      required: true,
    },
    {
      id: 'level',
      title: 'Level',
      type: 'dropdown',
      options: [
        { label: 'Debug', id: 'debug' },
        { label: 'Info', id: 'info' },
        { label: 'Warn', id: 'warn' },
        { label: 'Error', id: 'error' },
      ],
      value: () => 'info',
    },
    {
      id: 'payload',
      title: 'Payload',
      type: 'code',
      language: 'json',
      placeholder: '{\n  "message": "<agent.content>"\n}',
    },
    {
      id: 'persist',
      title: 'Persist to localStorage',
      type: 'switch',
      mode: 'advanced',
    },
  ],
  tools: {
    access: ['ext_save_logger_write'],
    config: {
      tool: () => 'ext_save_logger_write',
      params: (p) => ({
        label: p.label,
        level: p.level || 'info',
        payload: p.payload,
        persist: Boolean(p.persist),
      }),
    },
  },
  inputs: {
    label: { type: 'string', description: 'Log label' },
    level: { type: 'string', description: 'Log level' },
    payload: { type: 'json', description: 'Payload to record' },
    persist: { type: 'boolean', description: 'Mirror into localStorage' },
  },
  outputs: {
    stored: { type: 'boolean', description: 'Whether the line was stored' },
    at: { type: 'string', description: 'ISO timestamp of the log entry' },
  },
}

export default SaveLoggerBlock
