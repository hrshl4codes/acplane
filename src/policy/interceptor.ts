import { buildCancelledResponse, buildSelectedResponse, permissionSubject, selectOption } from "./permission.js";
import { evaluatePolicy, type PolicyRuleset } from "./rules.js";

export function createPermissionInterceptor(ruleset: PolicyRuleset): (message: unknown) => object | null {
  return (message) => {
    const record = message as Record<string, any> | null;
    if (!record || record["method"] !== "session/request_permission" || record["id"] === undefined) {
      return null;
    }

    const params = (record["params"] ?? {}) as Record<string, any>;
    const { decision, rule } = evaluatePolicy(ruleset, permissionSubject(params));
    if (decision === "escalate") return null;

    const optionId = selectOption(params["options"], decision);
    if (decision === "allow") {
      return optionId ? buildSelectedResponse(record["id"], optionId, rule) : null;
    }
    return optionId
      ? buildSelectedResponse(record["id"], optionId, rule)
      : buildCancelledResponse(record["id"], rule);
  };
}
