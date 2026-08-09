import type { Db } from "../db/schema.js";

export interface SessionSummary {
  id: string;
  harness: string;
  startedAt: string | null;
  endedAt: string | null;
  turnCount: number;
  toolCallCount: number;
  fileCount: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  permissionCount: number;
  denialCount: number;
  policyDecisionCount: number;
  usageSource: "reported" | "estimated" | "mixed" | "none";
}

export function usageSourceLabel(reported: number, estimated: number): SessionSummary["usageSource"] {
  if (reported > 0 && estimated > 0) return "mixed";
  if (reported > 0) return "reported";
  if (estimated > 0) return "estimated";
  return "none";
}

export function sessionSummaries(db: Db): SessionSummary[] {
  const rows = db
    .prepare(
      `SELECT
        s.id AS id,
        s.harness AS harness,
        s.started_at AS startedAt,
        s.ended_at AS endedAt,
        (SELECT COUNT(*) FROM turn t WHERE t.session_id = s.id) AS turnCount,
        (SELECT COUNT(*) FROM tool_call c WHERE c.session_id = s.id) AS toolCallCount,
        (SELECT COUNT(DISTINCT f.path) FROM file_touch f WHERE f.session_id = s.id) AS fileCount,
        (SELECT COALESCE(SUM(u.tokens_in), 0) FROM usage_sample u WHERE u.session_id = s.id) AS tokensIn,
        (SELECT COALESCE(SUM(u.tokens_out), 0) FROM usage_sample u WHERE u.session_id = s.id) AS tokensOut,
        (SELECT SUM(u.cost_usd) FROM usage_sample u WHERE u.session_id = s.id) AS costUsd,
        (SELECT COUNT(*) FROM permission_event p WHERE p.session_id = s.id) AS permissionCount,
        (SELECT COUNT(*) FROM permission_event p WHERE p.session_id = s.id AND p.decision = 'deny') AS denialCount,
        (SELECT COUNT(*) FROM permission_event p WHERE p.session_id = s.id AND p.decided_by = 'policy') AS policyDecisionCount,
        (SELECT COUNT(*) FROM usage_sample u WHERE u.session_id = s.id AND u.source = 'reported') AS reportedSamples,
        (SELECT COUNT(*) FROM usage_sample u WHERE u.session_id = s.id AND u.source = 'estimated') AS estimatedSamples
      FROM session s
      ORDER BY s.started_at DESC, s.id ASC`,
    )
    .all() as Array<Omit<SessionSummary, "usageSource"> & { reportedSamples: number; estimatedSamples: number }>;

  return rows.map(({ reportedSamples, estimatedSamples, ...summary }) => ({
    ...summary,
    usageSource: usageSourceLabel(reportedSamples, estimatedSamples),
  }));
}

export interface TimelineTurn {
  seq: number;
  prompt: string;
  finalMessage: string;
  stopReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  usageSource: string | null;
  toolCalls: Array<{ toolCallId: string; kind: string; title: string | null; status: string | null }>;
  fileTouches: Array<{ path: string; mode: string }>;
  permissions: Array<{ toolCallId: string | null; decision: string | null; decidedBy: string | null; rule: string | null }>;
}

export interface SessionDetail {
  session: SessionSummary;
  turns: TimelineTurn[];
}

