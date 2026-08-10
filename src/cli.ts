import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { detectStyle, dim } from "./brand/ansi.js";
import { getVersion, renderHelp } from "./brand/banner.js";
import { loadConfig } from "./config.js";
import { parseUiArgs, runUi } from "./dashboard-cmd.js";
import { parseIndexArgs, runIndex } from "./index-cmd.js";
import { createPermissionInterceptor } from "./policy/interceptor.js";
import { loadRuleset } from "./policy/load.js";
import { redactSecrets } from "./policy/redact.js";
import { JsonlRecorder } from "./recorder.js";
import { startPump } from "./pump.js";

export interface CliArgs {
  harness?: string;
  config?: string;
  policy?: string;
}

function optionValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`acplane: ${argv[index]} requires a value`);
  }
  return value;
}

export function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--harness") {
      result.harness = optionValue(argv, index);
      index += 1;
    } else if (argument === "--config") {
      result.config = optionValue(argv, index);
      index += 1;
    } else if (argument === "--policy") {
      result.policy = optionValue(argv, index);
      index += 1;
    } else {
      throw new Error(
        `acplane: unknown argument "${argument}" (usage: acplane [--harness <name>] [--config <path>] [--policy <path>])`,
      );
    }
  }

  return result;
}

export interface RunProxyOptions extends CliArgs {
  sessionsDir?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  humanOutput?: NodeJS.WritableStream & { isTTY?: boolean };
}

export async function runProxy(options: RunProxyOptions): Promise<number> {
  const config = loadConfig(options.config);
  const harnessName = options.harness ?? config.defaultHarness;
  const harness = config.harnesses[harnessName];
  if (!harness) throw new Error(`acplane: harness "${harnessName}" not found in config`);

  const humanOutput = options.humanOutput ?? process.stderr;
  const style = detectStyle(humanOutput);
  if (style.tty) {
    humanOutput.write(dim(`acplane v${getVersion()} · proxying ${harnessName}`, style) + "\n");
  }

  const ruleset = loadRuleset(options.policy, config.policy);
  const interceptor = createPermissionInterceptor(ruleset);

  const sessionsDirectory = options.sessionsDir ?? join(homedir(), ".acplane", "sessions");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionId = `${timestamp}-${harnessName}-${randomBytes(2).toString("hex")}`;
  const recorder = new JsonlRecorder(join(sessionsDirectory, `${sessionId}.jsonl`), redactSecrets);

  const { exited } = startPump({
    command: harness.command,
    args: harness.args,
    env: harness.env,
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
    interceptHarnessRequest: interceptor,
    taps: {
      onClientMessage: (_message, raw) => recorder.record("client->harness", raw),
      onHarnessMessage: (_message, raw) => recorder.record("harness->client", raw),
    },
  });

  return exited;
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write(`acplane ${getVersion()}\n`);
    return 0;
  }
  if (argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(renderHelp(detectStyle(process.stdout)) + "\n");
    return 0;
  }
  if (argv[0] === "index") return runIndex(parseIndexArgs(argv.slice(1)));
  if (argv[0] === "ui") return runUi(parseUiArgs(argv.slice(1)));
  return runProxy(parseArgs(argv));
}
