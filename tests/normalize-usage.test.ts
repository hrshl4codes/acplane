import { expect, test } from "vitest";
import type { RecordedEvent } from "../src/normalize/events.js";
import { normalizeSession } from "../src/normalize/normalize.js";

function turnWith(result: unknown): RecordedEvent[] {
  return [
    { ts: "t0", direction: "client->harness", msg: { jsonrpc: "2.0", id: 1, method: "session/prompt", params: { sessionId: "s", prompt: [{ type: "text", text: "hello world" }] } } },
    { ts: "t1", direction: "harness->client", msg: { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi there!" } } } } },
    { ts: "t2", direction: "harness->client", msg: { jsonrpc: "2.0", id: 1, result } },
  ];
}

test("uses reported usage when the harness provides it", () => {
  const normalized = normalizeSession("s-1", "claude", turnWith({
    stopReason: "end_turn",
    _meta: { usage: { inputTokens: 1500, outputTokens: 420, costUsd: 0.031 } },
  }));

  expect(normalized.usage).toEqual([
    { turnSeq: 1, tokensIn: 1500, tokensOut: 420, costUsd: 0.031, source: "reported" },
  ]);
});

test("flags fallback token counts as estimated", () => {
  const normalized = normalizeSession(
    "s-1",
    "codex",
    turnWith({ stopReason: "end_turn" }),
  );

  expect(normalized.usage).toEqual([
    { turnSeq: 1, tokensIn: 3, tokensOut: 3, costUsd: null, source: "estimated" },
  ]);
});
