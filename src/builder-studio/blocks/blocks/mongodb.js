/** MongoDB block — CRUD operations on MongoDB collections. */
import { PostgresIcon } from '../../components/icons'

export const MongoDbBlock = {
  type: 'mongodb',
  name: 'MongoDB',
  description: 'Read and write MongoDB documents',
  longDescription:
    'Connect to a MongoDB instance to perform CRUD operations on collections. Supports find, insert, update, delete, and aggregate pipeline queries. Ideal for document-based data storage.',
  category: 'tools',
  bgColor: '#059669',
  icon: PostgresIcon,
  subBlocks: [
    {
      id: 'connectionUrl',
      title: 'Connection String',
      type: 'short-input',
      placeholder: 'mongodb://localhost:27017/mydb',
      required: true,
    },
    { id: 'collection', title: 'Collection', type: 'short-input', placeholder: 'users', required: true },
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'Find', id: 'find' },
        { label: 'Find One', id: 'findOne' },
        { label: 'Insert One', id: 'insertOne' },
        { label: 'Insert Many', id: 'insertMany' },
        { label: 'Update One', id: 'updateOne' },
        { label: 'Update Many', id: 'updateMany' },
        { label: 'Delete One', id: 'deleteOne' },
        { label: 'Delete Many', id: 'deleteMany' },
        { label: 'Aggregate', id: 'aggregate' },
        { label: 'Count', id: 'count' },
      ],
    },
    {
      id: 'query',
      title: 'Query / Filter',
      type: 'code',
      placeholder: '{ "status": "active" }',
      language: 'json',
    },
    {
      id: 'document',
      title: 'Document / Update',
      type: 'code',
      placeholder: '{ "$set": { "name": "John" } }',
      language: 'json',
    },
    { id: 'limit', title: 'Limit', type: 'short-input', placeholder: '100', mode: 'advanced' },
    { id: 'sort', title: 'Sort', type: 'short-input', placeholder: '{ "createdAt": -1 }', mode: 'advanced' },
  ],
  tools: { access: ['mongodb'] },
  inputs: {
    connectionUrl: { type: 'string', description: 'MongoDB connection string' },
    collection: { type: 'string', description: 'Collection name' },
    operation: { type: 'string', description: 'CRUD operation' },
    query: { type: 'json', description: 'Query filter' },
    document: { type: 'json', description: 'Document data or update' },
  },
  outputs: {
    result: { type: 'json', description: 'Operation result' },
    count: { type: 'number', description: 'Matched/modified document count' },
    insertedId: { type: 'string', description: 'Inserted document ID (for inserts)' },
  },
}
