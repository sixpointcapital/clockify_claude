import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "clockyfi.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      collector TEXT NOT NULL,
      raw_data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      description TEXT NOT NULL,
      project_id TEXT,
      project_name TEXT,
      task_id TEXT,
      task_name TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      snapshot_ids TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return _db;
}

export interface Snapshot {
  id?: number;
  timestamp: string;
  collector: string;
  raw_data: string;
}

export interface TimeEntry {
  id?: number;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  project_id: string | null;
  project_name: string | null;
  task_id: string | null;
  task_name: string | null;
  status: "draft" | "approved" | "published" | "skipped";
  snapshot_ids: string | null;
}

export function insertSnapshot(s: Snapshot): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO snapshots (timestamp, collector, raw_data) VALUES (?, ?, ?)"
  );
  const result = stmt.run(s.timestamp, s.collector, s.raw_data);
  return result.lastInsertRowid as number;
}

export function insertEntry(e: TimeEntry): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO entries (date, start_time, end_time, description, project_id, project_name, task_id, task_name, status, snapshot_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    e.date, e.start_time, e.end_time, e.description,
    e.project_id, e.project_name, e.task_id, e.task_name,
    e.status, e.snapshot_ids
  );
  return result.lastInsertRowid as number;
}

export function getEntriesByStatus(status: string, date?: string): TimeEntry[] {
  const db = getDb();
  if (date) {
    return db.prepare("SELECT * FROM entries WHERE status = ? AND date = ? ORDER BY start_time").all(status, date) as TimeEntry[];
  }
  return db.prepare("SELECT * FROM entries WHERE status = ? ORDER BY date, start_time").all(status) as TimeEntry[];
}

export function getEntriesToday(status?: string): TimeEntry[] {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  if (status) {
    return db.prepare("SELECT * FROM entries WHERE date = ? AND status = ? ORDER BY start_time").all(today, status) as TimeEntry[];
  }
  return db.prepare("SELECT * FROM entries WHERE date = ? ORDER BY start_time").all(today) as TimeEntry[];
}

export function updateEntryStatus(id: number, status: string): void {
  const db = getDb();
  db.prepare("UPDATE entries SET status = ? WHERE id = ?").run(status, id);
}

export function updateEntry(id: number, fields: Partial<TimeEntry>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(fields)) {
    if (key === "id") continue;
    sets.push(`${key} = ?`);
    values.push(val);
  }
  values.push(id);
  db.prepare(`UPDATE entries SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteEntry(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM entries WHERE id = ?").run(id);
}

export function getRecentSnapshots(minutes: number): Snapshot[] {
  const db = getDb();
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  return db.prepare("SELECT * FROM snapshots WHERE timestamp >= ? ORDER BY timestamp").all(since) as Snapshot[];
}

/**
 * Returns snapshots from the last N minutes that are not linked to any entry.
 */
export function getUnprocessedSnapshots(minutes: number): Snapshot[] {
  const db = getDb();
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  // Get all snapshot IDs that are already linked to entries
  const entries = db.prepare("SELECT snapshot_ids FROM entries WHERE snapshot_ids IS NOT NULL").all() as { snapshot_ids: string }[];
  const linkedIds = new Set<number>();
  for (const e of entries) {
    for (const id of e.snapshot_ids.split(",")) {
      const n = parseInt(id.trim(), 10);
      if (!isNaN(n)) linkedIds.add(n);
    }
  }

  const all = db.prepare("SELECT * FROM snapshots WHERE timestamp >= ? ORDER BY timestamp").all(since) as Snapshot[];
  return all.filter(s => !linkedIds.has(s.id!));
}
