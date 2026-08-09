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
