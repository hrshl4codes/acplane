import { expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";
import { sessionSummaries } from "../src/dashboard/queries.js";
import { seedTwoSessions } from "./dashboard/seed.js";

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
