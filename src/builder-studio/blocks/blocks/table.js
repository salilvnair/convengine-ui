/** Table block — mirrors sim's table shape for structured data I/O. */
import { TableIcon } from '../../components/icons'

export const TableBlock = {
  type: 'table',
  name: 'Table',
  description: 'Read/write structured data',
  category: 'blocks',
  bgColor: '#14B8A6',
  icon: TableIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Read rows', id: 'read' },
        { label: 'Insert rows', id: 'insert' },
        { label: 'Update rows', id: 'update' },
      ],
      value: () => 'read',
    },
    { id: 'table', title: 'Table', type: 'table-selector', required: true },
    { id: 'filters', title: 'Filters', type: 'filter-builder', condition: { field: 'operation', value: ['read', 'update'] } },
    { id: 'sort', title: 'Sort', type: 'sort-builder', condition: { field: 'operation', value: 'read' } },
    { id: 'data', title: 'Data', type: 'code', language: 'json', condition: { field: 'operation', value: ['insert', 'update'] } },
  ],
  tools: { access: [] },
  inputs: {
    operation: { type: 'string', description: 'read, insert or update' },
    table: { type: 'string', description: 'Table identifier' },
    filters: { type: 'json', description: 'Filter predicate tree' },
    sort: { type: 'json', description: 'Sort clauses' },
    data: { type: 'json', description: 'Rows for insert/update' },
  },
  outputs: {
    rows: { type: 'array', description: 'Matching rows' },
    count: { type: 'number', description: 'Affected row count' },
  },
}
