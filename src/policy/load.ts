import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_RULESET, parseRuleset, type PolicyRuleset } from "./rules.js";

function isMissingFile(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function readRuleset(path: string): PolicyRuleset {
  return parseRuleset(readFileSync(path, "utf8"));
}

function readRequiredRuleset(path: string): PolicyRuleset {
  try {
    return readRuleset(path);
  } catch (error) {
    if (isMissingFile(error)) throw new Error(`policy: file not found: ${path}`);
    throw error;
  }
}

export function loadRuleset(explicitPath?: string, configPath?: string): PolicyRuleset {
  if (explicitPath) return readRequiredRuleset(explicitPath);
  if (configPath) return readRequiredRuleset(configPath);

  const candidates = [
    "./acplane.policy.yaml",
    join(homedir(), ".acplane", "policy.yaml"),
  ];

  for (const candidate of candidates) {
    try {
      return readRuleset(candidate);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  return DEFAULT_RULESET;
}
