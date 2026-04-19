/** Crypto block — hash, encrypt, encode data. */
import { CodeIcon } from '../../components/icons'

export const CryptoBlock = {
  type: 'crypto',
  name: 'Crypto',
  description: 'Hash, encrypt, and encode data',
  longDescription:
    'Performs cryptographic operations on data including hashing (SHA-256, MD5, SHA-512), encoding (Base64, Hex, URL), HMAC signing, and UUID generation. Useful for API signatures, data integrity checks, and token generation.',
  category: 'tools',
  bgColor: '#475569',
  icon: CodeIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      required: true,
      options: [
        { label: 'SHA-256 Hash', id: 'sha256' },
        { label: 'SHA-512 Hash', id: 'sha512' },
        { label: 'MD5 Hash', id: 'md5' },
        { label: 'HMAC-SHA256', id: 'hmac_sha256' },
        { label: 'Base64 Encode', id: 'base64_encode' },
        { label: 'Base64 Decode', id: 'base64_decode' },
        { label: 'URL Encode', id: 'url_encode' },
        { label: 'URL Decode', id: 'url_decode' },
        { label: 'Generate UUID', id: 'uuid' },
      ],
    },
    { id: 'data', title: 'Data', type: 'long-input', placeholder: 'Enter data to process', required: true },
    { id: 'secret', title: 'Secret Key', type: 'short-input', placeholder: 'HMAC secret (if needed)', mode: 'advanced' },
  ],
  tools: { access: ['crypto'] },
  inputs: {
    operation: { type: 'string', description: 'Cryptographic operation to perform' },
    data: { type: 'string', description: 'Input data' },
    secret: { type: 'string', description: 'Secret key for HMAC operations' },
  },
  outputs: {
    result: { type: 'string', description: 'Operation result' },
  },
}
