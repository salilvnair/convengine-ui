/**
 * User Input block — a runtime prompt. When the workflow runs, the RunModal
 * collects a value for every `user_input` node on the canvas, and forwards
 * the value as the node's output to downstream edges.
 *
 * Unlike `starter` (which has a baked "manual or chat" dropdown), this block
 * is purpose-built for inline runtime input: just a label + placeholder +
 * the kind of input we want (short text / long text / url / number).
 */
import { VariableIcon } from '../../components/icons'

export const UserInputBlock = {
  type: 'user_input',
  name: 'User Input',
  description: 'Prompt user at runtime',
  longDescription:
    'Collect a value from the user when the workflow runs. The value is passed as this node\'s output to the next block.',
  category: 'blocks',
  bgColor: '#FBBF24',
  icon: VariableIcon,
  subBlocks: [
    {
      id: 'label',
      title: 'Label',
      type: 'short-input',
      description: 'Shown next to the input field in the Run dialog.',
      value: () => 'Input',
    },
    {
      id: 'kind',
      title: 'Kind',
      type: 'dropdown',
      options: [
        { label: 'Short text', id: 'short-text' },
        { label: 'Long text', id: 'long-text' },
        { label: 'URL', id: 'url' },
        { label: 'Email', id: 'email' },
        { label: 'Password', id: 'password' },
        { label: 'Phone', id: 'tel' },
        { label: 'Number', id: 'number' },
        { label: 'Range / Slider', id: 'range' },
        { label: 'Dropdown', id: 'dropdown' },
        { label: 'Radio', id: 'radio' },
        { label: 'Checkbox', id: 'checkbox' },
        { label: 'Checkbox group', id: 'checkbox-group' },
        { label: 'Toggle', id: 'toggle' },
        { label: 'Date', id: 'date' },
        { label: 'Time', id: 'time' },
        { label: 'Date & Time', id: 'datetime' },
        { label: 'Color', id: 'color' },
        { label: 'File', id: 'file' },
        { label: 'Hidden', id: 'hidden' },
        { label: 'JSON', id: 'json' },
      ],
      value: () => 'short-text',
    },
    {
      id: 'placeholder',
      title: 'Placeholder',
      type: 'short-input',
      value: () => '',
    },
    {
      id: 'options',
      title: 'Options (comma-separated or JSON)',
      type: 'long-input',
      description: 'List of choices for dropdown, radio, or checkbox-group. Comma-separated strings or JSON array of {label,value}.',
      value: () => '',
      condition: { field: 'kind', value: ['dropdown', 'radio', 'checkbox-group'] },
    },
    {
      id: 'optionPairs',
      title: 'Option key/value pairs',
      type: 'table',
      columns: ['Label', 'Value'],
      description: 'Structured options. Each row maps visible label to stored value.',
      value: () => [],
      condition: { field: 'kind', value: ['dropdown', 'radio', 'checkbox-group'] },
    },
    {
      id: 'min',
      title: 'Min',
      type: 'short-input',
      description: 'Minimum value for number / range.',
      value: () => '',
      condition: { field: 'kind', value: ['number', 'range'] },
    },
    {
      id: 'max',
      title: 'Max',
      type: 'short-input',
      description: 'Maximum value for number / range.',
      value: () => '',
      condition: { field: 'kind', value: ['number', 'range'] },
    },
    {
      id: 'step',
      title: 'Step',
      type: 'short-input',
      description: 'Step increment for number / range.',
      value: () => '',
      condition: { field: 'kind', value: ['number', 'range'] },
    },
    {
      id: 'dateFormat',
      title: 'Date Format',
      type: 'dropdown',
      description: 'Display format. The stored value is always ISO (YYYY-MM-DD).',
      options: [
        { label: 'YYYY-MM-DD (ISO)', id: 'YYYY-MM-DD' },
        { label: 'MM/DD/YYYY', id: 'MM/DD/YYYY' },
        { label: 'DD/MM/YYYY', id: 'DD/MM/YYYY' },
      ],
      value: () => 'YYYY-MM-DD',
      condition: { field: 'kind', value: ['date', 'datetime'] },
    },
    {
      id: 'accept',
      title: 'Accept (file types)',
      type: 'short-input',
      description: 'Comma-separated MIME types or extensions, e.g. ".pdf,.png,image/*".',
      value: () => '',
      condition: { field: 'kind', value: ['file'] },
    },
    {
      id: 'checkedValue',
      title: 'Checked value',
      type: 'short-input',
      description: 'Stored output when checked (optional). Defaults to boolean true.',
      value: () => '',
      condition: { field: 'kind', value: ['checkbox', 'toggle'] },
    },
    {
      id: 'uncheckedValue',
      title: 'Unchecked value',
      type: 'short-input',
      description: 'Stored output when unchecked (optional). Defaults to boolean false.',
      value: () => '',
      condition: { field: 'kind', value: ['checkbox', 'toggle'] },
    },
    {
      // Promoted from advanced → primary. If this is filled, the Run dock
      // skips the prompt step and auto-runs with this value. Behaves like
      // ComfyUI's "this field IS the input" ergonomics.
      id: 'defaultValue',
      title: 'Default Value',
      type: 'short-input',
      description:
        'Pre-filled value. If set, the workflow auto-runs with this value without opening an input dialog.',
      value: () => '',
      condition: { field: 'kind', value: ['password', 'json'], not: true },
    },
    {
      // JSON default value — edited with the full JSON editor
      id: 'defaultValue',
      title: 'Default Value',
      type: 'json-editor',
      description:
        'Pre-filled JSON value. If set, the workflow auto-runs with this value without opening an input dialog.',
      value: () => '{}',
      condition: { field: 'kind', value: ['json'] },
    },
    {
      // Password default value — masked with eye toggle
      id: 'defaultValue',
      title: 'Default Value',
      type: 'short-input',
      password: true,
      description:
        'Pre-filled password. If set, the workflow auto-runs with this value without opening an input dialog.',
      value: () => '',
      condition: { field: 'kind', value: ['password'] },
    },
    {
      id: 'required',
      title: 'Required',
      type: 'switch',
      value: () => true,
    },
  ],
  tools: { access: [] },
  inputs: {},
  outputs: {
    value: { type: 'any', description: 'Runtime value produced by this input kind.' },
  },
}
