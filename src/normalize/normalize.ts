import type { RecordedEvent } from "./events.js";

export interface SessionRow {
  id: string;
  harness: string;
  acpSessionId: string | null;
  protocolVersion: number | null;
  cwd: string | null;
  startedAt: string | null;
  endedAt: string | null;
  stopReason: string | null;
}

export interface TurnRow {
  seq: number;
  prompt: string;
  finalMessage: string;
  stopReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ToolCallRow {
  turnSeq: number | null;
  toolCallId: string;
  kind: string;
  title: string | null;
  status: string | null;
  rawInput: string | null;
  rawOutput: string | null;
}

export interface FileTouchRow {
  turnSeq: number | null;
  toolCallId: string;
  path: string;
  mode: "read" | "write" | "create" | "delete";
  diff: string | null;
}

export interface UsageRow {
  turnSeq: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  source: "reported" | "estimated";
}

export interface PermissionRow {
  turnSeq: number | null;
  toolCallId: string | null;
  requested: string;
  decision: string | null;
  decidedBy: string | null;
  rule: string | null;
}

export interface NormalizedSession {
  session: SessionRow;
  turns: TurnRow[];
  toolCalls: ToolCallRow[];
  fileTouches: FileTouchRow[];
  usage: UsageRow[];
  permissions: PermissionRow[];
}

export interface TurnSpan extends TurnRow {
  startIndex: number;
  endIndex: number;
  promptId: unknown;
}

function extractPromptText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return "";

  return prompt
    .filter(
      (block) =>
        block && typeof block === "object" && (block as { type?: unknown }).type === "text",
    )
    .map((block) => String((block as { text?: unknown }).text ?? ""))
    .join("");
}

export function extractTurns(events: RecordedEvent[]): TurnSpan[] {
  const turns: TurnSpan[] = [];
  let current: TurnSpan | null = null;
  let pendingId: unknown = null;

  events.forEach((event, index) => {
    const message = event.msg as Record<string, any> | null;
    if (!message) return;

    if (
      event.direction === "client->harness" &&
      message["method"] === "session/prompt"
    ) {
      current = {
        seq: turns.length + 1,
        prompt: extractPromptText(message["params"]?.prompt),
        finalMessage: "",
        stopReason: null,
        startedAt: event.ts,
        endedAt: null,
        startIndex: index,
        endIndex: index,
        promptId: message["id"],
      };
      pendingId = message["id"];
      turns.push(current);
    } else if (
      current &&
      event.direction === "harness->client" &&
      message["id"] !== undefined &&
      message["id"] === pendingId &&
      message["result"]
    ) {
      current.stopReason = message["result"].stopReason ?? null;
      current.endedAt = event.ts;
      current.endIndex = index;
      current = null;
      pendingId = null;
    } else if (
      current &&
      message["method"] === "session/update" &&
      message["params"]?.update?.sessionUpdate === "agent_message_chunk"
    ) {
      const text = message["params"].update.content?.text;
      if (typeof text === "string") current.finalMessage += text;
      current.endIndex = index;
    }
  });

  return turns;
}

export function turnSeqForIndex(turns: TurnSpan[], index: number): number | null {
  for (const turn of turns) {
    if (index >= turn.startIndex && index <= turn.endIndex) return turn.seq;
  }
  return null;
}

interface ToolAccum {
  turnSeq: number | null;
  toolCallId: string;
  kind?: string;
  title?: string | null;
  status?: string | null;
  rawInput?: unknown;
  rawOutput?: unknown;
  locations: string[];
  diffs: Array<{ path?: string; oldText?: string; newText?: string }>;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

export function extractToolCalls(
  events: RecordedEvent[],
  turns: TurnSpan[],
): { toolCalls: ToolCallRow[]; fileTouches: FileTouchRow[] } {
  const order: string[] = [];
  const accumulators = new Map<string, ToolAccum>();

  events.forEach((event, index) => {
    const message = event.msg as Record<string, any> | null;
    const update = message?.["params"]?.update;
    if (message?.["method"] !== "session/update" || !update) return;
    if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
      return;
    }
    if (typeof update.toolCallId !== "string") return;

    let accumulator = accumulators.get(update.toolCallId);
    if (!accumulator) {
      accumulator = {
        turnSeq: turnSeqForIndex(turns, index),
        toolCallId: update.toolCallId,
        locations: [],
        diffs: [],
      };
      accumulators.set(update.toolCallId, accumulator);
      order.push(update.toolCallId);
    }

    if (update.kind !== undefined) accumulator.kind = update.kind;
    if (update.title !== undefined) accumulator.title = update.title;
    if (update.status !== undefined) accumulator.status = update.status;
    if (update.rawInput !== undefined) accumulator.rawInput = update.rawInput;
    if (update.rawOutput !== undefined) accumulator.rawOutput = update.rawOutput;
    if (Array.isArray(update.locations)) {
      for (const location of update.locations) {
        if (location?.path) accumulator.locations.push(String(location.path));
      }
    }
    if (Array.isArray(update.content)) {
      for (const content of update.content) {
        if (content?.type === "diff") {
          const diff = {
            path: content.path,
            oldText: content.oldText,
            newText: content.newText,
          };
          const alreadyRecorded = accumulator.diffs.some(
            (existing) =>
              existing.path === diff.path &&
              existing.oldText === diff.oldText &&
              existing.newText === diff.newText,
          );
          if (!alreadyRecorded) accumulator.diffs.push(diff);
        }
      }
    }
  });

