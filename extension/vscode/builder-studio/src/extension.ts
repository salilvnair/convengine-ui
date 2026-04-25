/**
 * VS Code extension entry point for Builder Studio.
 *
 * On activate():
 *  1. Starts the Express bridge server on a random free port
 *  2. Initialises SQLite storage (workspace, MCP configs, deployments)
 *  3. Restores any persisted cron/webhook deployments
 *  4. Registers the `bs.start` command
 *  5. Registers the `@bs` chat participant
 */
import * as vscode from 'vscode';
import { startBridgeServer, stopBridgeServer } from './bridge/server';
import { BuilderStudioPanel } from './panel/BuilderStudioPanel';
import { WikiViewProvider } from './panel/WikiViewProvider';
import { registerChatParticipant } from './chat/participant';
import { initDb } from './storage/db';
import { initWorkspaceService } from './services/workspace';
import { initMcpService, disposeMcpService } from './services/mcp';
import { initScheduler, disposeAll as disposeScheduler } from './engine/scheduler';
import { callAgentViaCopilot } from './services/llm';
import { loadActiveFamilyFromDb } from './bridge/routes/provider';
import { initConfigService } from './bridge/routes/config';
import { callTool } from './services/mcp';

let _bridgePort: number | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const storagePath = context.globalStorageUri.fsPath;

  /* ── 1. Init file-based store ── */
  initDb(storagePath);
  loadActiveFamilyFromDb();   // restore persisted default model selection
  initWorkspaceService(storagePath);
  initMcpService(storagePath);
  initConfigService(storagePath);

  /* ── 2. Init scheduler (restores cron/webhook deployments from DB) ── */
  initScheduler(
    storagePath,
    callAgentViaCopilot as (req: unknown) => Promise<unknown>,
    callTool,
  );

  /* ── 3. Start bridge server ── */
  try {
    _bridgePort = await startBridgeServer();
  } catch (err: unknown) {
    vscode.window.showErrorMessage(
      `Builder Studio: Failed to start bridge server — ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  /* ── 4. Register commands ── */
  context.subscriptions.push(
    vscode.commands.registerCommand('bs.start', () => {
      BuilderStudioPanel.createOrShow(context.extensionUri, _bridgePort!);
    }),
  );

  /* ── Activity bar icon — opens the editor panel, sidebar stays open ── */
  const canvasTreeView = vscode.window.createTreeView('bs.canvasView', {
    treeDataProvider: { getTreeItem: (e) => e, getChildren: () => [] },
  });
  context.subscriptions.push(canvasTreeView);

  /* ── Wiki reference sidebar panel ── */
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WikiViewProvider.viewId, new WikiViewProvider()),
  );

  context.subscriptions.push(
    canvasTreeView.onDidChangeVisibility((e) => {
      if (!e.visible) return;
      // Open the panel (no-op if already open) then focus the editor area.
      // We intentionally do NOT close the sidebar — closing it causes the
      // open→close animation flicker and deselects the activity bar icon.
      BuilderStudioPanel.createOrShow(context.extensionUri, _bridgePort!);
      vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bs.stopBridge', () => {
      stopBridgeServer();
      vscode.window.showInformationMessage('Builder Studio: Bridge server stopped.');
    }),
  );

  /* ── 5. Register @bs chat participant ── */
  registerChatParticipant(context, _bridgePort);

  /* ── Status bar item ── */
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.text  = `$(zap) Builder Studio :${_bridgePort}`;
  statusItem.tooltip = 'Click to open Builder Studio canvas';
  statusItem.command = 'bs.start';
  statusItem.show();
  context.subscriptions.push(statusItem);

  console.log(`[builder-studio] Extension activated. Bridge: http://127.0.0.1:${_bridgePort}`);
}

export function deactivate() {
  disposeMcpService(); // kill any running stdio subprocesses
  disposeScheduler();  // stop all in-process cron timers
  stopBridgeServer();
  console.log('[builder-studio] Extension deactivated.');
}