export function sessionDetail(db: Db, id: string): SessionDetail | null {
  const session = sessionSummaries(db).find((summary) => summary.id === id);
  if (!session) return null;

  const turnRows = db
    .prepare(`SELECT id, seq, prompt, final_message AS finalMessage, stop_reason AS stopReason, started_at AS startedAt, ended_at AS endedAt FROM turn WHERE session_id = ? ORDER BY seq`)
    .all(id) as Array<{ id: number; seq: number; prompt: string; finalMessage: string; stopReason: string | null; startedAt: string | null; endedAt: string | null }>;
  const toolCalls = db
    .prepare(`SELECT turn_id AS turnId, tool_call_id AS toolCallId, kind, title, status FROM tool_call WHERE session_id = ? ORDER BY id`)
    .all(id) as Array<{ turnId: number | null; toolCallId: string; kind: string; title: string | null; status: string | null }>;
  const fileTouches = db
    .prepare(`SELECT turn_id AS turnId, path, mode FROM file_touch WHERE session_id = ? ORDER BY id`)
    .all(id) as Array<{ turnId: number | null; path: string; mode: string }>;
  const permissions = db
    .prepare(`SELECT turn_id AS turnId, tool_call_id AS toolCallId, decision, decided_by AS decidedBy, rule FROM permission_event WHERE session_id = ? ORDER BY id`)
    .all(id) as Array<{ turnId: number | null; toolCallId: string | null; decision: string | null; decidedBy: string | null; rule: string | null }>;
  const usage = db
    .prepare(`SELECT turn_id AS turnId, tokens_in AS tokensIn, tokens_out AS tokensOut, cost_usd AS costUsd, source FROM usage_sample WHERE session_id = ?`)
    .all(id) as Array<{ turnId: number | null; tokensIn: number | null; tokensOut: number | null; costUsd: number | null; source: string }>;

  const turns: TimelineTurn[] = turnRows.map((turn) => {
    const turnUsage = usage.filter((entry) => entry.turnId === turn.id);
    const hasTokensIn = turnUsage.some((entry) => entry.tokensIn != null);
    const hasTokensOut = turnUsage.some((entry) => entry.tokensOut != null);
    const hasCost = turnUsage.some((entry) => entry.costUsd != null);
    const reportedCount = turnUsage.filter((entry) => entry.source === "reported").length;
    const estimatedCount = turnUsage.filter((entry) => entry.source === "estimated").length;
    return {
      seq: turn.seq,
      prompt: turn.prompt,
      finalMessage: turn.finalMessage,
      stopReason: turn.stopReason,
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
      tokensIn: hasTokensIn ? turnUsage.reduce((sum, entry) => sum + (entry.tokensIn ?? 0), 0) : null,
      tokensOut: hasTokensOut ? turnUsage.reduce((sum, entry) => sum + (entry.tokensOut ?? 0), 0) : null,
      costUsd: hasCost ? turnUsage.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0) : null,
      usageSource: turnUsage.length ? usageSourceLabel(reportedCount, estimatedCount) : null,
      toolCalls: toolCalls.filter((call) => call.turnId === turn.id).map(({ toolCallId, kind, title, status }) => ({ toolCallId, kind, title, status })),
      fileTouches: fileTouches.filter((touch) => touch.turnId === turn.id).map(({ path, mode }) => ({ path, mode })),
      permissions: permissions.filter((permission) => permission.turnId === turn.id).map(({ toolCallId, decision, decidedBy, rule }) => ({ toolCallId, decision, decidedBy, rule })),
    };
  });

  return { session, turns };
}

export interface FileLineageEntry {
  path: string;
  readCount: number;
  writeCount: number;
  sessions: Array<{ sessionId: string; harness: string; modes: string[] }>;
}

export function fileLineage(db: Db): FileLineageEntry[] {
  const rows = db
    .prepare(
      `SELECT f.path AS path, f.mode AS mode, f.session_id AS sessionId, s.harness AS harness
       FROM file_touch f
       JOIN session s ON s.id = f.session_id`,
    )
    .all() as Array<{ path: string; mode: string; sessionId: string; harness: string }>;
  const byPath = new Map<
    string,
    {
      entry: FileLineageEntry;
      sessions: Map<string, { sessionId: string; harness: string; modes: Set<string> }>;
    }
  >();

  for (const row of rows) {
    let lineage = byPath.get(row.path);
    if (!lineage) {
      lineage = {
        entry: { path: row.path, readCount: 0, writeCount: 0, sessions: [] },
        sessions: new Map(),
      };
      byPath.set(row.path, lineage);
    }

    if (row.mode === "read") lineage.entry.readCount += 1;
    if (row.mode === "write" || row.mode === "create" || row.mode === "delete") {
      lineage.entry.writeCount += 1;
    }

    let session = lineage.sessions.get(row.sessionId);
    if (!session) {
      session = { sessionId: row.sessionId, harness: row.harness, modes: new Set() };
      lineage.sessions.set(row.sessionId, session);
    }
    session.modes.add(row.mode);
  }

  return [...byPath.values()]
    .map(({ entry, sessions }) => ({
      ...entry,
      sessions: [...sessions.values()]
        .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
        .map(({ sessionId, harness, modes }) => ({
          sessionId,
          harness,
          modes: [...modes].sort((a, b) => a.localeCompare(b)),
        })),
    }))
    .sort(
      (a, b) =>
        b.readCount + b.writeCount - (a.readCount + a.writeCount) ||
        a.path.localeCompare(b.path),
    );
}
