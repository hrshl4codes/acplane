import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { openDb, type Db } from "../src/db/schema.js";
import { runUi } from "../src/dashboard-cmd.js";

const fakes = vi.hoisted(() => ({
  db: null as Db | null,
  server: null as Server | null,
}));

vi.mock("../src/dashboard/server.js", () => ({
  createUiServer: vi.fn(() => fakes.server),
}));

vi.mock("../src/db/schema.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/db/schema.js")>();
  return {
    ...actual,
    openReadonlyDb: vi.fn((path: string) => fakes.db ?? actual.openReadonlyDb(path)),
  };
});

class FakeUiServer extends EventEmitter {
  closeCalls = 0;

  listen(_port: number, _host: string, callback: () => void): this {
    this.once("listening", callback);
    queueMicrotask(() => this.emit("listening"));
    return this;
  }

  close(): this {
    this.closeCalls += 1;
    return this;
  }

  address(): { address: string; family: string; port: number } {
    return { address: "127.0.0.1", family: "IPv4", port: 44_000 };
  }
}

function createHumanOutput(isTTY: boolean): {
  humanOutput: NodeJS.WritableStream & { isTTY: boolean };
  writes: string[];
} {
  const writes: string[] = [];
  const humanOutput = {
    isTTY,
    write: (chunk: string) => (writes.push(String(chunk)), true),
  } as NodeJS.WritableStream & { isTTY: boolean };
  return { humanOutput, writes };
}

let directory: string | undefined;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  fakes.db = null;
  fakes.server = null;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

test("TTY ui reveals the version banner and styled dashboard-live line", async () => {
  vi.useFakeTimers();
  vi.stubEnv("TERM", "xterm-256color");
  vi.stubEnv("COLORTERM", "truecolor");
  vi.stubEnv("NO_COLOR", undefined);
  directory = mkdtempSync(join(tmpdir(), "acplane-ui-brand-"));
  const dbPath = join(directory, "index.db");
  openDb(dbPath).close();
  const db = { close: vi.fn() } as unknown as Db;
  const server = new FakeUiServer();
  const { humanOutput, writes } = createHumanOutput(true);
  fakes.db = db;
  fakes.server = server as unknown as Server;

  try {
    const completed = runUi({ db: dbPath, humanOutput });
    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(server.listenerCount("close")).toBe(1));

    const text = writes.join("");
    expect(text).toContain("__ _  ___ _ __");
    expect(text).toMatch(/v\d+\.\d+\.\d+/);
    expect(text).toContain("dashboard");
    expect(text).toContain("http://127.0.0.1:44000");
    expect(text).toContain("Ctrl+C");
    expect(text).toMatch(/\x1b\[/);
    expect(vi.getTimerCount()).toBe(0);

    server.emit("close");
    await expect(completed).resolves.toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("startup output failure preserves the error and closes server and database once", async () => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), "acplane-ui-brand-"));
  const dbPath = join(directory, "index.db");
  openDb(dbPath).close();
  const db = { close: vi.fn() } as unknown as Db;
  const server = new FakeUiServer();
  const outputError = new Error("injected startup output failure");
  const humanOutput = {
    isTTY: true,
    write: (chunk: string) => {
      if (chunk.includes("dashboard")) throw outputError;
      return true;
    },
  } as unknown as NodeJS.WritableStream & { isTTY: boolean };
  fakes.db = db;
  fakes.server = server as unknown as Server;

  try {
    const completed = runUi({ db: dbPath, humanOutput });
    const rejection = expect(completed).rejects.toBe(outputError);
    await vi.runAllTimersAsync();
    await rejection;
    expect(server.closeCalls).toBe(1);
    expect(db.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("non-TTY ui output is exactly the legacy dashboard line", async () => {
  directory = mkdtempSync(join(tmpdir(), "acplane-ui-brand-"));
  const dbPath = join(directory, "index.db");
  openDb(dbPath).close();
  const db = { close: vi.fn() } as unknown as Db;
  const server = new FakeUiServer();
  const { humanOutput, writes } = createHumanOutput(false);
  fakes.db = db;
  fakes.server = server as unknown as Server;

  const completed = runUi({ db: dbPath, humanOutput });
  await vi.waitFor(() => expect(server.listenerCount("close")).toBe(1));
  expect(writes.join("")).toBe(
    "acplane: dashboard on http://127.0.0.1:44000 (Ctrl+C to stop)\n",
  );

  server.emit("close");
  await expect(completed).resolves.toBe(0);
});

test("non-TTY missing-index failure emits only the exact legacy error", async () => {
  directory = mkdtempSync(join(tmpdir(), "acplane-ui-brand-"));
  const dbPath = join(directory, "missing.db");
  const writes: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "error").mockImplementation((chunk?: unknown) => {
    writes.push(`${String(chunk)}\n`);
  });

  await expect(runUi({ db: dbPath })).resolves.toBe(1);
  expect(writes.join("")).toBe(
    `acplane: no index found at ${dbPath}. Run "acplane index" first.\n`,
  );
});
