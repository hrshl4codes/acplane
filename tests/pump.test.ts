import { PassThrough } from "node:stream";
import { expect, test, vi } from "vitest";
import { startPump } from "../src/pump.js";

const ECHO_AGENT = `
const { createInterface } = require("node:readline");
createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.id !== undefined) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { echoed: msg.method } }) + "\\n");
  }
  if (msg.method === "shutdown") process.exit(0);
});
`;

const RAW_ECHO_AGENT = `
process.stdin.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (chunk.toString().includes("shutdown")) process.exit(0);
});
`;

function pumpWithAgent(
  source = ECHO_AGENT,
  taps?: Parameters<typeof startPump>[0]["taps"],
) {
  const input = new PassThrough();
  const output = new PassThrough();
  const received: string[] = [];
  output.on("data", (chunk: Buffer) => received.push(chunk.toString()));
  const { exited } = startPump({
    command: process.execPath,
    args: ["-e", source],
    input,
    output,
    taps,
  });
  return { input, received, exited };
}

test("forwards client requests and harness responses", async () => {
  const { input, received, exited } = pumpWithAgent();
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"shutdown"}\n');

  expect(await exited).toBe(0);
  const lines = received.join("").trim().split("\n");
  expect(JSON.parse(lines[0]!)).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: { echoed: "initialize" },
  });
  expect(JSON.parse(lines[1]!)).toEqual({
    jsonrpc: "2.0",
    id: 2,
    result: { echoed: "shutdown" },
  });
});

test("preserves raw CRLF-framed messages in both directions", async () => {
  const { input, received, exited } = pumpWithAgent(RAW_ECHO_AGENT);
  const raw = '{ "jsonrpc": "2.0", "id": 3, "method": "shutdown" }\r\n';
  input.write(raw);

  expect(await exited).toBe(0);
  expect(received.join("")).toBe(raw);
});

test("taps observe parsed messages in both directions", async () => {
  const seen: Array<{ direction: string; method?: string }> = [];
  const { input, exited } = pumpWithAgent(ECHO_AGENT, {
    onClientMessage: (message) =>
      seen.push({ direction: "client", method: (message as { method?: string })?.method }),
    onHarnessMessage: () => seen.push({ direction: "harness" }),
  });
  input.write('{"jsonrpc":"2.0","id":1,"method":"shutdown"}\n');

  await exited;
  expect(seen).toContainEqual({ direction: "client", method: "shutdown" });
  expect(seen).toContainEqual({ direction: "harness" });
});

test("a throwing tap does not break forwarding", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { input, received, exited } = pumpWithAgent(ECHO_AGENT, {
    onClientMessage: () => {
      throw new Error("tap exploded");
    },
  });
  input.write('{"jsonrpc":"2.0","id":9,"method":"shutdown"}\n');

  expect(await exited).toBe(0);
  expect(received.join("")).toContain('"id":9');
});
