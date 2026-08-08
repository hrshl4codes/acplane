import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

export interface HarnessConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface AcplaneConfig {
  defaultHarness: string;
  harnesses: Record<string, HarnessConfig>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseConfig(yamlText: string): AcplaneConfig {
  let document: unknown;
  try {
    document = parse(yamlText);
  } catch (error) {
    throw new Error(`config: invalid YAML: ${String(error)}`);
  }

  if (!isRecord(document)) throw new Error("config: empty or invalid YAML");

  const defaultHarness = document["defaultHarness"];
  if (typeof defaultHarness !== "string" || defaultHarness.length === 0) {
    throw new Error("config: defaultHarness is required");
  }

  const rawHarnesses = document["harnesses"];
  if (!isRecord(rawHarnesses)) throw new Error("config: harnesses map is required");

  const harnesses: Record<string, HarnessConfig> = {};
  for (const [name, value] of Object.entries(rawHarnesses)) {
    if (!isRecord(value) || typeof value["command"] !== "string" || value["command"] === "") {
      throw new Error(`config: harness "${name}" is missing command`);
    }

    const args = value["args"] ?? [];
    if (!Array.isArray(args) || !args.every((argument) => typeof argument === "string")) {
      throw new Error(`config: harness "${name}" args must be a string array`);
    }

    const harness: HarnessConfig = { command: value["command"], args };
    const environment = value["env"];
    if (environment !== undefined) {
      if (!isRecord(environment) || !Object.values(environment).every((entry) => typeof entry === "string")) {
        throw new Error(`config: harness "${name}" env must be a string map`);
      }
      harness.env = environment as Record<string, string>;
    }
    harnesses[name] = harness;
  }

  if (!harnesses[defaultHarness]) {
    throw new Error(`config: defaultHarness "${defaultHarness}" is not defined in harnesses`);
  }

  return { defaultHarness, harnesses };
}

export function loadConfig(explicitPath?: string): AcplaneConfig {
  const candidates = explicitPath
    ? [explicitPath]
    : ["./acplane.yaml", join(homedir(), ".acplane", "config.yaml")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return parseConfig(readFileSync(candidate, "utf8"));
  }

  throw new Error(`config: no config file found (looked at: ${candidates.join(", ")})`);
}
