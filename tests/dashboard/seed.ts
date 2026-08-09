import { writeNormalized } from "../../src/db/write.js";
import type { Db } from "../../src/db/schema.js";
import type { NormalizedSession } from "../../src/normalize/normalize.js";

const CLAUDE: NormalizedSession = {
  session: { id: "sess-claude", harness: "claude", acpSessionId: "acp-c", protocolVersion: 1, cwd: "/w", startedAt: "2026-08-10T10:00:00.000Z", endedAt: "2026-08-10T10:01:00.000Z", stopReason: "end_turn" },
  turns: [{ seq: 1, prompt: "add validation", finalMessage: "done", stopReason: "end_turn", startedAt: "2026-08-10T10:00:00.000Z", endedAt: "2026-08-10T10:01:00.000Z" }],
  toolCalls: [
    { turnSeq: 1, toolCallId: "c-read", kind: "read", title: "Read src/app.ts", status: "completed", rawInput: null, rawOutput: null },
    { turnSeq: 1, toolCallId: "c-edit", kind: "edit", title: "Edit src/app.ts", status: "completed", rawInput: null, rawOutput: null },
  ],
  fileTouches: [
    { turnSeq: 1, toolCallId: "c-read", path: "src/app.ts", mode: "read", diff: null },
    { turnSeq: 1, toolCallId: "c-edit", path: "src/app.ts", mode: "write", diff: '{"oldText":"a","newText":"b"}' },
  ],
  usage: [{ turnSeq: 1, tokensIn: 1500, tokensOut: 420, costUsd: 0.03, source: "reported" }],
  permissions: [{ turnSeq: 1, toolCallId: "c-edit", requested: '{"toolCall":{"kind":"edit"}}', decision: "deny", decidedBy: "policy", rule: "protect-secrets" }],
};

const CODEX: NormalizedSession = {
  session: { id: "sess-codex", harness: "codex", acpSessionId: "acp-x", protocolVersion: 1, cwd: "/w", startedAt: "2026-08-10T09:00:00.000Z", endedAt: "2026-08-10T09:00:30.000Z", stopReason: "end_turn" },
  turns: [{ seq: 1, prompt: "refactor", finalMessage: "ok", stopReason: "end_turn", startedAt: "2026-08-10T09:00:00.000Z", endedAt: "2026-08-10T09:00:30.000Z" }],
  toolCalls: [{ turnSeq: 1, toolCallId: "x-read", kind: "read", title: "Read src/app.ts", status: "completed", rawInput: null, rawOutput: null }],
  fileTouches: [{ turnSeq: 1, toolCallId: "x-read", path: "src/app.ts", mode: "read", diff: null }],
  usage: [{ turnSeq: 1, tokensIn: 10, tokensOut: 5, costUsd: null, source: "estimated" }],
  permissions: [],
};

export function seedTwoSessions(db: Db): void {
  writeNormalized(db, CLAUDE);
  writeNormalized(db, CODEX);
}
