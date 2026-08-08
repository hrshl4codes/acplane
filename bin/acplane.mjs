#!/usr/bin/env node
import { parseArgs, runProxy } from "../dist/cli.js";

try {
  const args = parseArgs(process.argv.slice(2));
  process.exit(await runProxy(args));
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