  const toolCalls: ToolCallRow[] = [];
  const fileTouches: FileTouchRow[] = [];

  for (const id of order) {
    const accumulator = accumulators.get(id)!;
    const kind = accumulator.kind ?? "other";
    toolCalls.push({
      turnSeq: accumulator.turnSeq,
      toolCallId: id,
      kind,
      title: accumulator.title ?? null,
      status: accumulator.status ?? null,
      rawInput:
        accumulator.rawInput !== undefined ? JSON.stringify(accumulator.rawInput) : null,
      rawOutput:
        accumulator.rawOutput !== undefined ? JSON.stringify(accumulator.rawOutput) : null,
    });

    if (kind === "read") {
      for (const path of dedupe(accumulator.locations)) {
        fileTouches.push({
          turnSeq: accumulator.turnSeq,
          toolCallId: id,
          path,
          mode: "read",
          diff: null,
        });
      }
    } else if (kind === "edit") {
      if (accumulator.diffs.length > 0) {
        for (const diff of accumulator.diffs) {
          fileTouches.push({
            turnSeq: accumulator.turnSeq,
            toolCallId: id,
            path: diff.path ?? accumulator.locations[0] ?? "",
            mode: diff.oldText === "" ? "create" : "write",
            diff: JSON.stringify({
              oldText: diff.oldText ?? "",
              newText: diff.newText ?? "",
            }),
          });
        }
      } else {
        for (const path of dedupe(accumulator.locations)) {
          fileTouches.push({
            turnSeq: accumulator.turnSeq,
            toolCallId: id,
            path,
            mode: "write",
            diff: null,
          });
        }
      }
    } else if (kind === "delete") {
      for (const path of dedupe(accumulator.locations)) {
        fileTouches.push({
          turnSeq: accumulator.turnSeq,
          toolCallId: id,
          path,
          mode: "delete",
          diff: null,
        });
      }
    }
  }

  return { toolCalls, fileTouches };
}

function extractSession(
  id: string,
  harness: string,
  events: RecordedEvent[],
  turns: TurnSpan[],
): SessionRow {
  let acpSessionId: string | null = null;
  let protocolVersion: number | null = null;
  let cwd: string | null = null;

  for (const event of events) {
    const message = event.msg as Record<string, any> | null;
    if (!message) continue;

    if (
      protocolVersion === null &&
      typeof message["result"]?.protocolVersion === "number"
    ) {
      protocolVersion = message["result"].protocolVersion;
    }
    if (!acpSessionId && typeof message["result"]?.sessionId === "string") {
      acpSessionId = message["result"].sessionId;
    }
    if (
      !cwd &&
      message["method"] === "session/new" &&
      typeof message["params"]?.cwd === "string"
    ) {
      cwd = message["params"].cwd;
    }
    if (!acpSessionId && typeof message["params"]?.sessionId === "string") {
      acpSessionId = message["params"].sessionId;
    }
  }

  return {
    id,
    harness,
    acpSessionId,
    protocolVersion,
    cwd,
    startedAt: events[0]?.ts ?? null,
    endedAt: events[events.length - 1]?.ts ?? null,
    stopReason: turns.length > 0 ? turns[turns.length - 1]!.stopReason : null,
  };
}

