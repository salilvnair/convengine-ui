/**
 * Workspace persistence — stores / loads workspace snapshots as JSON files.
 */
import { upsert, findById } from '../storage/db';
import type { WorkspaceSnapshot } from '../types';

export function initWorkspaceService(_storagePath: string) {
  // db is already initialised by initDb() in extension.ts activate()
}

export function syncWorkspace(workspaceId: string, snapshot: WorkspaceSnapshot): { ok: boolean } {
  upsert<WorkspaceSnapshot>('bs_workspace', workspaceId, snapshot);
  return { ok: true };
}

export function loadWorkspace(workspaceId: string): WorkspaceSnapshot | null {
  return findById<WorkspaceSnapshot>('bs_workspace', workspaceId) ?? null;
}
