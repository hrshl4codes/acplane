import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, test, vi } from "vitest";
import { runIndex } from "../src/index-cmd.js";

let directory: string | undefined;

function createHumanOutput(isTTY: boolean): {
  humanOutput: NodeJS.WritableStream & { isTTY: boolean };
  writes: string[];
} {
  const writes: string[] = [];
  const humanOutput = {
    isTTY,
    write: (chunk: string) => (writes.push(chunk), true),
  } as NodeJS.WritableStream & { isTTY: boolean };
  return { humanOutput, writes };
}

function writeSessionFile(parent: string): string {
  const file = join(parent, "2026-08-10T00-00-00-000Z-codex-ab12.jsonl");
  const lines = [
    {
      ts: "t0",
      direction: "client->harness",
      raw: '{"jsonrpc":"2.0","id":1,"method":"session/prompt","params":{"sessionId":"s","prompt":[{"type":"text","text":"hi"}]}}',
    },
    {
      ts: "t1",
      direction: "harness->client",
      raw: '{"jsonrpc":"2.0","id":1,"result":{"stopReason":"end_turn"}}',
    },
  ];
  writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

test("TTY index output reveals the banner and finishes the spinner", async () => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const file = writeSessionFile(directory);
  const { humanOutput, writes } = createHumanOutput(true);

  const result = runIndex({
    db: join(directory, "index.db"),
    files: [file],
    humanOutput,
  });
  await vi.runAllTimersAsync();

  await expect(result).resolves.toBe(0);
  const text = writes.join("");
  expect(text).toContain("__ _  ___ _ __");
  expect(text).toMatch(/v\d+\.\d+\.\d+/);
  expect(text).toContain("✓ acplane: indexed 1 session(s), 1 turn(s), 0 tool call(s)");
  expect(text).toContain("\r\x1b[2K");
  expect(vi.getTimerCount()).toBe(0);
});

test("non-TTY index output is exactly the legacy summary line", async () => {
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const file = writeSessionFile(directory);
  const { humanOutput, writes } = createHumanOutput(false);
  const dbPath = join(directory, "index.db");

  await expect(runIndex({ db: dbPath, files: [file], humanOutput })).resolves.toBe(0);
  expect(writes.join("")).toBe(
    `acplane: indexed 1 session(s), 1 turn(s), 0 tool call(s) into ${dbPath}\n`,
  );
});

test("missing sessions directory keeps its exact output on the selected human stream", async () => {
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const sessionsDir = join(directory, "missing-sessions");
  const { humanOutput, writes } = createHumanOutput(false);

  await expect(runIndex({ files: [], sessionsDir, humanOutput })).resolves.toBe(0);
  expect(writes.join("")).toBe(`acplane: no sessions directory at ${sessionsDir}\n`);
});

test("TTY empty sessions directory finishes with nothing to index", async () => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const { humanOutput, writes } = createHumanOutput(true);

  const result = runIndex({
    db: join(directory, "index.db"),
    files: [],
    sessionsDir: directory,
    humanOutput,
  });
  await vi.runAllTimersAsync();

  await expect(result).resolves.toBe(0);
  expect(writes.join("")).toContain("✗ acplane: nothing to index");
  expect(writes.join("")).not.toContain("indexed 0 session(s)");
  expect(vi.getTimerCount()).toBe(0);
});

test("non-TTY empty sessions directory keeps the legacy zero summary", async () => {
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const { humanOutput, writes } = createHumanOutput(false);
  const dbPath = join(directory, "index.db");

  await expect(
    runIndex({ db: dbPath, files: [], sessionsDir: directory, humanOutput }),
  ).resolves.toBe(0);
  expect(writes.join("")).toBe(
    `acplane: indexed 0 session(s), 0 turn(s), 0 tool call(s) into ${dbPath}\n`,
  );
});

test("TTY indexing failure closes the database and spinner without masking the error", async () => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const missingFile = join(directory, "missing-codex-ab12.jsonl");
  const dbPath = join(directory, "index.db");
  const { humanOutput, writes } = createHumanOutput(true);

  const result = runIndex({ db: dbPath, files: [missingFile], humanOutput });
  const rejection = expect(result).rejects.toMatchObject({ code: "ENOENT", path: missingFile });
  await vi.advanceTimersByTimeAsync(480);
  await rejection;

  expect(writes.join("")).toContain("✗ acplane: failed to index sessions");
  expect(vi.getTimerCount()).toBe(0);
  expect(existsSync(`${dbPath}-wal`)).toBe(false);
  expect(existsSync(`${dbPath}-shm`)).toBe(false);
});

test("TTY database open failure terminates the spinner and preserves the SQLite error", async () => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const file = writeSessionFile(directory);
  const dbPath = join(directory, "missing-parent", "index.db");
  const { humanOutput, writes } = createHumanOutput(true);

  const result = runIndex({ db: dbPath, files: [file], humanOutput });
  const rejection = expect(result).rejects.toMatchObject({
    name: "TypeError",
    message: "Cannot open database because the directory does not exist",
  });
  await vi.advanceTimersByTimeAsync(480);
  await rejection;

  expect(writes.join("")).toContain("✗ acplane: failed to index sessions");
  expect(vi.getTimerCount()).toBe(0);
});

test("TTY database close failure terminates the spinner without masking the close error", async () => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), "acplane-index-brand-"));
  const file = writeSessionFile(directory);
  const { humanOutput, writes } = createHumanOutput(true);
  const closeError = new Error("injected database close failure");
  const realClose = Database.prototype.close;
  vi.spyOn(Database.prototype, "close").mockImplementation(function (this: Database.Database) {
    realClose.call(this);
    throw closeError;
  });

  const result = runIndex({ db: join(directory, "index.db"), files: [file], humanOutput });
  const rejection = expect(result).rejects.toBe(closeError);
  await vi.advanceTimersByTimeAsync(480);
  await rejection;

  expect(writes.join("")).toContain("✗ acplane: failed to index sessions");
  expect(vi.getTimerCount()).toBe(0);
});
