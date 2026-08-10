import { readFileSync } from "node:fs";
import { dim, type Style } from "./ansi.js";
import { renderLogo, revealLogo } from "./logo.js";

let cachedVersion: string | null = null;

export function getVersion(): string {
  if (cachedVersion) return cachedVersion;
  const pkgUrl = new URL("../../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { version?: string };
  cachedVersion = pkg.version ?? "0.0.0";
  return cachedVersion;
}

export function printBanner(
  stream: NodeJS.WritableStream & { isTTY?: boolean },
  style: Style,
  subtitle?: string,
): Promise<void> {
  return revealLogo(stream, style, subtitle);
}

export const HELP_TEXT = `acplane — a control plane for coding agents

Usage:
  acplane [--harness <name>] [--config <path>] [--policy <path>]   Proxy (default): record + govern a session
  acplane index [--db <path>] [--sessions <dir>] [files...]        Normalize recorded sessions into SQLite
  acplane ui [--db <path>] [--port <n>] [--host <h>]               Serve the dashboard (default 127.0.0.1:4319)
  acplane --version                                                Print the version
  acplane --help                                                   Show this help
`;

export function renderHelp(style: Style): string {
  return renderLogo(style, `v${getVersion()}`) + "\n" + dim(HELP_TEXT, style);
}
