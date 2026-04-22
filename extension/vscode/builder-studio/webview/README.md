# Builder Studio — Webview Assets

This directory (`webview/dist/`) contains the built React app that the VS Code extension
loads as a WebView panel.

## Build

From the **convengine-ui** root:

```bash
VITE_CONVENGINE_BASE=BRIDGE_BASE_PLACEHOLDER \
  vite build --config vite.extension.config.js
```

Or use the npm script in the extension:

```bash
# from extension/vscode/builder-studio/
npm run build:webview
```

## How it works

1. The React app (`convengine-ui`) is built with Vite using `vite.extension.config.js`.
2. `VITE_CONVENGINE_BASE=BRIDGE_BASE_PLACEHOLDER` — this sentinel string gets baked
   into the JS bundles wherever the API base URL is used.
3. At runtime, `BuilderStudioPanel._getHtml()` replaces every occurrence of
   `BRIDGE_BASE_PLACEHOLDER` with `http://127.0.0.1:<bridgePort>/api/v1`.
4. Additionally, `window.__BS_BRIDGE_BASE__` is injected via an inline script
   before `</head>` so the app can read it at startup.

## API client compatibility

The React app's api clients (`src/builder-studio/api/*.js`) use:

```js
const BASE = (
  import.meta.env?.VITE_CONVENGINE_BASE ||
  (import.meta.env?.DEV ? '/api/v1' : 'http://localhost:8080/api/v1')
).replace(/\/$/, '')
```

Because `VITE_CONVENGINE_BASE=BRIDGE_BASE_PLACEHOLDER` is set at build time,
the bundle contains `BRIDGE_BASE_PLACEHOLDER` which the panel replaces with
the actual address. No code changes needed in the React app.

## Rebuilt needed when

- Any React component or block is updated in `convengine-ui/src/builder-studio/`
- Tailwind/CSS changes
- New block types are added

The extension itself (TypeScript) only needs `npm run compile` (or `tsc`).
