/**
 * In-extension scheduler — handles cron jobs and webhook triggers.
 *
 * Unlike the AKS-oriented ce-builder-studio scheduler which offloads cron
 * to an external CronJob, the VS Code extension scheduler runs in-process
 * (using setInterval) because VS Code IS the always-running process.
 *
 * State is persisted to SQLite so deployments survive extension reloads.
 */
import { upsert, remove, findAll } from '../storage/db';
import type { Workflow } from '../types';

let _storagePath = '';
let _callAgent: ((req: unknown) => Promise<unknown>) | null = null;
let _callTool: ((serverId: string, tool: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;

export function initScheduler(
  storagePath: string,
  callAgent: (req: unknown) => Promise<unknown>,
  callTool: (serverId: string, tool: string, args: Record<string, unknown>) => Promise<unknown>,
) {
  _storagePath = storagePath;
  _callAgent   = callAgent;
  _callTool    = callTool;
  _loadFromDb();
}

/* ── Types ── */

interface TriggerConfig {
  type: 'cron' | 'webhook' | 'manual';
  cron?: string;
  timezone?: string;
}

interface DeployedWorkflow {
  workflowId: string;
  workflow: Workflow;
  trigger?: TriggerConfig;
  deployedAt: string;
  cronTimer?: ReturnType<typeof setInterval>;
  lastRun?: string;
  lastResult?: { success: boolean; error?: string };
}

interface WebhookInput {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
}

/* ── In-memory store ── */
const deployments = new Map<string, DeployedWorkflow>();

/* ── Cron parsing (simple subset) ── */
function parseCronToMs(cron: string): number | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour, dom] = parts;
  if (min.startsWith('*/') && hour === '*' && dom === '*') {
    const n = parseInt(min.slice(2), 10);
    if (!isNaN(n) && n > 0) return n * 60 * 1000;
  }
  if (min === '0' && hour.startsWith('*/') && dom === '*') {
    const n = parseInt(hour.slice(2), 10);
    if (!isNaN(n) && n > 0) return n * 60 * 60 * 1000;
  }
  if (min === '0' && hour === '0' && dom === '*') return 24 * 60 * 60 * 1000;
  console.warn(`[scheduler] Cannot parse cron "${cron}", defaulting to 1h`);
  return 60 * 60 * 1000;
}

/* ── DB persistence ── */

interface DeploymentRecord {
  workflowId: string;
  workflowData: Workflow;
  trigger?: TriggerConfig;
  deployedAt: string;
  lastRun?: string | null;
  lastResult?: unknown;
}

function _saveToDb(d: DeployedWorkflow) {
  const rec: DeploymentRecord = {
    workflowId:   d.workflowId,
    workflowData: d.workflow,
    trigger:      d.trigger,
    deployedAt:   d.deployedAt,
    lastRun:      d.lastRun ?? null,
    lastResult:   d.lastResult ?? null,
  };
  upsert<DeploymentRecord>('bs_deployment', d.workflowId, rec);
}

function _deleteFromDb(workflowId: string) {
  remove('bs_deployment', workflowId);
}

function _loadFromDb() {
  const rows = findAll<{ workflowId: string; workflowData: Workflow; trigger?: TriggerConfig; deployedAt: string }>('bs_deployment');
  for (const row of rows) {
    try {
      _deployInMemory(row.workflowId, row.workflowData, row.trigger, row.deployedAt);
    } catch (err) {
      console.error('[scheduler] Failed to restore deployment:', err);
    }
  }
  console.log(`[scheduler] Restored ${deployments.size} deployment(s) from file store`);
}

/* ── Internal deploy (no DB write, used for restoration) ── */

