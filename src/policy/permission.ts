import type { PermissionSubject } from "./rules.js";

export function permissionSubject(params: Record<string, any>): PermissionSubject {
  const toolCall = (params?.toolCall ?? {}) as Record<string, any>;
  const kind = typeof toolCall.kind === "string" ? toolCall.kind : "other";

  const paths: string[] = [];
  if (Array.isArray(toolCall.locations)) {
    for (const location of toolCall.locations) {
      if (location?.path) paths.push(String(location.path));
    }
  }
  const rawInput = (toolCall.rawInput ?? {}) as Record<string, any>;
  if (typeof rawInput.path === "string") paths.push(rawInput.path);

  let command: string | null = null;
  if (typeof rawInput.command === "string") command = rawInput.command;
  else if (Array.isArray(rawInput.command)) command = rawInput.command.map(String).join(" ");
  else if (kind === "execute" && typeof toolCall.title === "string") command = toolCall.title;

  return { kind, paths: [...new Set(paths)], command };
}

export function selectOption(options: unknown, decision: "allow" | "deny"): string | null {
  if (!Array.isArray(options)) return null;
  const family = decision === "allow" ? "allow" : "reject";
  for (const option of options) {
    const kind = String((option as Record<string, any>)?.kind ?? "");
    const optionId = (option as Record<string, any>)?.optionId;
    if (kind.startsWith(`${family}_`) && typeof optionId === "string") return optionId;
  }
  return null;
}

function annotation(rule: string | null): Record<string, unknown> {
  return rule ? { decidedBy: "policy", rule } : { decidedBy: "policy" };
}

export function buildSelectedResponse(id: unknown, optionId: string, rule: string | null): object {
  return {
    jsonrpc: "2.0",
    id,
    result: { outcome: { outcome: "selected", optionId }, _meta: { acplane: annotation(rule) } },
  };
}

export function buildCancelledResponse(id: unknown, rule: string | null): object {
  return {
    jsonrpc: "2.0",
    id,
    result: { outcome: { outcome: "cancelled" }, _meta: { acplane: annotation(rule) } },
  };
}
