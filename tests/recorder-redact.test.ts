import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { redactSecrets } from "../src/policy/redact.js";
import { JsonlRecorder } from "../src/recorder.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("stores redacted raw when a redactor is provided", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-redact-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "s.jsonl");
  const recorder = new JsonlRecorder(file, redactSecrets);

  recorder.record("harness->client", '{"token":"sk-ant-api03-abcDEF012345678901234"}');

  const stored = JSON.parse(readFileSync(file, "utf8").trim()) as { direction: string; raw: string };
  expect(stored.direction).toBe("harness->client");
  expect(stored.raw).not.toContain("sk-ant-");
  expect(stored.raw).toContain("[REDACTED]");
});

test("drops redactor failures without writing or printing the original payload", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-redact-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "s.jsonl");
  const secret = "sk-ant-api03-abcDEF012345678901234";
  const recorder = new JsonlRecorder(file, () => {
    throw new Error(`redactor failure: ${secret}`);
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() => {
    recorder.record("harness->client", `{\"token\":\"${secret}\"}`);
    recorder.record("harness->client", `{\"token\":\"${secret}\"}`);
  }).not.toThrow();

  expect(recorder.droppedCount).toBe(2);
  expect(existsSync(file)).toBe(false);
  expect(error).toHaveBeenCalledTimes(1);
  expect(error.mock.calls.flat().join("\n")).not.toContain(secret);
});