function _deployInMemory(workflowId: string, workflow: Workflow, trigger?: TriggerConfig, deployedAt?: string) {
  _undeployInMemory(workflowId);

  const deployed: DeployedWorkflow = {
    workflowId,
    workflow,
    trigger,
    deployedAt: deployedAt ?? new Date().toISOString(),
  };

  if (trigger?.type === 'cron' && trigger.cron) {
    const intervalMs = parseCronToMs(trigger.cron);
    if (intervalMs) {
      console.log(`[scheduler] Starting in-process cron for ${workflowId}: "${trigger.cron}" every ${intervalMs}ms`);
      deployed.cronTimer = setInterval(async () => {
        console.log(`[scheduler] Cron firing for ${workflowId}`);
        try {
          await _executeDeployment(deployed);
          deployed.lastResult = { success: true };
        } catch (err) {
          deployed.lastResult = { success: false, error: String(err) };
          console.error(`[scheduler] Cron failed for ${workflowId}:`, err);
        }
        deployed.lastRun = new Date().toISOString();
        _saveToDb(deployed);
      }, intervalMs);
    }
  }

  deployments.set(workflowId, deployed);
}

function _undeployInMemory(workflowId: string) {
  const existing = deployments.get(workflowId);
  if (existing?.cronTimer) {
    clearInterval(existing.cronTimer);
    console.log(`[scheduler] Stopped cron for ${workflowId}`);
  }
  deployments.delete(workflowId);
}

async function _executeDeployment(d: DeployedWorkflow, extraInputs?: Record<string, unknown>): Promise<{ output: unknown; trace: unknown[]; durationMs: number }> {
  if (!_callAgent || !_callTool) throw new Error('[scheduler] Not initialized — callAgent/callTool missing');

  const { executeGraph } = await import('./graph-runner');
  const t0 = Date.now();
  const result = await executeGraph({
    workflow: d.workflow,
    inputs: extraInputs ?? {},
    callAgent: _callAgent as Parameters<typeof executeGraph>[0]['callAgent'],
    callTool: _callTool,
  });
  return { output: result.output, trace: result.trace, durationMs: Date.now() - t0 };
}

/* ── Public API ── */

export function deploy(
  workflowId: string,
  workflow: Workflow,
  trigger?: TriggerConfig,
): { trigger: string; cron?: string; webhookUrl?: string } {
  _deployInMemory(workflowId, workflow, trigger);
  const d = deployments.get(workflowId)!;
  _saveToDb(d);

  return {
    trigger: trigger?.type ?? 'manual',
    cron: trigger?.cron,
    webhookUrl: trigger?.type === 'webhook' ? `/hook/${workflowId}` : undefined,
  };
}

export function undeploy(workflowId: string) {
  _undeployInMemory(workflowId);
  _deleteFromDb(workflowId);
}

export function listDeployments() {
  return Array.from(deployments.values()).map((d) => ({
    workflowId: d.workflowId,
    trigger: d.trigger,
    deployedAt: d.deployedAt,
    lastRun: d.lastRun,
    lastResult: d.lastResult,
  }));
}

export async function execute(
  workflowId: string,
  inputs?: Record<string, unknown>,
): Promise<{ output: unknown; trace: unknown[]; durationMs: number }> {
  const d = deployments.get(workflowId);
  if (!d) throw new Error(`Workflow "${workflowId}" is not deployed`);
  return _executeDeployment(d, inputs);
}

export async function triggerWebhook(
  workflowId: string,
  webhookInput: WebhookInput,
): Promise<{ output: unknown; trace: unknown[] }> {
  const d = deployments.get(workflowId);
  if (!d) throw new Error(`Workflow "${workflowId}" is not deployed`);

  const inputs: Record<string, unknown> = {};
  for (const node of d.workflow.nodes) {
    if (node.data?.blockType === 'webhook_request') inputs[node.id] = webhookInput.body;
  }

  const result = await _executeDeployment(d, inputs);
  d.lastRun    = new Date().toISOString();
  d.lastResult = { success: true };
  _saveToDb(d);
  return result;
}

export function getDeployment(workflowId: string): DeployedWorkflow | undefined {
  return deployments.get(workflowId);
}

export function disposeAll() {
  for (const [id] of deployments) _undeployInMemory(id);
}
