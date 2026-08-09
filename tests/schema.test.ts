import { expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";

test("openDb creates all expected tables", () => {
  const db = openDb(":memory:");
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  const names = new Set(rows.map((row) => row.name));

  for (const table of [
    "session",
    "turn",
    "tool_call",
    "file_touch",
    "usage_sample",
    "permission_event",
  ]) {
    expect(names.has(table)).toBe(true);
  }

  db.close();
});

test("openDb creates session lookup indexes for every dashboard child table", () => {
  const db = openDb(":memory:");
  const rows = db
    .prepare("SELECT name, tbl_name AS tableName FROM sqlite_master WHERE type = 'index'")
    .all() as Array<{ name: string; tableName: string }>;

  expect(rows).toEqual(
    expect.arrayContaining([
      { name: "idx_turn_session", tableName: "turn" },
      { name: "idx_tool_call_session", tableName: "tool_call" },
      { name: "idx_file_touch_session", tableName: "file_touch" },
      { name: "idx_usage_sample_session", tableName: "usage_sample" },
      { name: "idx_permission_event_session", tableName: "permission_event" },
    ]),
  );
  db.close();
});
