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

test("buildSelectedResponse annotates the decision", () => {
  const response = buildSelectedResponse(7, "reject", "protect-secrets") as any;
  expect(response).toMatchObject({
    jsonrpc: "2.0",
    id: 7,
    result: { outcome: { outcome: "selected", optionId: "reject" }, _meta: { acplane: { decidedBy: "policy", rule: "protect-secrets" } } },
  });
});

test("buildCancelledResponse omits rule when none fired", () => {
  const response = buildCancelledResponse(9, null) as any;
  expect(response.result.outcome).toEqual({ outcome: "cancelled" });
  expect(response.result._meta.acplane).toEqual({ decidedBy: "policy" });
});
