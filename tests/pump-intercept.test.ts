import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import { startPump } from "../src/pump.js";

function waitForOutput(output: PassThrough, fragments: string | string[]): Promise<string> {
  const expected = Array.isArray(fragments) ? fragments : [fragments];
  let received = "";
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      received += chunk.toString();
      const match = expected.find((fragment) => received.includes(fragment));
      if (match) {
        output.off("data", onData);
        resolve(match);
      }
    };
    output.on("data", onData);
  });
}

function permissionPump(
  interceptHarnessRequest: NonNullable<Parameters<typeof startPump>[0]["interceptHarnessRequest"]>,
  taps?: Parameters<typeof startPump>[0]["taps"],
) {
  const input = new PassThrough();
  const output = new PassThrough();
  const clientReceived: string[] = [];
  output.on("data", (chunk: Buffer) => clientReceived.push(chunk.toString()));
  const { exited } = startPump({
    command: process.execPath,
    args: [join(import.meta.dirname, "fixtures", "permission-harness.mjs")],
    input,
    output,
    taps,
    interceptHarnessRequest,
  });
  return { input, output, clientReceived, exited };
}

afterEach(() => vi.restoreAllMocks());

test("intercepts a permission request: answers the harness and hides it from the client", async () => {
  const taps: Array<{ direction: string; raw: string }> = [];
  const order: string[] = [];
  const { input, output, clientReceived, exited } = permissionPump(
    (message) => {
      const record = message as Record<string, unknown>;
      if (record?.["method"] !== "session/request_permission") return null;

      order.push("interceptor");
      return {
        jsonrpc: "2.0",
        id: record["id"],
        result: {
          outcome: { outcome: "selected", optionId: "reject" },
          _meta: { acplane: { decidedBy: "policy", rule: "protect-secrets" } },
        },
      };
    },
    {
      onClientMessage: (_message, raw) => {
        taps.push({ direction: "client->harness", raw });
        if (raw.includes('"decidedBy":"policy"')) order.push("client-tap");
      },
      onHarnessMessage: (message, raw) => {
        taps.push({ direction: "harness->client", raw });
        if ((message as Record<string, unknown>)?.["method"] === "session/request_permission") {
          order.push("harness-tap");
        }
      },
    },
  );

  const permissionHandled = waitForOutput(output, ["permission outcome", "session/request_permission"]);
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  input.write(
    '{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"perm-session","prompt":[{"type":"text","text":"edit env"}]}}\n',
  );
  await permissionHandled;
  input.write('{"jsonrpc":"2.0","id":3,"method":"shutdown"}\n');

  expect(await exited).toBe(0);
  const clientText = clientReceived.join("");
  expect(clientText).not.toContain("session/request_permission");
  expect(clientText).toContain("permission outcome");
  expect(clientText).toContain("reject");
  expect(order).toEqual(["harness-tap", "interceptor", "client-tap"]);
  expect(
    taps.some((tap) => tap.direction === "harness->client" && tap.raw.includes("session/request_permission")),
  ).toBe(true);
  expect(
    taps.some((tap) => tap.direction === "client->harness" && tap.raw.includes('"decidedBy":"policy"')),
  ).toBe(true);
});

test("a throwing interceptor logs and forwards the original harness request unchanged", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  let harnessRequestRaw: string | undefined;
  const { input, output, clientReceived, exited } = permissionPump(
    (message) => {
      if ((message as Record<string, unknown>)?.["method"] === "session/request_permission") {
        throw new Error("interceptor exploded");
      }
      return null;
    },
    {
      onHarnessMessage: (message, raw) => {
        if ((message as Record<string, unknown>)?.["method"] === "session/request_permission") {
          harnessRequestRaw = raw;
        }
      },
    },
  );

  const requestForwarded = waitForOutput(output, "session/request_permission");
  input.write(
    '{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"perm-session","prompt":[{"type":"text","text":"edit env"}]}}\n',
  );
  await requestForwarded;
  input.write('{"jsonrpc":"2.0","id":3,"method":"shutdown"}\n');

  expect(await exited).toBe(0);
  expect(harnessRequestRaw).toBeDefined();
  const forwardedRequest = clientReceived
    .join("")
    .split("\n")
    .find((line) => line.includes("session/request_permission"));
  expect(forwardedRequest).toBe(harnessRequestRaw);
  expect(consoleError).toHaveBeenCalledWith(
    "acplane: interceptor error (forwarding request): Error: interceptor exploded",
  );
});
