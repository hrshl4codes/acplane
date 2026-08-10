import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import { runProxy } from "../src/cli.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createHumanOutput(isTTY: boolean): {
  humanOutput: NodeJS.WritableStream & { isTTY: boolean };
  writes: string[];
} {
  const writes: string[] = [];
  const humanOutput = {
    isTTY,
    write: (chunk: string | Uint8Array) => (writes.push(String(chunk)), true),
  } as NodeJS.WritableStream & { isTTY: boolean };
  return { humanOutput, writes };
}

function writeConfig(directory: string, command: string, args: string[]): string {
  const configPath = join(directory, "acplane.yaml");
  writeFileSync(
    configPath,
    `defaultHarness: fake\nharnesses:\n  fake:\n    command: ${command}\n    args: ${JSON.stringify(args)}\n`,
  );
  return configPath;
}

function createProxy(): {
  directory: string;
  configPath: string;
  input: PassThrough;
  output: PassThrough;
  wire: string[];
} {
  const directory = mkdtempSync(join(tmpdir(), "acplane-proxy-brand-"));
  temporaryDirectories.push(directory);
  const harness = join(import.meta.dirname, "fixtures", "fake-harness.mjs");
  const configPath = writeConfig(directory, process.execPath, [harness]);
  const input = new PassThrough();
  const output = new PassThrough();
  const wire: string[] = [];
  output.on("data", (chunk: Buffer) => wire.push(chunk.toString()));
  return { directory, configPath, input, output, wire };
}

test("TTY proxy status identifies the version and harness without contaminating the ACP wire", async () => {
  vi.stubEnv("TERM", "xterm-256color");
  vi.stubEnv("NO_COLOR", undefined);
  const { directory, configPath, input, output, wire } = createProxy();
  const { humanOutput, writes } = createHumanOutput(true);

  const exited = runProxy({
    config: configPath,
    sessionsDir: join(directory, "sessions"),
    input,
    output,
    humanOutput,
  });
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"shutdown"}\n');

  await expect(exited).resolves.toBe(0);
  expect(writes.join("").replaceAll(/\x1b\[[0-9;]*m/g, "")).toBe(
    "acplane v0.0.1 · proxying fake\n",
  );
  const wireText = wire.join("");
  expect(wireText).not.toContain("proxying");
  expect(wireText).not.toContain("acplane v");
  for (const line of wireText.split("\n").filter(Boolean)) {
    expect(() => JSON.parse(line)).not.toThrow();
  }
});

test("proxy status is silent off-TTY", async () => {
  const nonTtyProxy = createProxy();
  const nonTtyOutput = createHumanOutput(false);
  const nonTtyExited = runProxy({
    config: nonTtyProxy.configPath,
    sessionsDir: join(nonTtyProxy.directory, "sessions"),
    input: nonTtyProxy.input,
    output: nonTtyProxy.output,
    humanOutput: nonTtyOutput.humanOutput,
  });
  nonTtyProxy.input.end('{"jsonrpc":"2.0","id":1,"method":"shutdown"}\n');
  await expect(nonTtyExited).resolves.toBe(0);
  expect(nonTtyOutput.writes.join("")).toBe("");
});

test("proxy status is plain on a NO_COLOR TTY", async () => {
  vi.stubEnv("NO_COLOR", "1");
  const noColorProxy = createProxy();
  const noColorOutput = createHumanOutput(true);
  const noColorExited = runProxy({
    config: noColorProxy.configPath,
    sessionsDir: join(noColorProxy.directory, "sessions"),
    input: noColorProxy.input,
    output: noColorProxy.output,
    humanOutput: noColorOutput.humanOutput,
  });
  noColorProxy.input.end('{"jsonrpc":"2.0","id":1,"method":"shutdown"}\n');
  await expect(noColorExited).resolves.toBe(0);
  expect(noColorOutput.writes.join("")).toBe("acplane v0.0.1 · proxying fake\n");
  expect(noColorOutput.writes.join("")).not.toMatch(/\x1b\[/);
});

test("a startup status write failure preserves the error and starts no recorder or harness", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-proxy-brand-"));
  temporaryDirectories.push(directory);
  const harnessMarker = join(directory, "harness-started");
  const sessionsDir = join(directory, "sessions");
  const configPath = writeConfig(directory, process.execPath, [
    "-e",
    "require('node:fs').writeFileSync(process.argv[1], 'started')",
    harnessMarker,
  ]);
  const outputError = new Error("injected proxy status write failure");
  const humanOutput = {
    isTTY: true,
    write: () => {
      throw outputError;
    },
  } as unknown as NodeJS.WritableStream & { isTTY: boolean };

  await expect(runProxy({ config: configPath, sessionsDir, humanOutput })).rejects.toBe(outputError);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(existsSync(harnessMarker)).toBe(false);
  expect(existsSync(sessionsDir)).toBe(false);
});
