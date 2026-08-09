import Database from "better-sqlite3";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  acp_session_id TEXT,
  protocol_version INTEGER,
  cwd TEXT,
  started_at TEXT,
  ended_at TEXT,
  stop_reason TEXT
);
CREATE TABLE IF NOT EXISTS turn (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES session(id),
  seq INTEGER NOT NULL,
  prompt TEXT,
  final_message TEXT,
  stop_reason TEXT,
  started_at TEXT,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS tool_call (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_id INTEGER,
  tool_call_id TEXT,
  kind TEXT,
  title TEXT,
  status TEXT,
  raw_input TEXT,
  raw_output TEXT
);
CREATE TABLE IF NOT EXISTS file_touch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_id INTEGER,
  tool_call_id TEXT,
  path TEXT NOT NULL,
  mode TEXT NOT NULL,
  diff TEXT
);
CREATE TABLE IF NOT EXISTS usage_sample (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_id INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS permission_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_id INTEGER,
  tool_call_id TEXT,
  requested TEXT,
  decision TEXT,
  decided_by TEXT,
  rule TEXT
);
CREATE INDEX IF NOT EXISTS idx_file_touch_path ON file_touch(path);
CREATE INDEX IF NOT EXISTS idx_tool_call_session ON tool_call(session_id);
`;

function ensureColumn(db: Db, table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  ensureColumn(db, "permission_event", "rule", "TEXT");
  return db;
}
