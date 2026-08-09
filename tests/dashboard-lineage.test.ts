import { expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";
import { fileLineage } from "../src/dashboard/queries.js";
import { seedTwoSessions } from "./dashboard/seed.js";

test("fileLineage aggregates touches across sessions", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);

  const lineage = fileLineage(db);

  expect(lineage).toHaveLength(1);
  expect(lineage[0]).toEqual({
    path: "src/app.ts",
    readCount: 2,
    writeCount: 1,
    sessions: [
      { sessionId: "sess-claude", harness: "claude", modes: ["read", "write"] },
      { sessionId: "sess-codex", harness: "codex", modes: ["read"] },
    ],
  });
  db.close();
});

test("fileLineage retains unknown modes without counting them", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const insertTouch = db.prepare(
    "INSERT INTO file_touch (session_id, path, mode) VALUES (?, ?, ?)",
  );
  insertTouch.run("sess-codex", "src/app.ts", "inspect");
  insertTouch.run("sess-codex", "src/ops.ts", "delete");
  insertTouch.run("sess-codex", "src/ops.ts", "rename");
  insertTouch.run("sess-codex", "src/ops.ts", "create");
  insertTouch.run("sess-codex", "src/a-unknown.ts", "inspect");
  insertTouch.run("sess-codex", "src/z-unknown.ts", "inspect");

  expect(fileLineage(db)).toEqual([
    {
      path: "src/app.ts",
      readCount: 2,
      writeCount: 1,
      sessions: [
        { sessionId: "sess-claude", harness: "claude", modes: ["read", "write"] },
        { sessionId: "sess-codex", harness: "codex", modes: ["inspect", "read"] },
      ],
    },
    {
      path: "src/ops.ts",
      readCount: 0,
      writeCount: 2,
      sessions: [
        { sessionId: "sess-codex", harness: "codex", modes: ["create", "delete", "rename"] },
      ],
    },
    {
      path: "src/a-unknown.ts",
      readCount: 0,
      writeCount: 0,
      sessions: [
        { sessionId: "sess-codex", harness: "codex", modes: ["inspect"] },
      ],
    },
    {
      path: "src/z-unknown.ts",
      readCount: 0,
      writeCount: 0,
      sessions: [
        { sessionId: "sess-codex", harness: "codex", modes: ["inspect"] },
      ],
    },
  ]);
  db.close();
});
