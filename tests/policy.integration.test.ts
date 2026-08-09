import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test } from "vitest";
import { runProxy } from "../src/cli.js";
import { openDb } from "../src/db/schema.js";
import { runIndex } from "../src/index-cmd.js";
import { DEFAULT_RULESET, parseRuleset } from "../src/policy/rules.js";

const originalCwd = process.cwd();
const originalHome = process.env["HOME"];
const temporaryDirectories: string[] = [];

function waitForOutput(output: PassThrough, fragment: string): Promise<void> {
  let received = "";
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      received += chunk.toString();
      if (received.includes(fragment)) {
        output.off("data", onData);
        resolve();
      }
    };
    output.on("data", onData);
  });
}

afterEach(() => {
  process.chdir(originalCwd);
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("default policy denies a .env edit and the decision is queryable after indexing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-policy-pipe-"));
  temporaryDirectories.push(directory);
  const home = join(directory, "home");
  mkdirSync(home);
  process.chdir(directory);
  process.env["HOME"] = home;

  const harness = join(import.meta.dirname, "fixtures", "permission-harness.mjs");
  const configPath = join(directory, "acplane.yaml");
  writeFileSync(
    configPath,
    `defaultHarness: perm\nharnesses:\n  perm:\n    command: ${process.execPath}\n    args: ["${harness}"]\n`,
  );

  const input = new PassThrough();
  const output = new PassThrough();
  output.on("data", () => {});
  const sessionsDir = join(directory, "sessions");

  const exited = runProxy({ config: configPath, sessionsDir, input, output });
  const permissionHandled = waitForOutput(output, "permission outcome");
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  input.write(
    '{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"perm-session","prompt":[{"type":"text","text":"edit env"}]}}\n',
  );
  await permissionHandled;
  input.end('{"jsonrpc":"2.0","id":3,"method":"shutdown"}\n');
  const exitCode = await exited;
  output.destroy();
  expect(exitCode).toBe(0);

  const sessionFiles = readdirSync(sessionsDir);
  expect(sessionFiles).toHaveLength(1);
  const sessionFile = join(sessionsDir, sessionFiles[0]!);
  const dbPath = join(directory, "index.db");
  expect(await runIndex({ db: dbPath, files: [sessionFile] })).toBe(0);

  const db = openDb(dbPath);
  try {
    const permission = db
      .prepare("SELECT decision, decided_by, rule FROM permission_event")
      .get() as { decision: string; decided_by: string; rule: string };
    expect(permission).toEqual({
      decision: "deny",
      decided_by: "policy",
      rule: "protect-secrets",
    });
  } finally {
    db.close();
  }
});

test("shipped policy example parses to the built-in default ruleset", () => {
  const examplePath = join(import.meta.dirname, "..", "acplane.policy.example.yaml");
  expect(existsSync(examplePath), "acplane.policy.example.yaml must be shipped").toBe(true);

  expect(parseRuleset(readFileSync(examplePath, "utf8"))).toEqual(DEFAULT_RULESET);
});
