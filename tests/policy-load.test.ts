import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadRuleset } from "../src/policy/load.js";
import { DEFAULT_RULESET } from "../src/policy/rules.js";

const originalCwd = process.cwd();
const originalHome = process.env["HOME"];
const temporaryDirectories: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function isolateDefaultLocations(): { directory: string; home: string } {
  const directory = mkdtempSync(join(tmpdir(), "acplane-policy-load-"));
  const home = join(directory, "home");
  mkdirSync(home);
  temporaryDirectories.push(directory);
  process.chdir(directory);
  process.env["HOME"] = home;
  return { directory, home };
}

function writePolicy(path: string, decision: "allow" | "deny" | "escalate"): void {
  writeFileSync(path, `default: ${decision}\nrules: []\n`);
}

test("loads the CLI policy before every lower-precedence location", () => {
  const { directory, home } = isolateDefaultLocations();
  const explicitPath = join(directory, "explicit.yaml");
  const configPath = join(directory, "configured.yaml");
  writePolicy(explicitPath, "deny");
  writePolicy(configPath, "allow");
  writePolicy(join(directory, "acplane.policy.yaml"), "escalate");
  mkdirSync(join(home, ".acplane"));
  writePolicy(join(home, ".acplane", "policy.yaml"), "allow");

  expect(loadRuleset(explicitPath, configPath).default).toBe("deny");
});

test("loads the configured policy before cwd and home policies", () => {
  const { directory, home } = isolateDefaultLocations();
  const configPath = join(directory, "configured.yaml");
  writePolicy(configPath, "allow");
  writePolicy(join(directory, "acplane.policy.yaml"), "deny");
  mkdirSync(join(home, ".acplane"));
  writePolicy(join(home, ".acplane", "policy.yaml"), "escalate");

  expect(loadRuleset(undefined, configPath).default).toBe("allow");
});

test("a missing configured policy fails instead of falling through to a cwd allow policy", () => {
  const { directory } = isolateDefaultLocations();
  writePolicy(join(directory, "acplane.policy.yaml"), "allow");
  const missingPath = join(directory, "missing.yaml");

  expect(() => loadRuleset(undefined, missingPath)).toThrow(`policy: file not found: ${missingPath}`);
});

test("does not fall through when a configured policy has a non-missing filesystem error", () => {
  const { directory } = isolateDefaultLocations();
  const configPath = join(directory, "configured.yaml");
  symlinkSync("configured.yaml", configPath);
  writePolicy(join(directory, "acplane.policy.yaml"), "allow");

  let thrown: unknown;
  try {
    loadRuleset(undefined, configPath);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ code: "ELOOP" });
});

test("loads the cwd policy before the home policy", () => {
  const { directory, home } = isolateDefaultLocations();
  writePolicy(join(directory, "acplane.policy.yaml"), "allow");
  mkdirSync(join(home, ".acplane"));
  writePolicy(join(home, ".acplane", "policy.yaml"), "deny");

  expect(loadRuleset().default).toBe("allow");
});

test("loads the home policy when cwd has no policy", () => {
  const { home } = isolateDefaultLocations();
  mkdirSync(join(home, ".acplane"));
  writePolicy(join(home, ".acplane", "policy.yaml"), "deny");

  expect(loadRuleset().default).toBe("deny");
});

test("falls back to the built-in ruleset when no policy file exists", () => {
  isolateDefaultLocations();

  expect(loadRuleset()).toBe(DEFAULT_RULESET);
});

test("throws when the CLI policy path is missing", () => {
  const { directory } = isolateDefaultLocations();
  writePolicy(join(directory, "acplane.policy.yaml"), "allow");
  const missingPath = join(directory, "missing.yaml");

  expect(() => loadRuleset(missingPath)).toThrow(`policy: file not found: ${missingPath}`);
});
