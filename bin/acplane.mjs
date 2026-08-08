#!/usr/bin/env node
import { main } from "../dist/cli.js";

try {
  process.exit(await main(process.argv.slice(2)));
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
