import { expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";
import { sessionDetail } from "../src/dashboard/queries.js";
import { seedTwoSessions } from "./dashboard/seed.js";

test("sessionDetail assembles a turn timeline with events", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const detail = sessionDetail(db, "sess-claude")!;

  expect(detail.session.id).toBe("sess-claude");
  expect(detail.turns).toHaveLength(1);
  const turn = detail.turns[0]!;
  expect(turn.prompt).toBe("add validation");
  expect(turn.toolCalls.map((c) => c.kind)).toEqual(["read", "edit"]);
  expect(turn.fileTouches.map((f) => f.mode).sort()).toEqual(["read", "write"]);
  expect(turn.permissions[0]).toMatchObject({ decision: "deny", decidedBy: "policy", rule: "protect-secrets" });
  expect(turn.tokensIn).toBe(1500);
  expect(turn.usageSource).toBe("reported");
  db.close();
});

test("sessionDetail aggregates all usage samples attributed to a turn", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const turn = db.prepare("SELECT id FROM turn WHERE session_id = ? AND seq = ?").get("sess-claude", 1) as { id: number };
  db.prepare(
    "INSERT INTO usage_sample (session_id, turn_id, tokens_in, tokens_out, cost_usd, source) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("sess-claude", turn.id, 250, 80, null, "estimated");

  expect(sessionDetail(db, "sess-claude")!.turns[0]).toMatchObject({
    tokensIn: 1750,
    tokensOut: 500,
    costUsd: 0.03,
    usageSource: "mixed",
  });
  db.close();
});

test.each([
  { caseName: "input-only", tokensIn: 25, tokensOut: null, expectedIn: 25, expectedOut: null },
  { caseName: "output-only", tokensIn: null, tokensOut: 40, expectedIn: null, expectedOut: 40 },
  { caseName: "explicit zero", tokensIn: 0, tokensOut: 0, expectedIn: 0, expectedOut: 0 },
])("sessionDetail preserves honest token directions for $caseName usage", ({ tokensIn, tokensOut, expectedIn, expectedOut }) => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const turn = db.prepare("SELECT id FROM turn WHERE session_id = ? AND seq = ?").get("sess-claude", 1) as { id: number };
  db.prepare("DELETE FROM usage_sample WHERE session_id = ?").run("sess-claude");
  db.prepare(
    "INSERT INTO usage_sample (session_id, turn_id, tokens_in, tokens_out, cost_usd, source) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("sess-claude", turn.id, tokensIn, tokensOut, null, "reported");

  expect(sessionDetail(db, "sess-claude")!.turns[0]).toMatchObject({
    tokensIn: expectedIn,
    tokensOut: expectedOut,
  });
  db.close();
});

test("sessionDetail returns null for an unknown session", () => {
  const db = openDb(":memory:");
  expect(sessionDetail(db, "nope")).toBeNull();
  db.close();
});
