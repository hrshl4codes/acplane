import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { main } from "../src/cli.js";
import { createUiServer } from "../src/dashboard/server.js";
import { openDb, openReadonlyDb, type Db } from "../src/db/schema.js";
import { parseUiArgs, runUi } from "../src/dashboard-cmd.js";

const fakes = vi.hoisted(() => ({
  readonlyDb: null as Db | null,
  server: null as Server | null,
}));

vi.mock("../src/dashboard/server.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/dashboard/server.js")>();
  return {
    ...actual,
    createUiServer: vi.fn((options: { db: Db }) =>
      fakes.server ? fakes.server : actual.createUiServer(options),
    ),
  };
});

vi.mock("../src/db/schema.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/db/schema.js")>();
  return {
    ...actual,
    openReadonlyDb: vi.fn((path: string) =>
      fakes.readonlyDb ? fakes.readonlyDb : actual.openReadonlyDb(path),
    ),
  };
});

const temporaryDirectories: string[] = [];

class FakeUiServer extends EventEmitter {
  readonly listenCalls: Array<{ port: number; host: string }> = [];
  closeCalls = 0;
  listenError: Error | null = null;
  shownPort = 44000;

  listen(port: number, host: string, callback: () => void): this {
    this.listenCalls.push({ port, host });
    queueMicrotask(() => {
      if (this.listenError) this.emit("error", this.listenError);
      else callback();
    });
    return this;
  }

  close(): this {
    this.closeCalls += 1;
    return this;
  }

  address(): { address: string; family: string; port: number } {
    return { address: "127.0.0.1", family: "IPv4", port: this.shownPort };
  }
}

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function captureShutdownSignals(): {
  active: Set<NodeJS.Signals>;
  callbacks: Partial<Record<NodeJS.Signals, () => void>>;
} {
  const active = new Set<NodeJS.Signals>();
  const callbacks: Partial<Record<NodeJS.Signals, () => void>> = {};
  const originalOnce = process.once.bind(process);
  const originalOff = process.off.bind(process);

  vi.spyOn(process, "once").mockImplementation((event, listener) => {
    if (event === "SIGINT" || event === "SIGTERM") {
      active.add(event);
      callbacks[event] = listener as () => void;
      return process;
    }
    return originalOnce(event, listener);
  });
  vi.spyOn(process, "off").mockImplementation((event, listener) => {
    if (event === "SIGINT" || event === "SIGTERM") {
      if (callbacks[event] === listener) active.delete(event);
      return process;
    }
    return originalOff(event, listener);
  });

  return { active, callbacks };
}

