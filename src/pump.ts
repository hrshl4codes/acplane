import { spawn, type ChildProcess } from "node:child_process";
import { createLineParser, type LineHandler } from "./ndjson.js";

export interface PumpTaps {
  onClientMessage?: LineHandler;
  onHarnessMessage?: LineHandler;
}

export interface PumpOptions {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  taps?: PumpTaps;
  interceptHarnessRequest?: (message: unknown) => object | null;
}

function safeTap(tap: LineHandler | undefined, message: unknown | null, raw: string): void {
  if (!tap) return;
  try {
    tap(message, raw);
  } catch (error) {
    console.error(`acplane: tap error (forwarding unaffected): ${String(error)}`);
  }
}

export function startPump(options: PumpOptions): { child: ChildProcess; exited: Promise<number> } {
  const child = spawn(options.command, options.args, {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });

  const clientToHarness = createLineParser((message, raw) => {
    safeTap(options.taps?.onClientMessage, message, raw);
    child.stdin!.write(`${raw}\n`);
  });
  const harnessToClient = createLineParser((message, raw) => {
    safeTap(options.taps?.onHarnessMessage, message, raw);

    if (options.interceptHarnessRequest) {
      let response: object | null = null;
      try {
        response = options.interceptHarnessRequest(message);
      } catch (error) {
        console.error(`acplane: interceptor error (forwarding request): ${String(error)}`);
        response = null;
      }
      if (response) {
        const responseRaw = JSON.stringify(response);
        safeTap(options.taps?.onClientMessage, response, responseRaw);
        child.stdin!.write(`${responseRaw}\n`);
        return;
      }
    }

    options.output.write(`${raw}\n`);
  });

  options.input.on("data", clientToHarness);
  child.stdout!.on("data", harnessToClient);
  child.stderr!.pipe(options.stderr ?? process.stderr);

  const exited = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });

  return { child, exited };
}
