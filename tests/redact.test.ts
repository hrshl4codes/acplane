import { expect, test } from "vitest";
import { redactSecrets } from "../src/policy/redact.js";

test("redacts anthropic, openai, github, aws, and bearer tokens", () => {
  const line =
    "key=sk-ant-api03-abcDEF012345678901234 ghp_ABCDEFabcdef0123456789ABCDEF0123 AKIAIOSFODNN7EXAMPLE sk-proj-ABCDEFabcdef0123456789 Bearer ABCdef0123456789_abcdef.0123456789";

  const out = redactSecrets(line);

  expect(out).not.toMatch(/sk-ant-/);
  expect(out).not.toMatch(/ghp_/);
  expect(out).not.toMatch(/AKIA/);
  expect(out).not.toMatch(/sk-proj-/);
  expect(out).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
  expect(out).toContain("[REDACTED]");
});

test("leaves ordinary text untouched", () => {
  const line = '{"method":"session/update","params":{"text":"read src/app.ts"}}';

  expect(redactSecrets(line)).toBe(line);
});