afterEach(() => {
  fakes.readonlyDb = null;
  fakes.server = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("parseUiArgs reads database, port, and host", () => {
  expect(parseUiArgs(["--db", "/x.db", "--port", "5000", "--host", "0.0.0.0"])).toEqual({
    db: "/x.db",
    port: 5000,
    host: "0.0.0.0",
  });
});

test.each(["--db", "--host", "--port"])("parseUiArgs rejects a missing value for %s", (flag) => {
  expect(() => parseUiArgs([flag])).toThrow(/requires a value/);
  expect(() => parseUiArgs([flag, "--db", "/x.db"])).toThrow(/requires a value/);
});

test.each(["abc", " ", "1.5", "-1", "65536", "Infinity"])(
  "parseUiArgs rejects invalid port %s",
  (port) => {
    expect(() => parseUiArgs(["--port", port])).toThrow(/port/);
  },
);

test("parseUiArgs accepts the valid port boundaries", () => {
  expect(parseUiArgs(["--port", "0"])).toEqual({ port: 0 });
  expect(parseUiArgs(["--port", "65535"])).toEqual({ port: 65535 });
});

test("parseUiArgs rejects unknown flags and positional arguments", () => {
  expect(() => parseUiArgs(["--nope"])).toThrow(/nope/);
  expect(() => parseUiArgs(["unexpected"])).toThrow(/unexpected/);
});

test("runUi returns 1 without creating a missing index database", async () => {
  const path = join(temporaryDirectory("acplane-ui-missing-"), "index.db");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(await runUi({ db: path })).toBe(1);
  expect(existsSync(path)).toBe(false);
  expect(error).toHaveBeenCalledWith(expect.stringMatching(/no index found.*acplane index/i));
  expect(createUiServer).not.toHaveBeenCalled();
  expect(openReadonlyDb).not.toHaveBeenCalled();
});

test("openReadonlyDb reads an existing database and rejects writes", () => {
  const path = join(temporaryDirectory("acplane-ui-readonly-"), "index.db");
  openDb(path).close();

  const db = openReadonlyDb(path);
  expect(db.prepare("SELECT COUNT(*) AS n FROM session").get()).toEqual({ n: 0 });
  expect(() => db.exec("CREATE TABLE x (a)")).toThrow();
  db.close();
});

test("openReadonlyDb rejects a missing path without creating a file", () => {
  const path = join(temporaryDirectory("acplane-ui-readonly-missing-"), "index.db");

  expect(() => openReadonlyDb(path)).toThrow();
  expect(existsSync(path)).toBe(false);
});

test("runUi uses defaults, reports the bound port, and resolves when the server closes", async () => {
  const path = join(temporaryDirectory("acplane-ui-run-"), "index.db");
  openDb(path).close();
  const server = new FakeUiServer();
  const db = { close: vi.fn() } as unknown as Db;
  fakes.server = server as unknown as Server;
  fakes.readonlyDb = db;
  const signals = captureShutdownSignals();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  const completed = runUi({ db: path });
  await vi.waitFor(() => expect(server.listenCalls).toEqual([{ port: 4319, host: "127.0.0.1" }]));
  await vi.waitFor(() =>
    expect(error).toHaveBeenCalledWith(
      "acplane: dashboard on http://127.0.0.1:44000 (Ctrl+C to stop)",
    ),
  );
  expect(signals.active).toEqual(new Set(["SIGINT", "SIGTERM"]));

  server.emit("close");

  await expect(completed).resolves.toBe(0);
  expect(db.close).toHaveBeenCalledTimes(1);
  expect(signals.active.size).toBe(0);
});

test("overlapping shutdown signals cannot close the server or database twice", async () => {
  const path = join(temporaryDirectory("acplane-ui-signals-"), "index.db");
  openDb(path).close();
  const server = new FakeUiServer();
  const db = { close: vi.fn() } as unknown as Db;
  fakes.server = server as unknown as Server;
  fakes.readonlyDb = db;
  const signals = captureShutdownSignals();
  vi.spyOn(console, "error").mockImplementation(() => {});

  const completed = runUi({ db: path, port: 5000, host: "0.0.0.0" });
  await vi.waitFor(() => expect(signals.callbacks.SIGINT).toBeTypeOf("function"));
  signals.callbacks.SIGINT?.();
  signals.callbacks.SIGTERM?.();
  signals.callbacks.SIGINT?.();

  expect(server.closeCalls).toBe(1);
  server.emit("close");
  server.emit("close");

  await expect(completed).resolves.toBe(0);
  expect(db.close).toHaveBeenCalledTimes(1);
  expect(signals.active.size).toBe(0);
});

test("runUi closes the database and removes listeners when listen fails", async () => {
  const path = join(temporaryDirectory("acplane-ui-listen-error-"), "index.db");
  openDb(path).close();
  const server = new FakeUiServer();
  server.listenError = new Error("bind failed");
  const db = { close: vi.fn() } as unknown as Db;
  fakes.server = server as unknown as Server;
  fakes.readonlyDb = db;
  const signals = captureShutdownSignals();

  await expect(runUi({ db: path })).rejects.toThrow("bind failed");
  expect(db.close).toHaveBeenCalledTimes(1);
  expect(server.listenerCount("error")).toBe(0);
  expect(server.listenerCount("close")).toBe(0);
  expect(signals.active.size).toBe(0);
});

test("main dispatches the ui subcommand through its parser", async () => {
  const path = join(temporaryDirectory("acplane-ui-main-"), "missing.db");
  vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(main(["ui", "--db", path])).resolves.toBe(1);
  await expect(main(["ui", "unexpected"])).rejects.toThrow(/unexpected/);
});
