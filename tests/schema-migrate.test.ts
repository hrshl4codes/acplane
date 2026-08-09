import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function createLegacyDb(): string {
  dir = mkdtempSync(join(tmpdir(), "acplane-mig-"));
  const path = join(dir, "legacy.db");
  const legacy = new Database(path);
  legacy.exec(`CREATE TABLE permission_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_id INTEGER,
    tool_call_id TEXT,
    requested TEXT,
    decision TEXT,
    decided_by TEXT
  )`);
  legacy
    .prepare(`INSERT INTO permission_event
      (session_id, turn_id, tool_call_id, requested, decision, decided_by)
      VALUES (?, ?, ?, ?, ?, ?)`)
    .run("legacy-session", 17, "tc-legacy", "legacy request", "allow", "user");
  legacy.close();
  return path;
}

test("openDb adds rule to a legacy permission_event table without losing data", () => {
  const path = createLegacyDb();

  const reopened = openDb(path);
  const columns = (
    reopened.prepare("PRAGMA table_info(permission_event)").all() as Array<{ name: string }>
  ).map((column) => column.name);
  const row = reopened
    .prepare(`SELECT session_id, turn_id, tool_call_id, requested, decision, decided_by, rule
      FROM permission_event`)
    .get();

  expect(columns).toContain("rule");
  expect(row).toEqual({
    session_id: "legacy-session",
    turn_id: 17,
    tool_call_id: "tc-legacy",
    requested: "legacy request",
    decision: "allow",
    decided_by: "user",
    rule: null,
  });
  reopened.close();
});

test("openDb migration is idempotent across repeated opens", () => {
  const path = createLegacyDb();

  const first = openDb(path);
  first.prepare("UPDATE permission_event SET rule = ? WHERE session_id = ?").run(
    "legacy-rule",
    "legacy-session",
  );
  first.close();

  const second = openDb(path);
  const ruleColumns = (
    second.prepare("PRAGMA table_info(permission_event)").all() as Array<{ name: string }>
  ).filter((column) => column.name === "rule");
  const row = second
    .prepare("SELECT session_id, requested, rule FROM permission_event")
    .get();

  expect(ruleColumns).toHaveLength(1);
  expect(row).toEqual({
    session_id: "legacy-session",
    requested: "legacy request",
    rule: "legacy-rule",
  });
  second.close();
});
