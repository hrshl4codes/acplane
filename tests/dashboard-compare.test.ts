import { expect, test } from "vitest";
import { openDb } from "../src/db/schema.js";
import { compareSessions } from "../src/dashboard/queries.js";
import { seedTwoSessions } from "./dashboard/seed.js";

test("compareSessions returns both details", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const comparison = compareSessions(db, "sess-claude", "sess-codex");
  expect(comparison.a?.session.id).toBe("sess-claude");
  expect(comparison.b?.session.id).toBe("sess-codex");
  db.close();
});

test("compareSessions leaves a side null when a session is missing", () => {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const comparison = compareSessions(db, "sess-claude", "ghost");
  expect(comparison.a?.session.id).toBe("sess-claude");
  expect(comparison.b).toBeNull();
  db.close();
});
