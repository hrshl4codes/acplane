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

test("drops the observation when the redactor throws without writing the original payload", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-redact-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "s.jsonl");
  const recorder = new JsonlRecorder(file, () => {
    throw new Error("redactor failure");
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() => recorder.record("harness->client", '{"token":"sk-ant-api03-abcDEF012345678901234"}')).not.toThrow();

  expect(recorder.droppedCount).toBe(1);
  expect(existsSync(file)).toBe(false);
  expect(error).toHaveBeenCalledTimes(1);
});
