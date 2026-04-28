/**
 * Audio Input block — record audio from microphone, output as base64 blob.
 *
 * Records directly on the canvas card via the browser's MediaRecorder API.
 * No subBlock config — just click Record, speak, stop. Outputs the raw
 * base64-encoded audio blob downstream. Use a Mapper block or Skill block
 * to shape the data for specific consumers (e.g. whisper-mcp).
 */
import { MicIcon } from '../components/icons-mic'

const AudioInputBlock = {
  type: 'audio_input',
  name: 'Audio Input',
  description: 'Record audio from microphone → base64 blob',
  longDescription:
    'Records audio from the browser microphone and outputs a base64-encoded '
    + 'blob with format and duration metadata. Wire downstream to a Mapper '
    + 'or MCP block for processing.',
  category: 'triggers',
  bgColor: '#EC4899',
  icon: MicIcon,
  subBlocks: [],
  tools: { access: [] },
  inputs: {
    input: { type: 'any', description: 'Optional upstream data to include with the audio output' },
  },
  outputs: {
    audio: { type: 'json', description: 'Base64-encoded audio blob with format + duration' },
  },
}

export default AudioInputBlock
