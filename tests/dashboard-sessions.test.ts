import { performance } from "node:perf_hooks";
import { expect, test } from "vitest";
import { openDb, type Db } from "../src/db/schema.js";
import { sessionSummaries } from "../src/dashboard/queries.js";
import { seedTwoSessions } from "./dashboard/seed.js";

function captureSummarySql(db: Db): string {
  let summarySql: string | undefined;
  const tracingDb = {
    prepare(sql: string) {
      if (sql.includes("FROM session s")) summarySql = sql;
      return db.prepare(sql);
    },
  } as unknown as Db;

  sessionSummaries(tracingDb);
  if (!summarySql) throw new Error("session summary query was not prepared");
  return summarySql;
}

function seedCatalogScale(db: Db, count: number): void {
  const insertSession = db.prepare(
    "INSERT INTO session (id, harness, started_at) VALUES (?, ?, ?)",
  );
  const insertTurn = db.prepare(
    "INSERT INTO turn (session_id, seq, prompt) VALUES (?, ?, ?)",
  );
  const insertTool = db.prepare(
    "INSERT INTO tool_call (session_id, tool_call_id, kind) VALUES (?, ?, ?)",
  );
  const insertTouch = db.prepare(
    "INSERT INTO file_touch (session_id, path, mode) VALUES (?, ?, ?)",
  );
  const insertUsage = db.prepare(
    "INSERT INTO usage_sample (session_id, tokens_in, tokens_out, cost_usd, source) VALUES (?, ?, ?, ?, ?)",
  );
  const insertPermission = db.prepare(
    "INSERT INTO permission_event (session_id, decision, decided_by) VALUES (?, ?, ?)",
  );
  db.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const id = `scale-${String(index).padStart(5, "0")}`;
      insertSession.run(id, "scale", "2026-08-10T00:00:00.000Z");
      insertTurn.run(id, 1, "prompt");
      insertTool.run(id, `tool-${index}`, "read");
      insertTouch.run(id, `src/${index}.ts`, "read");
      insertUsage.run(id, 10, 5, 0.001, "reported");
      insertPermission.run(id, "allow", "policy");
    }
  })();
}

test("sessionSummaries aggregates per session, newest first", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const summaries = sessionSummaries(db);

  expect(summaries.map((s) => s.id)).toEqual(["sess-claude", "sess-codex"]);

  const claude = summaries[0]!;
  expect(claude).toMatchObject({
    harness: "claude",
    turnCount: 1,
    toolCallCount: 2,
    fileCount: 1,
    tokensIn: 1500,
    tokensOut: 420,
    costUsd: 0.03,
    permissionCount: 1,
    denialCount: 1,
    policyDecisionCount: 1,
    usageSource: "reported",
  });

  const codex = summaries[1]!;
  expect(codex).toMatchObject({ harness: "codex", toolCallCount: 1, costUsd: null, permissionCount: 0, usageSource: "estimated" });
  db.close();
});

test("sessionSummaries query plan has no per-session correlated child scans", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const sql = captureSummarySql(db);
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{
    detail: string;
  }>;

  expect(plan.map((step) => step.detail)).not.toEqual(
    expect.arrayContaining([expect.stringContaining("CORRELATED SCALAR SUBQUERY")]),
  );
  db.close();
});

test("sessionSummaries remains bounded for a realistic catalog", () => {
  const db = openDb(":memory:");
  seedCatalogScale(db, 2_500);

  const startedAt = performance.now();
  const summaries = sessionSummaries(db);
  const elapsedMs = performance.now() - startedAt;

  expect(summaries).toHaveLength(2_500);
  expect(summaries[0]).toMatchObject({
    turnCount: 1,
    toolCallCount: 1,
    fileCount: 1,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.001,
    permissionCount: 1,
    denialCount: 0,
    policyDecisionCount: 1,
    usageSource: "reported",
  });
  expect(elapsedMs).toBeLessThan(1_500);
  db.close();
});
