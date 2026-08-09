import { existsSync } from "node:fs";
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
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    try {
      server.listen(port, host, onListening);
    } catch (error) {
      server.off("error", onError);
      reject(error);
    }
  });
}

export async function runUi(args: UiArgs): Promise<number> {
  const dbPath = args.db ?? join(homedir(), ".acplane", "index.db");
  if (!existsSync(dbPath)) {
    console.error(`acplane: no index found at ${dbPath}. Run "acplane index" first.`);
    return 1;
  }

  const db = openReadonlyDb(dbPath);
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

    const removeSignalListeners = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    };
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      removeSignalListeners();
      try {
        db.close();
      } catch (closeError) {
        reject(closeError);
        return;
      }
      if (error) reject(error);
      else resolve(0);
    };
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

    server.once("close", finish);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
