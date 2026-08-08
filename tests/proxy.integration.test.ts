import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test } from "vitest";
import { JsonlRecorder, type Direction } from "../src/recorder.js";
import { startPump } from "../src/pump.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const CLIENT_SCRIPT = [
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}',
  '{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/tmp"}}',
  '{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"fake-session-1","prompt":[{"type":"text","text":"do the thing"}]}}',
  '{"jsonrpc":"2.0","id":4,"method":"shutdown"}',
];

test("proxies an ACP conversation unchanged and records every message", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-integration-"));
  temporaryDirectories.push(directory);
  const recorder = new JsonlRecorder(join(directory, "session.jsonl"));
  const input = new PassThrough();
  const output = new PassThrough();
  const clientReceived: string[] = [];
  output.on("data", (chunk: Buffer) => clientReceived.push(chunk.toString()));

  const { exited } = startPump({
    command: process.execPath,
    args: [join(import.meta.dirname, "fixtures", "fake-harness.mjs")],
    input,
    output,
    taps: {
      onClientMessage: (_message, raw) => recorder.record("client->harness", raw),
      onHarnessMessage: (_message, raw) => recorder.record("harness->client", raw),
    },
  });

  for (const line of CLIENT_SCRIPT) input.write(`${line}\n`);
  expect(await exited).toBe(0);

  const lines = clientReceived.join("").trim().split("\n");
  expect(lines).toHaveLength(6);
  expect(JSON.parse(lines[0]!)).toMatchObject({ id: 1, result: { protocolVersion: 1 } });
  const updates = lines
    .map((line) => JSON.parse(line) as { method?: string; params?: Record<string, unknown> })
    .filter((message) => message.method === "session/update");
  expect(updates).toHaveLength(2);
  expect(updates[1]!.params).toMatchObject({
    update: { kind: "read", toolCallId: "tc-1" },
  });

  const recorded = readFileSync(join(directory, "session.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { direction: Direction; raw: string });
  expect(recorded).toHaveLength(10);
  expect(recorded.filter((record) => record.direction === "client->harness")).toHaveLength(4);
  expect(recorded.filter((record) => record.direction === "harness->client")).toHaveLength(6);
  expect(recorded[0]!.raw).toBe(CLIENT_SCRIPT[0]);
});
