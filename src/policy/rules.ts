import { parse } from "yaml";
import { matchesAnyGlob } from "./glob.js";

export type PolicyDecision = "allow" | "deny" | "escalate";

export interface PolicyMatch {
  kind?: string[];
  path?: string[];
  command?: string[];
}

export interface PolicyRule {
  name: string;
  match: PolicyMatch;
  decision: PolicyDecision;
  reason?: string;
}

export interface PolicyRuleset {
  rules: PolicyRule[];
  default: PolicyDecision;
}

export interface PermissionSubject {
  kind: string;
  paths: string[];
  command: string | null;
}

const DECISIONS: ReadonlySet<string> = new Set(["allow", "deny", "escalate"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown, context: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`policy: ${context} must be a string array`);
  }
  return value;
}

function parseDecision(value: unknown, context: string): PolicyDecision {
  if (typeof value !== "string" || !DECISIONS.has(value)) {
    throw new Error(`policy: ${context} decision must be one of allow, deny, escalate`);
  }
  return value as PolicyDecision;
}

export function parseRuleset(yamlText: string): PolicyRuleset {
  let document: unknown;
  try {
    document = parse(yamlText);
  } catch (error) {
    throw new Error(`policy: invalid YAML: ${String(error)}`);
  }
  if (!isRecord(document)) throw new Error("policy: empty or invalid YAML");

  const defaultDecision = parseDecision(document["default"] ?? "escalate", "default");

  const rawRules = document["rules"] ?? [];
  if (!Array.isArray(rawRules)) throw new Error("policy: rules must be a list");

  const rules: PolicyRule[] = rawRules.map((raw, index) => {
    if (!isRecord(raw) || typeof raw["name"] !== "string") {
      throw new Error(`policy: rule #${index + 1} needs a name`);
    }
    const rawMatch = raw["match"];
    if (rawMatch !== undefined && !isRecord(rawMatch)) {
      throw new Error(`policy: rule "${raw["name"]}" match must be a mapping`);
    }
    const match = rawMatch ?? {};
    const rule: PolicyRule = {
      name: raw["name"],
      decision: parseDecision(raw["decision"], `rule "${raw["name"]}"`),
      match: {
        kind: asStringArray(match["kind"], `rule "${raw["name"]}" match.kind`),
        path: asStringArray(match["path"], `rule "${raw["name"]}" match.path`),
        command: asStringArray(match["command"], `rule "${raw["name"]}" match.command`),
      },
    };
    if (typeof raw["reason"] === "string") rule.reason = raw["reason"];
    return rule;
  });

  return { rules, default: defaultDecision };
}

function ruleMatches(rule: PolicyRule, subject: PermissionSubject): boolean {
  const { match } = rule;
  const hasKind = Boolean(match.kind?.length);
  const hasPath = Boolean(match.path?.length);
  const hasCommand = Boolean(match.command?.length);
  if (!hasKind && !hasPath && !hasCommand) return false;

  if (hasKind && !match.kind!.includes(subject.kind)) return false;
  if (hasPath) {
    if (subject.paths.length === 0) return false;
    const pathMatches = (path: string) => matchesAnyGlob(path.replaceAll("\\", "/"), match.path!, "path");
    const matchesPaths = rule.decision === "allow" ? subject.paths.every(pathMatches) : subject.paths.some(pathMatches);
    if (!matchesPaths) return false;
  }
  if (hasCommand) {
    if (!subject.command) return false;
    if (!matchesAnyGlob(subject.command, match.command!, "command")) return false;
  }
  return true;
}

export function evaluatePolicy(
  ruleset: PolicyRuleset,
  subject: PermissionSubject,
): { decision: PolicyDecision; rule: string | null } {
  for (const rule of ruleset.rules) {
    if (ruleMatches(rule, subject)) return { decision: rule.decision, rule: rule.name };
  }
  return { decision: ruleset.default, rule: null };
}

export const DEFAULT_RULESET: PolicyRuleset = {
  rules: [
    {
      name: "protect-secrets",
      match: { kind: ["edit", "delete", "move"], path: ["**/.env*", "**/*.pem", "**/*.key", "**/id_rsa*"] },
      decision: "deny",
      reason: "Agents may not modify secrets or private keys",
    },
    {
      name: "protect-git-internals",
      match: { kind: ["edit", "delete", "move"], path: ["**/.git", "**/.git/**"] },
      decision: "deny",
      reason: "Agents may not modify git internals or hooks",
    },
    {
      name: "protect-ci",
      match: { kind: ["edit", "delete", "move"], path: ["**/.github/workflows/**"] },
      decision: "deny",
      reason: "Agents may not modify CI workflows",
    },
    {
      name: "quarantine-pipe-to-shell",
      match: { kind: ["execute"], command: ["*curl*|*sh*", "*curl*|*bash*", "*wget*|*sh*", "*wget*|*bash*"] },
      decision: "escalate",
      reason: "Piping a network download into a shell needs human review",
    },
  ],
  default: "escalate",
};
