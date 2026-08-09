import { expect, test } from "vitest";
import { DEFAULT_RULESET, type PolicyRuleset } from "../src/policy/rules.js";
import { createPermissionInterceptor } from "../src/policy/interceptor.js";

const OPTIONS = [
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "reject", name: "Reject", kind: "reject_once" },
];

const intercept = createPermissionInterceptor(DEFAULT_RULESET);

function permissionRequest(kind: string, path: string, id: unknown = "perm-1") {
  return {
    jsonrpc: "2.0",
    id,
    method: "session/request_permission",
    params: {
      toolCall: { toolCallId: "tc", kind, locations: [{ path }] },
      options: OPTIONS.map((option) => ({ ...option })),
    },
  };
}

test("ignores malformed and non-permission messages", () => {
  for (const message of [null, "not a request", [], { jsonrpc: "2.0", method: "session/update", params: {} }]) {
    expect(intercept(message)).toBeNull();
  }
});

test("ignores a permission request without an ID", () => {
  const request = permissionRequest("edit", ".env");
  delete (request as { id?: unknown }).id;
  expect(intercept(request)).toBeNull();
});

test("denies a protected edit by selecting the reject option", () => {
  const response = intercept(permissionRequest("edit", ".env")) as any;
  expect(response).toEqual({
    jsonrpc: "2.0",
    id: "perm-1",
    result: {
      outcome: { outcome: "selected", optionId: "reject" },
      _meta: { acplane: { decidedBy: "policy", rule: "protect-secrets" } },
    },
  });
});

test("preserves a numeric request ID when denying", () => {
  const response = intercept(permissionRequest("edit", ".env", 0)) as any;
  expect(response.id).toBe(0);
});

test("escalates by forwarding an unmatched request", () => {
  expect(intercept(permissionRequest("edit", "src/app.ts"))).toBeNull();
});

test("cancels when a deny rule fires but no reject option is offered", () => {
  const request = permissionRequest("edit", ".env");
  request.params.options = [{ optionId: "allow", name: "Allow", kind: "allow_once" }];
  expect(intercept(request)).toEqual({
    jsonrpc: "2.0",
    id: "perm-1",
    result: {
      outcome: { outcome: "cancelled" },
      _meta: { acplane: { decidedBy: "policy", rule: "protect-secrets" } },
    },
  });
});

const ALLOW_SOURCE_EDITS: PolicyRuleset = {
  default: "escalate",
  rules: [{ name: "allow-source-edits", match: { kind: ["edit"], path: ["src/**"] }, decision: "allow" }],
};

test("allows a matching request by selecting its allow option", () => {
  const response = createPermissionInterceptor(ALLOW_SOURCE_EDITS)(permissionRequest("edit", "src/app.ts"));
  expect(response).toEqual({
    jsonrpc: "2.0",
    id: "perm-1",
    result: {
      outcome: { outcome: "selected", optionId: "allow" },
      _meta: { acplane: { decidedBy: "policy", rule: "allow-source-edits" } },
    },
  });
});

test("forwards an allow decision when no allow option is offered", () => {
  const request = permissionRequest("edit", "src/app.ts");
  request.params.options = [{ optionId: "reject", name: "Reject", kind: "reject_once" }];
  expect(createPermissionInterceptor(ALLOW_SOURCE_EDITS)(request)).toBeNull();
});
