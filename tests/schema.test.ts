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
