/** Redis block — read/write from Redis cache. */
import { PostgresIcon } from '../../components/icons'

export const RedisBlock = {
  type: 'redis',
  name: 'Redis',
  description: 'Read and write data from Redis',
  longDescription:
    'Connect to a Redis instance to get, set, delete keys, manage lists, sets, and hashes. Useful for caching, session management, pub/sub messaging, and rate limiting.',
  category: 'tools',
  bgColor: '#DC2626',
  icon: PostgresIcon,
  subBlocks: [
    {
      id: 'connectionUrl',
      title: 'Connection URL',
      type: 'short-input',
      placeholder: 'redis://localhost:6379',
      required: true,
    },
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'GET', id: 'get' },
        { label: 'SET', id: 'set' },
        { label: 'DEL', id: 'del' },
        { label: 'INCR', id: 'incr' },
        { label: 'LPUSH', id: 'lpush' },
        { label: 'RPUSH', id: 'rpush' },
        { label: 'LRANGE', id: 'lrange' },
        { label: 'HGET', id: 'hget' },
        { label: 'HSET', id: 'hset' },
        { label: 'HGETALL', id: 'hgetall' },
        { label: 'EXPIRE', id: 'expire' },
        { label: 'TTL', id: 'ttl' },
        { label: 'KEYS', id: 'keys' },
      ],
    },
    { id: 'key', title: 'Key', type: 'short-input', placeholder: 'my:key', required: true },
    { id: 'value', title: 'Value', type: 'long-input', placeholder: 'Value to set' },
    { id: 'field', title: 'Hash Field', type: 'short-input', placeholder: 'field name', mode: 'advanced' },
    { id: 'ttl', title: 'TTL (seconds)', type: 'short-input', placeholder: '3600', mode: 'advanced' },
  ],
  tools: { access: ['redis'] },
  inputs: {
    connectionUrl: { type: 'string', description: 'Redis connection URL' },
    operation: { type: 'string', description: 'Redis command' },
    key: { type: 'string', description: 'Key name' },
    value: { type: 'any', description: 'Value to set' },
  },
  outputs: {
    result: { type: 'any', description: 'Redis operation result' },
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
  },
}
