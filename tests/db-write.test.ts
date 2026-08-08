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
  db.close();
});

test("re-writing the same session is idempotent", () => {
  const db = openDb(":memory:");
  writeNormalized(db, sample());
  writeNormalized(db, sample());
  const row = db.prepare("SELECT COUNT(*) AS count FROM tool_call WHERE session_id = ?").get("s-1") as { count: number };
  expect(row.count).toBe(1);
  db.close();
});
