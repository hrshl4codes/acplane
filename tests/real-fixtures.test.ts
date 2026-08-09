import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vitest";
import { readSessionEvents } from "../src/normalize/events.js";
import { normalizeSession } from "../src/normalize/normalize.js";

const realFixturesDirectory = join(import.meta.dirname, "fixtures", "real");
const files = readdirSync(realFixturesDirectory)
  .filter((file) => file.endsWith(".jsonl"))
  .sort();

test("includes sanitized sessions captured from Claude and Codex", () => {
  expect(files).toEqual(["claude-sample.jsonl", "codex-sample.jsonl"]);
});

const privateContentPatterns = [
  /\/Users\/[^/\s\"]+/,
  /\/home\/[^/\s\"]+/,
  /acplane-capture\./,
  /docs\/superpowers\/plans\//,
  /\b(?:sk-(?:ant-|proj-)?|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/,
  /BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

test.each(files)("contains no common private-data patterns in %s", (file) => {
  const contents = readFileSync(join(realFixturesDirectory, file), "utf8");
  for (const pattern of privateContentPatterns) expect(contents).not.toMatch(pattern);
});

const allowedToolKinds = new Set([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "fetch",
  "think",
  "other",
]);

test.each(files)("normalizes genuine fixture %s into a coherent graph", (file) => {
  const sessionId = basename(file, ".jsonl");
  const events = readSessionEvents(join(realFixturesDirectory, file));
  const normalized = normalizeSession(sessionId, "real", events);

  expect(normalized.turns.length).toBeGreaterThan(0);
  expect(normalized.session.startedAt).not.toBeNull();
  for (const call of normalized.toolCalls) {
    expect(allowedToolKinds.has(call.kind)).toBe(true);
  }
  for (const touch of normalized.fileTouches) {
    expect(touch.path.length).toBeGreaterThan(0);
  }
  expect(normalized.usage.length).toBe(normalized.turns.length);
  expect(normalized.usage.every((sample) => sample.source === "reported")).toBe(true);
});
