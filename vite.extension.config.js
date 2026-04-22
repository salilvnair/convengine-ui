/**
 * Vite build config for the VS Code extension webview.
 *
 * Builds the builder-studio React app as a single-page app
 * with all assets inlined or hashed, output to:
 *   extension/vscode/builder-studio/webview/dist/
 *
 * Usage:
 *   cd convengine-ui
 *   VITE_CONVENGINE_BASE=BRIDGE_BASE_PLACEHOLDER vite build --config vite.extension.config.js
 *
 * The sentinel value BRIDGE_BASE_PLACEHOLDER is replaced at runtime by
 * BuilderStudioPanel._getHtml() with the actual bridge server address.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

export default defineConfig({
  // No base path — the WebView serves assets via vscode-webview:// URIs
  base: './',

  build: {
    outDir: 'extension/vscode/builder-studio/webview/dist',
    emptyOutDir: true,
    // Inline small assets so WebView CSP doesn't need extra sources
    assetsInlineLimit: 8192,
    rollupOptions: {
      // Dedicated webview entry — mounts only AgentBuilderPage.
      // Named 'index' so Vite outputs webview/dist/index.html (not webview-entry/index.html).
      input: { index: resolve(process.cwd(), 'webview-entry/index.html') },
    },
  },

  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
  },

  plugins: [react(), tailwindcss()],

  // No proxy needed — the WebView calls the bridge server directly
  server: {
    proxy: {},
  },
});
