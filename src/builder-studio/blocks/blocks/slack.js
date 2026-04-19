/** Slack block — send messages and interact with Slack. */
import { SmtpIcon } from '../../components/icons'

export const SlackBlock = {
  type: 'slack',
  name: 'Slack',
  description: 'Send messages to Slack channels',
  longDescription:
    'Send messages, rich blocks, and attachments to Slack channels or users via the Slack API. Supports plain text, Block Kit formatted messages, file uploads, and reactions.',
  category: 'tools',
  bgColor: '#4A154B',
  icon: SmtpIcon,
  subBlocks: [
    { id: 'token', title: 'Bot Token', type: 'short-input', placeholder: 'xoxb-...', required: true },
    { id: 'channel', title: 'Channel', type: 'short-input', placeholder: '#general or C01234567', required: true },
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Send Message', id: 'send' },
        { label: 'Send Block Kit', id: 'blocks' },
        { label: 'Upload File', id: 'upload' },
        { label: 'Add Reaction', id: 'react' },
        { label: 'Update Message', id: 'update' },
      ],
    },
    { id: 'text', title: 'Message Text', type: 'long-input', placeholder: 'Hello from workflow!' },
    {
      id: 'blocks',
      title: 'Block Kit JSON',
      type: 'code',
      placeholder: '[ { "type": "section", "text": { "type": "mrkdwn", "text": "Hello" } } ]',
      language: 'json',
      mode: 'advanced',
    },
    { id: 'threadTs', title: 'Thread TS', type: 'short-input', placeholder: 'Reply to thread', mode: 'advanced' },
  ],
  tools: { access: ['slack'] },
  inputs: {
    token: { type: 'string', description: 'Slack bot token' },
    channel: { type: 'string', description: 'Channel ID or name' },
    text: { type: 'string', description: 'Message text' },
    operation: { type: 'string', description: 'Slack operation' },
  },
  outputs: {
    ok: { type: 'boolean', description: 'Whether the operation succeeded' },
    ts: { type: 'string', description: 'Message timestamp' },
    channel: { type: 'string', description: 'Channel ID' },
  },
}
