/**
 * SQLite-backed store using better-sqlite3.
 *
 * Public API is intentionally collection/key/value shaped so callers
 * (workspace.ts, mcp.ts, scheduler.ts) don't know or care about SQL.
 *
 * Single table:  bs_store (collection TEXT, id TEXT, data TEXT, PRIMARY KEY (collection, id))
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';

let _db: Database.Database | null = null;

export function initDb(storagePath: string) {
  fs.mkdirSync(storagePath, { recursive: true });
  _db = new Database(`${storagePath}/builder-studio.db`);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS bs_store (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    )
  `);
}

function db(): Database.Database {
  if (!_db) throw new Error('db not initialised — call initDb() first');
  return _db;
}

export function readCollection<T>(name: string): Record<string, T> {
  const rows = db().prepare('SELECT id, data FROM bs_store WHERE collection = ?').all(name) as { id: string; data: string }[];
  const out: Record<string, T> = {};
  for (const row of rows) {
    try { out[row.id] = JSON.parse(row.data) as T; } catch { /* skip corrupt */ }
  }
  return out;
}

export function writeCollection<T>(name: string, data: Record<string, T>): void {
  const insert = db().prepare('INSERT OR REPLACE INTO bs_store (collection, id, data) VALUES (?, ?, ?)');
  const deleteStmt = db().prepare('DELETE FROM bs_store WHERE collection = ? AND id NOT IN (SELECT value FROM json_each(?))');
  const ids = Object.keys(data);
  db().transaction(() => {
    for (const [id, record] of Object.entries(data)) {
      insert.run(name, id, JSON.stringify(record));
    }
    deleteStmt.run(name, JSON.stringify(ids));
  })();
}

export function upsert<T>(name: string, id: string, record: T): T {
  db().prepare('INSERT OR REPLACE INTO bs_store (collection, id, data) VALUES (?, ?, ?)').run(name, id, JSON.stringify(record));
  return record;
}

export function remove(name: string, id: string): void {
  db().prepare('DELETE FROM bs_store WHERE collection = ? AND id = ?').run(name, id);
}

export function findById<T>(name: string, id: string): T | undefined {
  const row = db().prepare('SELECT data FROM bs_store WHERE collection = ? AND id = ?').get(name, id) as { data: string } | undefined;
  if (!row) return undefined;
  try { return JSON.parse(row.data) as T; } catch { return undefined; }
}

export function findAll<T>(name: string): T[] {
  const rows = db().prepare('SELECT data FROM bs_store WHERE collection = ?').all(name) as { data: string }[];
  return rows.flatMap(r => { try { return [JSON.parse(r.data) as T]; } catch { return []; } });
}
