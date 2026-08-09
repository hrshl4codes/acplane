import { expect, test } from "vitest";
import type { RecordedEvent } from "../src/normalize/events.js";
import { normalizeSession } from "../src/normalize/normalize.js";

function baseEvents(): RecordedEvent[] {
  return [
    { ts: "t0", direction: "client->harness", msg: { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1 } } },
    { ts: "t1", direction: "harness->client", msg: { jsonrpc: "2.0", id: 0, result: { protocolVersion: 1, agentCapabilities: {} } } },
    { ts: "t2", direction: "client->harness", msg: { jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/work" } } },
    { ts: "t3", direction: "harness->client", msg: { jsonrpc: "2.0", id: 1, result: { sessionId: "s-1" } } },
    { ts: "t4", direction: "client->harness", msg: { jsonrpc: "2.0", id: 2, method: "session/prompt", params: { sessionId: "s-1", prompt: [{ type: "text", text: "add a test" }] } } },
    { ts: "t5", direction: "harness->client", msg: { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done." } } } } },
    { ts: "t6", direction: "harness->client", msg: { jsonrpc: "2.0", id: 2, result: { stopReason: "end_turn" } } },
  ];
}

test("extracts session metadata", () => {
  const normalized = normalizeSession("sess-abc", "claude", baseEvents());

  expect(normalized.session).toEqual({
    id: "sess-abc",
    harness: "claude",
    acpSessionId: "s-1",
    protocolVersion: 1,
    cwd: "/work",
    startedAt: "t0",
    endedAt: "t6",
    stopReason: "end_turn",
  });
});

test("extracts a turn with prompt, final message, and stop reason", () => {
  const normalized = normalizeSession("sess-abc", "claude", baseEvents());

  expect(normalized.turns).toEqual([
    {
      seq: 1,
      prompt: "add a test",
      finalMessage: "Done.",
      stopReason: "end_turn",
      startedAt: "t4",
      endedAt: "t6",
    },
  ]);
});

test("multiple prompts produce sequential turns", () => {
  const events = baseEvents();
  events.push(
    { ts: "t7", direction: "client->harness", msg: { jsonrpc: "2.0", id: 3, method: "session/prompt", params: { sessionId: "s-1", prompt: [{ type: "text", text: "now refactor" }] } } },
    { ts: "t8", direction: "harness->client", msg: { jsonrpc: "2.0", id: 3, result: { stopReason: "end_turn" } } },
  );

  const normalized = normalizeSession("sess-abc", "claude", events);

  expect(normalized.turns.map((turn) => turn.seq)).toEqual([1, 2]);
  expect(normalized.turns[1]!.prompt).toBe("now refactor");
});