function toTurnRow(span: TurnSpan): TurnRow {
  return {
    seq: span.seq,
    prompt: span.prompt,
    finalMessage: span.finalMessage,
    stopReason: span.stopReason,
    startedAt: span.startedAt,
    endedAt: span.endedAt,
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function extractUsage(events: RecordedEvent[], turns: TurnSpan[]): UsageRow[] {
  return turns.map((turn) => {
    const response = events.find((event) => {
      const message = event.msg as Record<string, any> | null;
      return (
        event.direction === "harness->client" &&
        message !== null &&
        message["id"] === turn.promptId &&
        Boolean(message["result"])
      );
    });
    const result = (response?.msg as Record<string, any> | undefined)?.["result"];
    const usage = result?.usage ?? result?._meta?.usage;
    const tokensIn = usage?.inputTokens ?? usage?.input_tokens;
    const tokensOut = usage?.outputTokens ?? usage?.output_tokens;
    if (usage && (typeof tokensIn === "number" || typeof tokensOut === "number")) {
      return {
        turnSeq: turn.seq,
        tokensIn: typeof tokensIn === "number" ? tokensIn : null,
        tokensOut: typeof tokensOut === "number" ? tokensOut : null,
        costUsd: typeof usage.costUsd === "number" ? usage.costUsd : null,
        source: "reported" as const,
      };
    }
    return {
      turnSeq: turn.seq,
      tokensIn: estimateTokens(turn.prompt),
      tokensOut: estimateTokens(turn.finalMessage),
      costUsd: null,
      source: "estimated" as const,
    };
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function extractPermissions(
  events: RecordedEvent[],
  turns: TurnSpan[],
): PermissionRow[] {
  const permissions: PermissionRow[] = [];

  events.forEach((event, requestIndex) => {
    if (!isRecord(event.msg)) return;
    const message = event.msg;
    if (
      event.direction !== "harness->client" ||
      message["method"] !== "session/request_permission" ||
      message["id"] === undefined
    ) {
      return;
    }

    const params = message["params"] ?? {};
    const paramsRecord = isRecord(params) ? params : null;
    const toolCall = isRecord(paramsRecord?.["toolCall"])
      ? paramsRecord["toolCall"]
      : null;
    const toolCallId =
      typeof toolCall?.["toolCallId"] === "string" ? toolCall["toolCallId"] : null;
    const options = Array.isArray(paramsRecord?.["options"])
      ? paramsRecord["options"]
      : [];

    const response = events.slice(requestIndex + 1).find((candidate) => {
      if (candidate.direction !== "client->harness" || !isRecord(candidate.msg)) {
        return false;
      }
      return (
        candidate.msg["id"] === message["id"] &&
        Object.prototype.hasOwnProperty.call(candidate.msg, "result")
      );
    });
    const responseMessage = response && isRecord(response.msg) ? response.msg : null;
    const result = isRecord(responseMessage?.["result"])
      ? responseMessage["result"]
      : null;
    const outcome = isRecord(result?.["outcome"]) ? result["outcome"] : null;

    let decision: string | null = null;
    if (outcome?.["outcome"] === "cancelled") {
      decision = "cancelled";
    } else if (
      outcome?.["outcome"] === "selected" &&
      typeof outcome["optionId"] === "string"
    ) {
      const chosen = options.find(
        (option) => isRecord(option) && option["optionId"] === outcome["optionId"],
      );
      const kind = isRecord(chosen) ? chosen["kind"] : null;
      if (typeof kind === "string" && kind.startsWith("allow_")) {
        decision = "allow";
      } else if (typeof kind === "string" && kind.startsWith("reject_")) {
        decision = "deny";
      }
    }

    const metadata = isRecord(result?.["_meta"]) ? result["_meta"] : null;
    const acplane = isRecord(metadata?.["acplane"]) ? metadata["acplane"] : null;
    const decidedBy = response
      ? acplane?.["decidedBy"] === "policy"
        ? "policy"
        : "human"
      : null;
    const rule = typeof acplane?.["rule"] === "string" ? acplane["rule"] : null;

    permissions.push({
      turnSeq: turnSeqForIndex(turns, requestIndex),
      toolCallId,
      requested: JSON.stringify(params),
      decision,
      decidedBy,
      rule,
    });
  });

  return permissions;
}

export function normalizeSession(
  id: string,
  harness: string,
  events: RecordedEvent[],
): NormalizedSession {
  const spans = extractTurns(events);
  const session = extractSession(id, harness, events, spans);
  const turns = spans.map(toTurnRow);
  const { toolCalls, fileTouches } = extractToolCalls(events, spans);
  const usage = extractUsage(events, spans);
  const permissions = extractPermissions(events, spans);

  return { session, turns, toolCalls, fileTouches, usage, permissions };
}
