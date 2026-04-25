/**
 * Builder Studio WebView panel — hosts the React canvas inside VS Code.
 *
 * The React app is built from convengine-ui using `npm run build:webview`
 * (vite.extension.config.js). The built assets live in webview/dist/.
 *
 * At load time the extension:
 *  1. Reads webview/dist/index.html
 *  2. Rewrites all asset src/href to vscode-webview:// URIs
 *  3. Injects window.__BS_BRIDGE_BASE__ pointing to the bridge server
 *  4. Replaces the BRIDGE_BASE_PLACEHOLDER sentinel in JS bundles
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class BuilderStudioPanel {
  public static currentPanel: BuilderStudioPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, bridgePort: number) {
    this._panel       = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtml(bridgePort);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview (future: postMessage bridge)
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      undefined,
      this._disposables,
    );
  }

  public static createOrShow(extensionUri: vscode.Uri, bridgePort: number) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : vscode.ViewColumn.One;

    if (BuilderStudioPanel.currentPanel) {
      BuilderStudioPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'builderStudio',
      '⚡ Builder Studio',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview', 'dist')],
        retainContextWhenHidden: true, // keep React state when panel is hidden
      },
    );

    BuilderStudioPanel.currentPanel = new BuilderStudioPanel(panel, extensionUri, bridgePort);
  }

  /** Update the bridge port (e.g. if the server restarts) */
  public updateBridgePort(bridgePort: number) {
    this._panel.webview.html = this._getHtml(bridgePort);
  }

  private _getHtml(bridgePort: number): string {
    const distPath   = path.join(this._extensionUri.fsPath, 'webview', 'dist');
    // Vite preserves the input subdirectory in the output, so the built HTML
    // lands at dist/webview-entry/index.html (not dist/index.html).
    const htmlDir    = path.join(distPath, 'webview-entry');
    const indexPath  = path.join(htmlDir, 'index.html');

    if (!fs.existsSync(indexPath)) {
      return this._placeholderHtml(bridgePort);
    }

    const webview        = this._panel.webview;
    const bridgeBase     = `http://127.0.0.1:${bridgePort}/api/v1`;
    let html             = fs.readFileSync(indexPath, 'utf8');

    // Rewrite relative (./  ../  /assets/) asset paths to vscode-resource:// URIs.
    // Assets are at dist/assets/ but the HTML lives in dist/webview-entry/, so
    // Vite emits  ../assets/  paths.  path.resolve handles all three prefixes.
    html = html.replace(/(src|href)="((?:\.\.\/|\.\/|\/)[^"]+)"/g, (_match, attr: string, assetPath: string) => {
      let filePath: string;
      if (assetPath.startsWith('/')) {
        filePath = path.join(distPath, assetPath.slice(1));
      } else {
        filePath = path.resolve(htmlDir, assetPath);
      }
      const resourceUri = webview.asWebviewUri(vscode.Uri.file(filePath));
      return `${attr}="${resourceUri}"`;
    });

    // Remove 'crossorigin' attribute — vscode-resource:// URIs don't need CORS
    html = html.replace(/\s+crossorigin/g, '');

    // Inject runtime config before </head>
    // window.__BS_BRIDGE_BASE__ is read by all API clients at startup
    // (takes priority over the BRIDGE_BASE_PLACEHOLDER baked in at build time)
    const injectScript = `<script>
  globalThis.__BS_BRIDGE_BASE__ = '${bridgeBase}';
  window.__BS_MODE__ = 'vscode-extension';
  try { window.__BS_VSCODE_API__ = acquireVsCodeApi(); } catch(e) {}
</script>`;
    html = html.replace('</head>', `${injectScript}\n</head>`);

    // CSP — allow the bridge server origin and external https for skill fetch() calls
    const csp = [
      `default-src 'none'`,
      `script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'`,
      `style-src  ${webview.cspSource} 'unsafe-inline'`,
      `font-src   ${webview.cspSource} data:`,
      `img-src    ${webview.cspSource} data: https: blob:`,
      // Allow bridge server AND external URLs (needed for skill blocks that call fetch())
      `connect-src http://127.0.0.1:${bridgePort} ws://127.0.0.1:${bridgePort} https: http:`,
    ].join('; ');

    html = html.replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
    // If no CSP meta tag exists, insert one
    if (!html.includes('Content-Security-Policy')) {
      html = html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
    }

    return html;
  }

  private _placeholderHtml(bridgePort: number): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Builder Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, sans-serif);
      color: var(--vscode-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
      display: flex; align-items: center; justify-content: center;
      height: 100vh; flex-direction: column; gap: 20px; text-align: center;
    }
    h2 { font-size: 1.6rem; font-weight: 600; }
    p  { opacity: 0.7; font-size: 0.95rem; }
    code {
      background: var(--vscode-textBlockQuote-background, #2d2d2d);
      border: 1px solid var(--vscode-panel-border, #444);
      padding: 4px 10px; border-radius: 6px; font-size: 0.9rem;
      display: block; margin-top: 8px;
    }
    .badge {
      background: var(--vscode-badge-background, #0078d4);
      color: var(--vscode-badge-foreground, #fff);
      padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;
    }
  </style>
</head>
<body>
  <div>
    <div class="badge">Builder Studio</div>
    <h2 style="margin-top:12px">⚡ Webview not built yet</h2>
    <p>Bridge server is running on port <strong>${bridgePort}</strong></p>
    <p style="margin-top:16px">Build the canvas UI first:</p>
    <code>cd extension/vscode/builder-studio && npm run build:webview</code>
    <p style="margin-top:12px">Then reload the extension (F5 or <em>Developer: Reload Window</em>)</p>
  </div>
</body>
</html>`;
  }

  private _handleMessage(msg: { type: string; payload?: unknown }) {
    switch (msg.type) {
      case 'ping':
        this._panel.webview.postMessage({ type: 'pong' });
        break;
      case 'saveFile': {
        const { filename, content } = msg.payload as { filename: string; content: string };
        vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(filename),
          filters: { 'JSON': ['json'] },
        }).then((uri) => {
          if (!uri) return;
          fs.writeFile(uri.fsPath, content, 'utf8', (err) => {
            if (err) {
              vscode.window.showErrorMessage(`Failed to save file: ${err.message}`);
            } else {
              vscode.window.showInformationMessage(`Workflow exported to ${uri.fsPath}`);
            }
          });
        });
        break;
      }
    }
  }

  public dispose() {
    BuilderStudioPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
