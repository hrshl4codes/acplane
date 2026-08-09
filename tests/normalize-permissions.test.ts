import { expect, test } from "vitest";
import type { RecordedEvent } from "../src/normalize/events.js";
import { normalizeSession } from "../src/normalize/normalize.js";

const REQUEST_PARAMS = {
  toolCall: {
    toolCallId: "tc-edit",
    kind: "edit",
    locations: [{ path: ".env" }],
  },
  options: [
    { optionId: "allow", kind: "allow_once" },
    { optionId: "reject", kind: "reject_once" },
  ],
};

function withPermission(response?: unknown): RecordedEvent[] {
  const events: RecordedEvent[] = [
    {
      ts: "t0",
      direction: "client->harness",
      msg: {
        jsonrpc: "2.0",
        id: 1,
        method: "session/prompt",
        params: { sessionId: "s", prompt: [{ type: "text", text: "edit env" }] },
      },
    },
    {
      ts: "t1",
      direction: "harness->client",
      msg: {
        jsonrpc: "2.0",
        id: "perm-1",
        method: "session/request_permission",
        params: REQUEST_PARAMS,
      },
    },
  ];

  if (response !== undefined) {
    events.push({ ts: "t2", direction: "client->harness", msg: response });
  }

  events.push({
    ts: "t3",
    direction: "harness->client",
    msg: { jsonrpc: "2.0", id: 1, result: { stopReason: "end_turn" } },
  });
  return events;
}

test("captures a policy-made denial with its rule, request, and containing turn", () => {
  const events = withPermission({
    jsonrpc: "2.0",
    id: "perm-1",
    result: {
      outcome: { outcome: "selected", optionId: "reject" },
      _meta: { acplane: { decidedBy: "policy", rule: "protect-secrets" } },
    },
  });

  expect(normalizeSession("s-1", "claude", events).permissions).toEqual([
    {
      toolCallId: "tc-edit",
      requested: JSON.stringify(REQUEST_PARAMS),
      decision: "deny",
      decidedBy: "policy",
      rule: "protect-secrets",
      turnSeq: 1,
    },
  ]);
});

test.each([
  ["allow", "allow"],
  ["reject", "deny"],
] as const)("maps a human-selected %s option to %s", (optionId, decision) => {
  const events = withPermission({
    jsonrpc: "2.0",
    id: "perm-1",
    result: { outcome: { outcome: "selected", optionId } },
  });

  expect(normalizeSession("s-1", "claude", events).permissions[0]).toMatchObject({
    decision,
    decidedBy: "human",
    rule: null,
  });
});

test("records cancelled and unanswered requests without inventing decisions", () => {
  const cancelled = normalizeSession(
    "s-1",
    "claude",
    withPermission({
      jsonrpc: "2.0",
      id: "perm-1",
      result: { outcome: { outcome: "cancelled" } },
    }),
  ).permissions;
  expect(cancelled[0]).toMatchObject({
    decision: "cancelled",
    decidedBy: "human",
    rule: null,
  });

  const pending = normalizeSession("s-1", "claude", withPermission()).permissions;
  expect(pending[0]).toMatchObject({ decision: null, decidedBy: null, rule: null });
});

test.each([
  ["missing option", "unknown", REQUEST_PARAMS.options],
  ["unknown option kind", "custom", [{ optionId: "custom", kind: "ask_admin" }]],
  ["bare allow kind", "custom", [{ optionId: "custom", kind: "allow" }]],
] as const)("leaves a selected %s undecided", (_name, optionId, options) => {
  const events = withPermission({
    jsonrpc: "2.0",
    id: "perm-1",
    result: { outcome: { outcome: "selected", optionId } },
  });
  const request = events[1]!.msg as Record<string, any>;
  request.params = { ...REQUEST_PARAMS, options };

  expect(normalizeSession("s-1", "claude", events).permissions[0]).toMatchObject({
    decision: null,
    decidedBy: "human",
  });
});

test("ignores lookalike requests and responses in the wrong direction", () => {
  const events = withPermission({
    jsonrpc: "2.0",
    id: "perm-1",
    result: { outcome: { outcome: "selected", optionId: "allow" } },
  });
  events.splice(
    1,
    0,
    {
      ts: "irrelevant-request-direction",
      direction: "client->harness",
      msg: {
        id: "not-a-request",
        method: "session/request_permission",
        params: REQUEST_PARAMS,
      },
    },
    {
      ts: "irrelevant-method",
      direction: "harness->client",
      msg: { id: "not-a-request", method: "session/other", params: REQUEST_PARAMS },
    },
    {
      ts: "irrelevant-response-direction",
      direction: "harness->client",
      msg: {
        id: "perm-1",
        result: { outcome: { outcome: "selected", optionId: "reject" } },
      },
    },
  );

  expect(normalizeSession("s-1", "claude", events).permissions).toHaveLength(1);
  expect(normalizeSession("s-1", "claude", events).permissions[0]!.decision).toBe("allow");
});

test("matches only a same-ID response that follows its permission request", () => {
  const events: RecordedEvent[] = [
    {
      ts: "old-response",
      direction: "client->harness",
      msg: {
        id: "reused",
        result: { outcome: { outcome: "selected", optionId: "allow" } },
      },
    },
    {
      ts: "request",
      direction: "harness->client",
      msg: {
        id: "reused",
        method: "session/request_permission",
        params: REQUEST_PARAMS,
      },
    },
    {
      ts: "new-response",
      direction: "client->harness",
      msg: {
        id: "reused",
        result: { outcome: { outcome: "selected", optionId: "reject" } },
      },
    },
  ];

  expect(normalizeSession("s-1", "claude", events).permissions[0]).toMatchObject({
    decision: "deny",
    decidedBy: "human",
  });

  events.pop();
  expect(normalizeSession("s-1", "claude", events).permissions[0]).toMatchObject({
    decision: null,
    decidedBy: null,
    rule: null,
  });
});

test("trusts only a policy attribution marker and string rule", () => {
  const invalidMarker = withPermission({
    id: "perm-1",
    result: {
      outcome: { outcome: "cancelled" },
      _meta: { acplane: { decidedBy: "robot", rule: 99 } },
    },
  });
  expect(normalizeSession("s-1", "claude", invalidMarker).permissions[0]).toMatchObject({
    decidedBy: "human",
    rule: null,
  });

  const nonStringRule = withPermission({
    id: "perm-1",
    result: {
      outcome: { outcome: "cancelled" },
      _meta: { acplane: { decidedBy: "policy", rule: { name: "protect-secrets" } } },
    },
  });
  expect(normalizeSession("s-1", "claude", nonStringRule).permissions[0]).toMatchObject({
    decidedBy: "policy",
    rule: null,
  });
});
