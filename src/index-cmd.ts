import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { detectStyle } from "./brand/ansi.js";
import { getVersion, printBanner } from "./brand/banner.js";
import { createSpinner } from "./brand/spinner.js";
import { openDb } from "./db/schema.js";
import { writeNormalized } from "./db/write.js";
import { readSessionEvents } from "./normalize/events.js";
import { normalizeSession } from "./normalize/normalize.js";

export interface IndexArgs {
  db?: string;
  files: string[];
  humanOutput?: NodeJS.WritableStream & { isTTY?: boolean };
  sessionsDir?: string;
}

export function parseIndexArgs(argv: string[]): IndexArgs {
  const result: IndexArgs = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--db" && argv[index + 1]) result.db = argv[++index]!;
    else if (argument === "--sessions" && argv[index + 1]) {
      result.sessionsDir = argv[++index]!;
    } else if (argument.startsWith("--")) {
      throw new Error(`acplane index: unknown argument "${argument}"`);
    } else result.files.push(argument);
  }
  return result;
}

function harnessFromSessionId(id: string): string {
  return id.match(/-([^-]+)-[0-9a-f]{4}$/)?.[1] ?? "unknown";
}

export async function runIndex(args: IndexArgs): Promise<number> {
  const sessionsDir = args.sessionsDir ?? join(homedir(), ".acplane", "sessions");
  const dbPath = args.db ?? join(homedir(), ".acplane", "index.db");
  const humanOutput = args.humanOutput ?? process.stderr;
  let files = args.files;

  if (files.length === 0) {
    if (!existsSync(sessionsDir)) {
      humanOutput.write(`acplane: no sessions directory at ${sessionsDir}\n`);
      return 0;
    }
    files = readdirSync(sessionsDir)
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => join(sessionsDir, file));
  }

  const style = detectStyle(humanOutput);
  if (style.tty) await printBanner(humanOutput, style, `v${getVersion()}`);
  const spinner = createSpinner(humanOutput, style, "Indexing sessions");

  let db: ReturnType<typeof openDb> | undefined;
  let turns = 0;
  let tools = 0;
  try {
    db = openDb(dbPath);
    for (const file of files) {
      const id = basename(file, ".jsonl");
      const normalized = normalizeSession(id, harnessFromSessionId(id), readSessionEvents(file));
      writeNormalized(db, normalized);
      turns += normalized.turns.length;
      tools += normalized.toolCalls.length;
      spinner.setLabel(`Indexing ${basename(file)}`);
    }
    db.close();
    db = undefined;
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch {
        // Preserve the primary operation error if cleanup also fails.
      }
    }
    if (style.tty) spinner.fail("acplane: failed to index sessions");
    throw error;
  }

  if (style.tty && files.length === 0) {
    spinner.fail("acplane: nothing to index");
  } else {
    spinner.succeed(
      `acplane: indexed ${files.length} session(s), ${turns} turn(s), ${tools} tool call(s) into ${dbPath}`,
    );
  }
  return 0;
}
