import type { NormalizedSession } from "../normalize/normalize.js";
import type { Db } from "./schema.js";

const CHILD_TABLES = ["usage_sample", "file_touch", "tool_call", "turn", "permission_event"];

export function writeNormalized(db: Db, normalized: NormalizedSession): void {
  db.transaction(() => {
    for (const table of CHILD_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(normalized.session.id);
    }
    db.prepare("DELETE FROM session WHERE id = ?").run(normalized.session.id);
    db.prepare(`INSERT INTO session (id, harness, acp_session_id, protocol_version, cwd, started_at, ended_at, stop_reason)
      VALUES (@id, @harness, @acpSessionId, @protocolVersion, @cwd, @startedAt, @endedAt, @stopReason)`).run(normalized.session);

    const turnIds = new Map<number, number>();
    const insertTurn = db.prepare(`INSERT INTO turn (session_id, seq, prompt, final_message, stop_reason, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const turn of normalized.turns) {
      const info = insertTurn.run(normalized.session.id, turn.seq, turn.prompt, turn.finalMessage, turn.stopReason, turn.startedAt, turn.endedAt);
      turnIds.set(turn.seq, Number(info.lastInsertRowid));
    }
    const resolve = (seq: number | null): number | null => seq === null ? null : turnIds.get(seq) ?? null;

    const insertTool = db.prepare(`INSERT INTO tool_call (session_id, turn_id, tool_call_id, kind, title, status, raw_input, raw_output)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const call of normalized.toolCalls) insertTool.run(normalized.session.id, resolve(call.turnSeq), call.toolCallId, call.kind, call.title, call.status, call.rawInput, call.rawOutput);

    const insertTouch = db.prepare("INSERT INTO file_touch (session_id, turn_id, tool_call_id, path, mode, diff) VALUES (?, ?, ?, ?, ?, ?)");
    for (const touch of normalized.fileTouches) insertTouch.run(normalized.session.id, resolve(touch.turnSeq), touch.toolCallId, touch.path, touch.mode, touch.diff);

    const insertUsage = db.prepare("INSERT INTO usage_sample (session_id, turn_id, tokens_in, tokens_out, cost_usd, source) VALUES (?, ?, ?, ?, ?, ?)");
    for (const usage of normalized.usage) insertUsage.run(normalized.session.id, resolve(usage.turnSeq), usage.tokensIn, usage.tokensOut, usage.costUsd, usage.source);
  })();
}
