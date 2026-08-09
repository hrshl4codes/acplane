import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadConfig, parseConfig } from "../src/config.js";

const temporaryDirectories: string[] = [];
const originalCwd = process.cwd();
const originalHome = process.env["HOME"];

afterEach(() => {
  process.chdir(originalCwd);
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const VALID = `
defaultHarness: claude
harnesses:
  claude:
    command: npx
    args: ["@agentclientprotocol/claude-agent-acp"]
  codex:
    command: codex
    args: ["acp"]
`;

test("parses a valid config", () => {
  const config = parseConfig(VALID);
  expect(config.defaultHarness).toBe("claude");
  expect(config.harnesses["claude"]!.command).toBe("npx");
  expect(config.harnesses["codex"]!.args).toEqual(["acp"]);
  expect(config.policy).toBeUndefined();
});

test("preserves a configured policy path", () => {
  const config = parseConfig(`
defaultHarness: h
policy: ./team-policy.yaml
harnesses:
  h:
    command: agent
`);

  expect(config.policy).toBe("./team-policy.yaml");
});

test("rejects a non-string configured policy", () => {
  expect(() =>
    parseConfig(`
defaultHarness: h
policy: 42
harnesses:
  h:
    command: agent
`),
  ).toThrow(/config: policy must be a non-empty string/);
});

test("rejects an empty configured policy", () => {
  expect(() =>
    parseConfig(`
defaultHarness: h
policy: ""
harnesses:
  h:
    command: agent
`),
  ).toThrow(/config: policy must be a non-empty string/);
});

test("args defaults to an empty array", () => {
  const config = parseConfig(`
defaultHarness: h
harnesses:
  h:
    command: some-agent
`);
  expect(config.harnesses["h"]!.args).toEqual([]);
});

test("preserves a valid string environment map", () => {
  const config = parseConfig(`
defaultHarness: h
harnesses:
  h:
    command: agent
    env:
      LOG_LEVEL: debug
`);
  expect(config.harnesses["h"]!.env).toEqual({ LOG_LEVEL: "debug" });
});

test("rejects a missing defaultHarness", () => {
  expect(() => parseConfig(`harnesses:\n  h:\n    command: x\n`)).toThrow(/defaultHarness/);
});

test("rejects a defaultHarness not present in harnesses", () => {
  expect(() =>
    parseConfig(`defaultHarness: ghost\nharnesses:\n  h:\n    command: x\n`),
  ).toThrow(/ghost/);
});

test("rejects a harness without a command", () => {
  expect(() => parseConfig(`defaultHarness: h\nharnesses:\n  h:\n    args: []\n`)).toThrow(
    /command/,
  );
});

test("rejects non-string environment values", () => {
  expect(() =>
    parseConfig(`defaultHarness: h\nharnesses:\n  h:\n    command: x\n    env:\n      RETRIES: 3\n`),
  ).toThrow(/env/);
});

test("loads an explicit config file", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-config-"));
  temporaryDirectories.push(directory);
  const configPath = join(directory, "custom.yaml");
  writeFileSync(configPath, VALID);

  expect(loadConfig(configPath).defaultHarness).toBe("claude");
});

test("resolves a relative policy from an explicit config directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-config-"));
  temporaryDirectories.push(directory);
  const configPath = join(directory, "custom.yaml");
  writeFileSync(configPath, `${VALID}\npolicy: policies/team.yaml\n`);

  expect(loadConfig(configPath).policy).toBe(join(directory, "policies", "team.yaml"));
});

test("resolves a relative policy from the cwd config directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-config-"));
  temporaryDirectories.push(directory);
  process.chdir(directory);
  writeFileSync("acplane.yaml", `${VALID}\npolicy: policies/team.yaml\n`);

  expect(loadConfig().policy).toBe(join(process.cwd(), "policies", "team.yaml"));
});

test("resolves a relative policy from the home config directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-config-"));
  temporaryDirectories.push(directory);
  const cwd = join(directory, "cwd");
  const home = join(directory, "home");
  mkdirSync(cwd);
  mkdirSync(join(home, ".acplane"), { recursive: true });
  process.chdir(cwd);
  process.env["HOME"] = home;
  writeFileSync(join(home, ".acplane", "config.yaml"), `${VALID}\npolicy: policies/team.yaml\n`);

  expect(loadConfig().policy).toBe(join(home, ".acplane", "policies", "team.yaml"));
});

test("reports the explicit path when the config file is missing", () => {
  const missingPath = "/definitely/missing/acplane.yaml";
  expect(() => loadConfig(missingPath)).toThrow(missingPath);
});
