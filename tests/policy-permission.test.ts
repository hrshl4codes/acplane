import { expect, test } from "vitest";
import { buildCancelledResponse, buildSelectedResponse, permissionSubject, selectOption } from "../src/policy/permission.js";

const REQUEST = {
  sessionId: "s",
  toolCall: {
    toolCallId: "tc-edit",
    kind: "edit",
    title: "Edit .env",
    locations: [{ path: ".env" }],
    rawInput: { path: ".env" },
  },
  options: [
    { optionId: "allow", name: "Allow", kind: "allow_once" },
    { optionId: "reject", name: "Reject", kind: "reject_once" },
  ],
};

test("permissionSubject pulls kind and deduplicated paths", () => {
  const subject = permissionSubject(REQUEST);
  expect(subject.kind).toBe("edit");
  expect(subject.paths).toEqual([".env"]);
  expect(subject.command).toBeNull();
});

test("permissionSubject reads a string execute command from rawInput", () => {
  const subject = permissionSubject({ toolCall: { kind: "execute", rawInput: { command: "ls -la" } } });
  expect(subject.kind).toBe("execute");
  expect(subject.command).toBe("ls -la");
});

test("permissionSubject joins an array execute command from rawInput", () => {
  const subject = permissionSubject({ toolCall: { kind: "execute", rawInput: { command: ["bash", "-c", "ls"] } } });
  expect(subject.kind).toBe("execute");
  expect(subject.command).toBe("bash -c ls");
});

test("permissionSubject falls back to the execute title", () => {
  expect(permissionSubject({ toolCall: { kind: "execute", title: "List files" } }).command).toBe("List files");
});

test("selectOption picks the matching option family", () => {
  expect(selectOption(REQUEST.options, "allow")).toBe("allow");
  expect(selectOption(REQUEST.options, "deny")).toBe("reject");
  expect(selectOption([], "deny")).toBeNull();
});

test("selectOption ignores malformed lookalikes and selects the first valid family option", () => {
  expect(selectOption([
    { optionId: "bare-allow", kind: "allow" },
    { optionId: "allowed", kind: "allowed_once" },
    { optionId: "first-allow", kind: "allow_once" },
    { optionId: "later-allow", kind: "allow_always" },
  ], "allow")).toBe("first-allow");
  expect(selectOption([
    { optionId: "bare-reject", kind: "reject" },
    { optionId: "rejected", kind: "rejected_once" },
    { optionId: "first-reject", kind: "reject_once" },
    { optionId: "later-reject", kind: "reject_always" },
  ], "deny")).toBe("first-reject");
});

test("selectOption selects the first exact one-shot option over persistent and unknown options", () => {
  expect(selectOption([
    { optionId: "always-allow", kind: "allow_always" },
    { optionId: "forever-allow", kind: "allow_forever" },
    { optionId: "first-allow", kind: "allow_once" },
    { optionId: "later-allow", kind: "allow_once" },
  ], "allow")).toBe("first-allow");
  expect(selectOption([
    { optionId: "always-reject", kind: "reject_always" },
    { optionId: "forever-reject", kind: "reject_forever" },
    { optionId: "first-reject", kind: "reject_once" },
    { optionId: "later-reject", kind: "reject_once" },
  ], "deny")).toBe("first-reject");
});

test("selectOption returns null when only persistent or unknown options are available", () => {
  expect(selectOption([
    { optionId: "always-allow", kind: "allow_always" },
    { optionId: "forever-allow", kind: "allow_forever" },
  ], "allow")).toBeNull();
  expect(selectOption([
    { optionId: "always-reject", kind: "reject_always" },
    { optionId: "forever-reject", kind: "reject_forever" },
  ], "deny")).toBeNull();
});

test("buildSelectedResponse annotates the decision", () => {
  expect(buildSelectedResponse(7, "reject", "protect-secrets")).toEqual({
    jsonrpc: "2.0",
    id: 7,
    result: { outcome: { outcome: "selected", optionId: "reject" }, _meta: { acplane: { decidedBy: "policy", rule: "protect-secrets" } } },
  });
});

test("buildCancelledResponse omits rule when none fired", () => {
  expect(buildCancelledResponse(9, null)).toEqual({
    jsonrpc: "2.0",
    id: 9,
    result: { outcome: { outcome: "cancelled" }, _meta: { acplane: { decidedBy: "policy" } } },
  });
});
