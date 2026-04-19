import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const defaultBasePath = process.env.NODE_ENV === 'production' ? '/convengine/' : '/'
const rawBasePath = process.env.VITE_BASE_PATH ?? defaultBasePath
const normalizedBasePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`

// https://vite.dev/config/
export default defineConfig({
  base: normalizedBasePath,
  build: {
    outDir: '../o1cd-ui/convengine-ui/dist',
    emptyOutDir: true,
  },
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
  },
  plugins: [
      react(),
      tailwindcss(),
  ],
  server: {
    proxy: {
      // Builder-studio & MCP routes → ce-builder-studio (port 3001)
      '/api/v1/builder-studio': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/v1/mcp': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Everything else (conversation, cache, db, semantic) → convengine-demo (port 8080)
      '/api/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
