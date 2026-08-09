import { expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";
import { writeNormalized } from "../src/db/write.js";
import type { NormalizedSession } from "../src/normalize/normalize.js";

function sample(): NormalizedSession {
  return {
    session: { id: "s-1", harness: "claude", acpSessionId: "acp-1", protocolVersion: 1, cwd: "/w", startedAt: "t0", endedAt: "t9", stopReason: "end_turn" },
    turns: [{ seq: 1, prompt: "edit app", finalMessage: "done", stopReason: "end_turn", startedAt: "t0", endedAt: "t9" }],
    toolCalls: [{ turnSeq: 1, toolCallId: "tc-edit", kind: "edit", title: "Edit", status: "completed", rawInput: null, rawOutput: null }],
    fileTouches: [{ turnSeq: 1, toolCallId: "tc-edit", path: "src/app.ts", mode: "write", diff: '{"oldText":"a","newText":"b"}' }],
    usage: [{ turnSeq: 1, tokensIn: 1500, tokensOut: 420, costUsd: 0.03, source: "reported" }],
    permissions: [
      { turnSeq: 1, toolCallId: "tc-edit", requested: '{"toolCall":{"kind":"edit"}}', decision: "deny", decidedBy: "policy", rule: "protect-secrets" },
    ],
  };
}

test("writes the graph with resolved turn foreign keys", () => {
  const db = openDb(":memory:");
  writeNormalized(db, sample());
  const turn = db.prepare("SELECT id FROM turn WHERE session_id = ?").get("s-1") as { id: number };
  const touch = db.prepare("SELECT turn_id, path, mode FROM file_touch WHERE session_id = ?").get("s-1");
  expect(touch).toEqual({ turn_id: turn.id, path: "src/app.ts", mode: "write" });
  const usage = db.prepare("SELECT source, tokens_in FROM usage_sample WHERE session_id = ?").get("s-1");
  expect(usage).toEqual({ source: "reported", tokens_in: 1500 });
  const permission = db
    .prepare(`SELECT turn_id, tool_call_id, requested, decision, decided_by, rule
      FROM permission_event WHERE session_id = ?`)
    .get("s-1");
  expect(permission).toEqual({
    turn_id: turn.id,
    tool_call_id: "tc-edit",
    requested: '{"toolCall":{"kind":"edit"}}',
    decision: "deny",
    decided_by: "policy",
    rule: "protect-secrets",
  });
  db.close();
});

test("re-writing the same session is idempotent", () => {
  const db = openDb(":memory:");
  writeNormalized(db, sample());
  const replacement = sample();
  const originalPermission = replacement.permissions[0];
  if (!originalPermission) throw new Error("sample permission missing");
  replacement.permissions[0] = { ...originalPermission, decision: "allow", rule: null };
  writeNormalized(db, replacement);
  const toolCall = db.prepare("SELECT COUNT(*) AS count FROM tool_call WHERE session_id = ?").get("s-1") as { count: number };
  expect(toolCall.count).toBe(1);
  const permissions = db.prepare("SELECT COUNT(*) AS count, decision, rule FROM permission_event WHERE session_id = ?").get("s-1");
  expect(permissions).toEqual({ count: 1, decision: "allow", rule: null });
  db.close();
});
