import { expect, test } from "vitest";
import { redactSecrets } from "../src/policy/redact.js";

test.each([
  ["anthropic", "sk-ant-api03-abc_DEF012345678901234"],
  ["openai", "sk-proj-ABCDEFabcdef0123456789"],
  ["github", "ghp_ABCDEFabcdef0123456789ABCDEF0123"],
  ["aws", "AKIAIOSFODNN7EXAMPLE"],
  ["bearer", "Bearer ABCdef0123456789_abcdef.0123456789"],
])("redacts a %s token exactly", (_name, token) => {
  expect(redactSecrets(token)).toBe("[REDACTED]");
});

test.each([
  ["anthropic token body shorter than 16 characters", "sk-ant-abc_DEF01234567"],
  ["openai sk- token body shorter than 20 characters", "sk-ABCDEFabcdef0123456"],
  ["github token body shorter than 20 characters", "ghp_ABCDEFabcdef0123456"],
  ["aws access-key ID body shorter than 16 characters", "AKIAIOSFODNN7EXAMPL"],
  ["bearer credential body shorter than 20 characters", "Bearer ABCdef0123456789abc"],
])("does not redact a near-miss %s", (_name, token) => {
  expect(redactSecrets(token)).toBe(token);
});

test("leaves ordinary text untouched", () => {
  const line = '{"method":"session/update","params":{"text":"read src/app.ts"}}';

  expect(redactSecrets(line)).toBe(line);
});
