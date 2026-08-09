import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test } from "vitest";
import { parseArgs, runProxy } from "../src/cli.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("parseArgs extracts harness and config selections", () => {
  expect(parseArgs(["--harness", "codex", "--config", "/x/acplane.yaml"])).toEqual({
    harness: "codex",
    config: "/x/acplane.yaml",
  });
  expect(parseArgs([])).toEqual({});
});

test("parseArgs rejects unknown flags and missing values", () => {
  expect(() => parseArgs(["--bogus"])).toThrow(/--policy <path>/);
  expect(() => parseArgs(["--harness"])).toThrow(/requires a value/);
  expect(() => parseArgs(["--config"])).toThrow(/requires a value/);
  expect(() => parseArgs(["--policy"])).toThrow(/requires a value/);
  expect(() => parseArgs(["--policy", "--config", "/x/acplane.yaml"])).toThrow(/requires a value/);
});

test("runProxy spawns the configured harness and records the session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-cli-"));
  temporaryDirectories.push(directory);
  const fakeHarness = join(import.meta.dirname, "fixtures", "fake-harness.mjs");
  const policyPath = join(directory, "policy.yaml");
  writeFileSync(policyPath, "default: escalate\nrules: []\n");
  const configPath = join(directory, "acplane.yaml");
  writeFileSync(
    configPath,
    `defaultHarness: fake\nharnesses:\n  fake:\n    command: ${process.execPath}\n    args: ["${fakeHarness}"]\n`,
  );

  const input = new PassThrough();
  const output = new PassThrough();
  output.on("data", () => {});
  const completed = runProxy({
    config: configPath,
    policy: policyPath,
    sessionsDir: join(directory, "sessions"),
    input,
    output,
  });
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"shutdown"}\n');

  expect(await completed).toBe(0);
  const files = readdirSync(join(directory, "sessions"));
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/-fake-[0-9a-f]{4}\.jsonl$/);
  expect(readFileSync(join(directory, "sessions", files[0]!), "utf8").trim().split("\n")).toHaveLength(4);
});
