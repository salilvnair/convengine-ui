/**
 * @bs chat participant — registered with VS Code's chat API.
 *
 * Usage:
 *   @bs start          — opens the Builder Studio canvas
 *   @bs help           — shows quick-start info
 *   @bs deploy <id>    — deploys a workflow by ID
 *   @bs deployments    — lists active deployments
 *   @bs (anything)     — describes what Builder Studio can do
 */
import * as vscode from 'vscode';
import { BuilderStudioPanel } from '../panel/BuilderStudioPanel';

const PARTICIPANT_ID = 'bs';

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  bridgePort: number,
) {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');

  context.subscriptions.push(participant);

  async function handler(
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const cmd   = request.command ?? '';
    const query = request.prompt.trim().toLowerCase();

    /* ── @bs start ── */
    if (cmd === 'start' || query === 'start') {
      stream.markdown('Opening **Builder Studio** canvas… 🚀');
      stream.button({ command: 'bs.start', title: '⚡ Open Builder Studio' });
      BuilderStudioPanel.createOrShow(context.extensionUri, bridgePort);
      return;
    }

    /* ── @bs help ── */
    if (cmd === 'help' || query === 'help') {
      stream.markdown(
        [
          '## ⚡ Builder Studio',
          '',
          'A visual agentic workflow builder running inside VS Code, powered by **GitHub Copilot**.',
          '',
          '### Quick start',
          '```',
          '@bs start',
          '```',
          '',
          '### What you can do',
          '- **Drag & drop blocks** — agents, conditions, API calls, MCP tools, loops, cron triggers, webhooks and more',
          '- **Run workflows** — BFS graph executor runs entirely inside VS Code, LLM calls go through GitHub Copilot',
          '- **Deploy** — cron-scheduled workflows keep running as long as VS Code is open; webhook endpoints are live at `http://127.0.0.1:' + bridgePort + '/hook/<id>`',
          '- **MCP servers** — connect any HTTP/JSON-RPC MCP server, browse tools, use them as blocks',
          '- **Persist** — workspaces are saved to SQLite in your VS Code global storage',
          '',
          '### Commands',
          '| Command | Description |',
          '|---|---|',
          '| `@bs start` | Open the canvas |',
          '| `@bs deployments` | List active deployments |',
          '| `@bs help` | Show this message |',
          '',
          `> Bridge server: \`http://127.0.0.1:${bridgePort}\``,
        ].join('\n'),
      );
      return;
    }

    /* ── @bs deployments ── */
    if (cmd === 'deployments' || query === 'deployments' || query === 'list deployments') {
      try {
        const res  = await fetch(`http://127.0.0.1:${bridgePort}/api/v1/builder-studio/deployments`);
        const data = await res.json() as { deployments: Array<{ workflowId: string; trigger?: { type: string; cron?: string }; deployedAt: string; lastRun?: string; lastResult?: { success: boolean } }> };
        const list = data.deployments ?? [];
        if (list.length === 0) {
          stream.markdown('No active deployments. Open the canvas and deploy a workflow first.');
        } else {
          const rows = list.map((d) =>
            `| \`${d.workflowId}\` | ${d.trigger?.type ?? 'manual'} | ${d.trigger?.cron ?? '-'} | ${d.lastRun ? new Date(d.lastRun).toLocaleString() : 'never'} | ${d.lastResult ? (d.lastResult.success ? '✅' : '❌') : '-'} |`
          );
          stream.markdown(
            ['## Active Deployments', '', '| Workflow | Trigger | Cron | Last Run | Status |', '|---|---|---|---|---|', ...rows].join('\n'),
          );
        }
      } catch {
        stream.markdown('❌ Could not reach bridge server. Is the extension active?');
      }
      return;
    }

    /* ── Default — open canvas and explain ── */
    stream.markdown(
      [
        '**Builder Studio** is your visual agentic workflow canvas.',
        '',
        'Try one of these:',
        '- `@bs start` — open the canvas',
        '- `@bs help`  — full feature guide',
        '- `@bs deployments` — list running workflows',
      ].join('\n'),
    );
    stream.button({ command: 'bs.start', title: '⚡ Open Builder Studio' });
  }
}
