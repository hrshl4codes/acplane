import { statSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { createUiServer } from "./dashboard/server.js";
import { openReadonlyDb } from "./db/schema.js";

export interface UiArgs {
  db?: string;
  port?: number;
  host?: string;
}

function optionValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`acplane ui: ${argv[index]} requires a value`);
  }
  return value;
}

function isMissingPath(path: string): boolean {
  try {
    statSync(path);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
}

export function parseUiArgs(argv: string[]): UiArgs {
  const result: UiArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--db") {
      result.db = optionValue(argv, index);
      index += 1;
    } else if (argument === "--host") {
      result.host = optionValue(argv, index);
      index += 1;
    } else if (argument === "--port") {
      const value = optionValue(argv, index);
      const port = Number(value);
      if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error("acplane ui: --port must be an integer from 0 to 65535");
      }
      result.port = port;
      index += 1;
    } else {
      throw new Error(`acplane ui: unknown argument "${argument}"`);
    }
  }

  return result;
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const removeListeners = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    const onError = (error: Error) => {
      removeListeners();
      reject(error);
    };
    const onListening = () => {
      removeListeners();
      resolve();
    };

    server.once("error", onError);
    try {
      server.listen(port, host, onListening);
    } catch (error) {
      removeListeners();
      reject(error);
    }
  });
}

export async function runUi(args: UiArgs): Promise<number> {
  const dbPath = args.db ?? join(homedir(), ".acplane", "index.db");
  let db;
  try {
    db = openReadonlyDb(dbPath);
  } catch (error) {
    if (isMissingPath(dbPath)) {
      console.error(`acplane: no index found at ${dbPath}. Run "acplane index" first.`);
      return 1;
    }
    throw error;
  }

  let server: Server;
  try {
    server = createUiServer({ db });
    await listen(server, args.port ?? 4319, args.host ?? "127.0.0.1");
  } catch (error) {
    db.close();
    throw error;
  }

  const host = args.host ?? "127.0.0.1";
  const shownPort = (server.address() as AddressInfo).port;
  console.error(`acplane: dashboard on http://${host}:${shownPort} (Ctrl+C to stop)`);

  return new Promise<number>((resolve, reject) => {
    let finished = false;
    let stopping = false;

    const removeListeners = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      server.off("close", onClose);
      server.off("error", onError);
    };
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      removeListeners();

      if (error && !stopping) {
        stopping = true;
        try {
          server.close();
        } catch {
          // Preserve the operational error that ended the dashboard lifecycle.
        }
      }

      let failure = error;
      try {
        db.close();
      } catch (closeError) {
        failure ??= closeError;
      }
      if (failure) reject(failure);
      else resolve(0);
    };
    const onClose = () => finish();
    const onError = (error: Error) => finish(error);
    const stop = () => {
      if (stopping || finished) return;
      stopping = true;
      try {
        server.close((error) => {
          if (error) finish(error);
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };

    server.once("close", onClose);
    server.once("error", onError);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
