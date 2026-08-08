import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { JsonlRecorder } from "../src/recorder.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("records messages as JSONL with a timestamp, direction, and raw payload", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-recorder-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "nested", "session.jsonl");
  const recorder = new JsonlRecorder(file);

  recorder.record("client->harness", '{"id":1,"method":"initialize"}');
  recorder.record("harness->client", '{"id":1,"result":{}}');

  const lines = readFileSync(file, "utf8").trim().split("\n");
  expect(lines).toHaveLength(2);
  const first = JSON.parse(lines[0]!) as { ts: string; direction: string; raw: string };
  expect(first.direction).toBe("client->harness");
  expect(first.raw).toBe('{"id":1,"method":"initialize"}');
  expect(Date.parse(first.ts)).not.toBeNaN();
});

test("counts every dropped message while warning only once", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-recorder-"));
  temporaryDirectories.push(directory);
  const recorder = new JsonlRecorder(directory);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(() => {
    recorder.record("client->harness", "{}");
    recorder.record("client->harness", "{}");
  }).not.toThrow();
  expect(recorder.droppedCount).toBe(2);
  expect(error).toHaveBeenCalledTimes(1);
});
