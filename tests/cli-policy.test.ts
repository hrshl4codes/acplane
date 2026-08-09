import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("parseArgs recognizes --policy", () => {
  expect(parseArgs(["--policy", "/x/policy.yaml"])).toEqual({ policy: "/x/policy.yaml" });
});

test("runProxy enforces a configured policy and redacts the annotated recording", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-cli-policy-"));
  temporaryDirectories.push(directory);
  const harness = join(import.meta.dirname, "fixtures", "permission-harness.mjs");
  const policyPath = join(directory, "policy.yaml");
  writeFileSync(
    policyPath,
    `default: escalate\nrules:\n  - name: configured-secret-policy\n    match:\n      kind: [edit]\n      path: ["**/.env*"]\n    decision: deny\n`,
  );
  const configPath = join(directory, "acplane.yaml");
  writeFileSync(
    configPath,
    `defaultHarness: perm\npolicy: ${policyPath}\nharnesses:\n  perm:\n    command: ${process.execPath}\n    args: ["${harness}"]\n`,
  );

  const input = new PassThrough();
  const output = new PassThrough();
  const clientReceived: string[] = [];
  output.on("data", (chunk: Buffer) => clientReceived.push(chunk.toString()));
  const sessionsDir = join(directory, "sessions");
  const secret = "sk-ant-api03-abcDEF012345678901234";

  const exited = runProxy({ config: configPath, sessionsDir, input, output });
  const permissionHandled = waitForOutput(output, "permission outcome");
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  input.write(
    `{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"perm-session","prompt":[{"type":"text","text":"edit env ${secret}"}]}}\n`,
  );
  await permissionHandled;
  input.write('{"jsonrpc":"2.0","id":3,"method":"shutdown"}\n');

  expect(await exited).toBe(0);
  const clientText = clientReceived.join("");
  expect(clientText).not.toContain("session/request_permission");
  expect(clientText).toContain("reject");

  const sessionFile = join(sessionsDir, readdirSync(sessionsDir)[0]!);
  const recorded = readFileSync(sessionFile, "utf8");
  const recordedPayloads = recorded
    .trim()
    .split("\n")
    .map((line) => (JSON.parse(line) as { raw: string }).raw);
  expect(recordedPayloads.some((raw) => raw.includes('"decidedBy":"policy"'))).toBe(true);
  expect(recordedPayloads.some((raw) => raw.includes("configured-secret-policy"))).toBe(true);
  expect(recorded).toContain("[REDACTED]");
  expect(recorded).not.toContain(secret);
});

test("runProxy rejects a missing CLI policy even when config has a policy", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-cli-policy-"));
  temporaryDirectories.push(directory);
  const configPolicy = join(directory, "configured.yaml");
  writeFileSync(configPolicy, "default: allow\nrules: []\n");
  const configPath = join(directory, "acplane.yaml");
  writeFileSync(
    configPath,
    `defaultHarness: unused\npolicy: ${configPolicy}\nharnesses:\n  unused:\n    command: ${process.execPath}\n    args: []\n`,
  );
  const missingPolicy = join(directory, "missing.yaml");

  await expect(runProxy({ config: configPath, policy: missingPolicy })).rejects.toThrow(
    `policy: file not found: ${missingPolicy}`,
  );
});
