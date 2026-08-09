import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test } from "vitest";
import { runProxy } from "../src/cli.js";
import { openDb } from "../src/db/schema.js";
import { runIndex } from "../src/index-cmd.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("records a rich session through the proxy and indexes it into SQLite", async () => {
  const directory = mkdtempSync(join(tmpdir(), "acplane-pipeline-"));
  temporaryDirectories.push(directory);

  const richHarness = join(import.meta.dirname, "fixtures", "rich-harness.mjs");
  const policyPath = join(directory, "policy.yaml");
  writeFileSync(policyPath, "default: escalate\nrules: []\n");
  const configPath = join(directory, "acplane.yaml");
  writeFileSync(
    configPath,
    `defaultHarness: rich\nharnesses:\n  rich:\n    command: ${process.execPath}\n    args: ["${richHarness}"]\n`,
  );

  const input = new PassThrough();
  const output = new PassThrough();
  output.on("data", () => {});
  const sessionsDir = join(directory, "sessions");

  const exited = runProxy({ config: configPath, policy: policyPath, sessionsDir, input, output });
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/tmp"}}\n');
  input.write(
    '{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"rich-session","prompt":[{"type":"text","text":"bump the constant"}]}}\n',
  );
  input.write('{"jsonrpc":"2.0","id":4,"method":"shutdown"}\n');
  expect(await exited).toBe(0);

  const sessionFiles = readdirSync(sessionsDir);
  expect(sessionFiles).toHaveLength(1);
  const sessionFile = join(sessionsDir, sessionFiles[0]!);

  const dbPath = join(directory, "index.db");
  expect(await runIndex({ db: dbPath, files: [sessionFile] })).toBe(0);

  const db = openDb(dbPath);
  try {
    const sessionCount = db.prepare("SELECT COUNT(*) AS count FROM session").get() as {
      count: number;
    };
    expect(sessionCount.count).toBe(1);

    const toolCount = db.prepare("SELECT COUNT(*) AS count FROM tool_call").get() as {
      count: number;
    };
    expect(toolCount.count).toBe(2);

    const modes = (
      db.prepare("SELECT mode FROM file_touch ORDER BY mode").all() as Array<{ mode: string }>
    ).map((row) => row.mode);
    expect(modes).toEqual(["read", "write"]);

    const usage = db.prepare("SELECT source, tokens_in FROM usage_sample").get() as {
      source: string;
      tokens_in: number;
    };
    expect(usage).toEqual({ source: "reported", tokens_in: 1500 });
  } finally {
    db.close();
  }
});
