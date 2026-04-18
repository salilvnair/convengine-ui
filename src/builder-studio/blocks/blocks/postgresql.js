/** Ported from sim/apps/sim/blocks/blocks/postgresql.ts. */
import { PostgresIcon } from '../../components/icons'
import { IntegrationType } from '../types'

export const PostgreSQLBlock = {
  type: 'postgresql',
  name: 'PostgreSQL',
  description: 'Connect to PostgreSQL database',
  longDescription:
    'Integrate PostgreSQL into the workflow. Can query, insert, update, delete, and execute raw SQL.',
  docsLink: 'https://docs.sim.ai/tools/postgresql',
  category: 'tools',
  integrationType: IntegrationType.Databases,
  tags: ['data-warehouse', 'data-analytics'],
  bgColor: '#336791',
  icon: PostgresIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Query (SELECT)', id: 'query' },
        { label: 'Insert Data', id: 'insert' },
        { label: 'Update Data', id: 'update' },
        { label: 'Delete Data', id: 'delete' },
        { label: 'Execute Raw SQL', id: 'execute' },
        { label: 'Introspect Schema', id: 'introspect' },
      ],
      value: () => 'query',
    },
    { id: 'host', title: 'Host', type: 'short-input', placeholder: 'localhost', required: true },
    { id: 'port', title: 'Port', type: 'short-input', placeholder: '5432', value: () => '5432', required: true },
    { id: 'database', title: 'Database Name', type: 'short-input', placeholder: 'your_database', required: true },
    { id: 'username', title: 'Username', type: 'short-input', placeholder: 'postgres', required: true },
    { id: 'password', title: 'Password', type: 'short-input', password: true, placeholder: 'Your database password', required: true },
    {
      id: 'ssl',
      title: 'SSL Mode',
      type: 'dropdown',
      options: [
        { label: 'Disabled', id: 'disabled' },
        { label: 'Required', id: 'required' },
        { label: 'Preferred', id: 'preferred' },
      ],
      value: () => 'preferred',
    },
    { id: 'table', title: 'Table Name', type: 'short-input', placeholder: 'users', condition: { field: 'operation', value: 'insert' }, required: true },
    { id: 'table', title: 'Table Name', type: 'short-input', placeholder: 'users', condition: { field: 'operation', value: 'update' }, required: true },
    { id: 'table', title: 'Table Name', type: 'short-input', placeholder: 'users', condition: { field: 'operation', value: 'delete' }, required: true },
    {
      id: 'query',
      title: 'SQL Query',
      type: 'code',
      placeholder: 'SELECT * FROM users WHERE active = true',
      language: 'json',
      condition: { field: 'operation', value: 'query' },
      required: true,
    },
    {
      id: 'query',
      title: 'SQL Query',
      type: 'code',
      placeholder: 'SELECT * FROM table_name',
      language: 'json',
      condition: { field: 'operation', value: 'execute' },
      required: true,
    },
    { id: 'data', title: 'Data (JSON)', type: 'code', language: 'json', condition: { field: 'operation', value: 'insert' }, required: true },
    { id: 'data', title: 'Update Data (JSON)', type: 'code', language: 'json', condition: { field: 'operation', value: 'update' }, required: true },
    { id: 'where', title: 'WHERE Condition', type: 'short-input', placeholder: 'id = 1', condition: { field: 'operation', value: 'update' }, required: true },
    { id: 'where', title: 'WHERE Condition', type: 'short-input', placeholder: 'id = 1', condition: { field: 'operation', value: 'delete' }, required: true },
    { id: 'schema', title: 'Schema Name', type: 'short-input', placeholder: 'public', value: () => 'public', condition: { field: 'operation', value: 'introspect' } },
  ],
  tools: {
    access: [
      'postgresql_query',
      'postgresql_insert',
      'postgresql_update',
      'postgresql_delete',
      'postgresql_execute',
      'postgresql_introspect',
    ],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'query': return 'postgresql_query'
          case 'insert': return 'postgresql_insert'
          case 'update': return 'postgresql_update'
          case 'delete': return 'postgresql_delete'
          case 'execute': return 'postgresql_execute'
          case 'introspect': return 'postgresql_introspect'
          default: throw new Error(`Invalid PostgreSQL operation: ${params.operation}`)
        }
      },
      params: (params) => {
        const { operation, data, ...rest } = params
        let parsedData
        if (data && typeof data === 'string' && data.trim()) {
          try { parsedData = JSON.parse(data) } catch (e) {
            throw new Error(`Invalid JSON data format: ${e.message}`)
          }
        } else if (data && typeof data === 'object') parsedData = data
        const result = {
          host: rest.host,
          port: typeof rest.port === 'string' ? Number.parseInt(rest.port, 10) : rest.port || 5432,
          database: rest.database,
          username: rest.username,
          password: rest.password,
          ssl: rest.ssl || 'preferred',
        }
        if (rest.table) result.table = rest.table
        if (rest.query) result.query = rest.query
        if (rest.where) result.where = rest.where
        if (rest.schema) result.schema = rest.schema
        if (parsedData !== undefined) result.data = parsedData
        return result
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Database operation' },
    host: { type: 'string', description: 'Database host' },
    port: { type: 'string', description: 'Database port' },
    database: { type: 'string', description: 'Database name' },
    username: { type: 'string', description: 'Database username' },
    password: { type: 'string', description: 'Database password' },
    ssl: { type: 'string', description: 'SSL mode' },
    table: { type: 'string', description: 'Table name' },
    query: { type: 'string', description: 'SQL query to execute' },
    data: { type: 'json', description: 'Data for insert/update' },
    where: { type: 'string', description: 'WHERE clause' },
    schema: { type: 'string', description: 'Schema name for introspection' },
  },
  outputs: {
    message: { type: 'string', description: 'Success or error message' },
    rows: { type: 'array', description: 'Rows returned from the query' },
    rowCount: { type: 'number', description: 'Number of rows affected' },
    tables: { type: 'array', description: 'Schemas (introspect)' },
    schemas: { type: 'array', description: 'Available schemas (introspect)' },
  },
}
