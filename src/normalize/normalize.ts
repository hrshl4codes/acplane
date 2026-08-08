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

export interface NormalizedSession {
  session: SessionRow;
  turns: TurnRow[];
  toolCalls: ToolCallRow[];
  fileTouches: FileTouchRow[];
  usage: UsageRow[];
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

export function normalizeSession(
  id: string,
  harness: string,
  events: RecordedEvent[],
): NormalizedSession {
  const spans = extractTurns(events);
  const session = extractSession(id, harness, events, spans);
  const turns = spans.map(toTurnRow);

  return { session, turns, toolCalls: [], fileTouches: [], usage: [] };
}
