import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";
import { parseIndexArgs, runIndex } from "../src/index-cmd.js";

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

test("parseIndexArgs reads database, sessions directory, and file paths", () => {
  expect(parseIndexArgs(["--db", "/x.db", "--sessions", "/s", "a.jsonl"])).toEqual({
    db: "/x.db",
    sessionsDir: "/s",
    files: ["a.jsonl"],
  });
  expect(() => parseIndexArgs(["--nope"])).toThrow(/nope/);
});

test("runIndex normalizes a session file into SQLite", async () => {
  directory = mkdtempSync(join(tmpdir(), "acplane-index-"));
  const file = join(directory, "2026-08-08T00-00-00-000Z-codex-ab12.jsonl");
  const lines = [
    { ts: "t0", direction: "client->harness", raw: '{"jsonrpc":"2.0","id":1,"method":"session/prompt","params":{"sessionId":"s","prompt":[{"type":"text","text":"hi"}]}}' },
    { ts: "t1", direction: "harness->client", raw: '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s","update":{"sessionUpdate":"tool_call","toolCallId":"tc","kind":"read","status":"completed","locations":[{"path":"a.ts"}]}}}' },
    { ts: "t2", direction: "harness->client", raw: '{"jsonrpc":"2.0","id":1,"result":{"stopReason":"end_turn"}}' },
  ];
  writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);

  const dbPath = join(directory, "index.db");
  expect(await runIndex({ db: dbPath, files: [file] })).toBe(0);

  const db = openDb(dbPath);
  expect(db.prepare("SELECT id, harness FROM session").get()).toEqual({
    id: "2026-08-08T00-00-00-000Z-codex-ab12",
    harness: "codex",
  });
  expect(db.prepare("SELECT path, mode FROM file_touch").all()).toEqual([
    { path: "a.ts", mode: "read" },
  ]);
  db.close();
});
