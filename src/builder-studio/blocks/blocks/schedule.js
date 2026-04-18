/** Schedule trigger block — mirrors sim's schedule shape. */
import { ScheduleIcon } from '../../components/icons'

export const ScheduleBlock = {
  type: 'schedule',
  name: 'Schedule',
  description: 'Run workflow on a cron schedule',
  longDescription:
    'Runs the workflow on a recurring schedule. Supports cron expressions and timezone configuration.',
  docsLink: 'https://docs.sim.ai/triggers/schedule',
  category: 'triggers',
  bgColor: '#F59E0B',
  icon: ScheduleIcon,
  subBlocks: [
    { id: 'cron', title: 'Cron Expression', type: 'short-input', placeholder: '0 */5 * * *', required: true },
    { id: 'timezone', title: 'Timezone', type: 'short-input', placeholder: 'UTC', value: () => 'UTC' },
    { id: 'scheduleInfo', title: 'Schedule', type: 'schedule-info' },
  ],
  tools: { access: [] },
  inputs: {
    cron: { type: 'string', description: 'Cron expression' },
    timezone: { type: 'string', description: 'IANA timezone' },
  },
  outputs: {
    firedAt: { type: 'string', description: 'ISO timestamp of trigger fire' },
  },
}
