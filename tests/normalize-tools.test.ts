import { expect, test } from "vitest";
import type { RecordedEvent } from "../src/normalize/events.js";
import { normalizeSession } from "../src/normalize/normalize.js";

function eventsWithTools(): RecordedEvent[] {
  return [
    { ts: "t0", direction: "client->harness", msg: { jsonrpc: "2.0", id: 1, method: "session/prompt", params: { sessionId: "s", prompt: [{ type: "text", text: "edit app" }] } } },
    { ts: "t1", direction: "harness->client", msg: { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update: { sessionUpdate: "tool_call", toolCallId: "tc-read", kind: "read", status: "completed", title: "Read src/app.ts", locations: [{ path: "src/app.ts" }], rawInput: { path: "src/app.ts" } } } } },
    { ts: "t2", direction: "harness->client", msg: { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update: { sessionUpdate: "tool_call", toolCallId: "tc-edit", kind: "edit", status: "completed", title: "Edit src/app.ts", locations: [{ path: "src/app.ts" }], content: [{ type: "diff", path: "src/app.ts", oldText: "const a = 1;", newText: "const a = 2;" }] } } } },
    { ts: "t3", direction: "harness->client", msg: { jsonrpc: "2.0", id: 1, result: { stopReason: "end_turn" } } },
  ];
}

test("extracts tool calls and attributes them to the active turn", () => {
  const normalized = normalizeSession("s-1", "claude", eventsWithTools());

  expect(normalized.toolCalls).toHaveLength(2);
  expect(normalized.toolCalls.find((call) => call.toolCallId === "tc-read")).toMatchObject({
    kind: "read",
    status: "completed",
    turnSeq: 1,
    rawInput: '{"path":"src/app.ts"}',
  });
});

test("derives read and write file touches while preserving edit diffs", () => {
  const normalized = normalizeSession("s-1", "claude", eventsWithTools());

  expect(normalized.fileTouches).toHaveLength(2);
  expect(normalized.fileTouches.find((touch) => touch.toolCallId === "tc-read")).toEqual({
    turnSeq: 1,
    toolCallId: "tc-read",
    path: "src/app.ts",
    mode: "read",
    diff: null,
  });
  const edit = normalized.fileTouches.find((touch) => touch.toolCallId === "tc-edit")!;
  expect(edit).toMatchObject({ path: "src/app.ts", mode: "write", turnSeq: 1 });
  expect(JSON.parse(edit.diff!)).toEqual({
    oldText: "const a = 1;",
    newText: "const a = 2;",
  });
});

test("classifies an edit with empty old text as a create", () => {
  const events = eventsWithTools();
  const message = events[2]!.msg as { params: { update: { content: Array<{ oldText: string }> } } };
  message.params.update.content[0]!.oldText = "";

  const normalized = normalizeSession("s-1", "claude", events);

  expect(normalized.fileTouches.find((touch) => touch.toolCallId === "tc-edit")!.mode).toBe(
    "create",
  );
});
