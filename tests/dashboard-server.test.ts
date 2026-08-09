import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createUiServer } from "../src/dashboard/server.js";
import { openDb, type Db } from "../src/db/schema.js";
import { seedTwoSessions } from "./dashboard/seed.js";

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  const dispose = close;
  close = null;
  await dispose?.();
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function serve(): Promise<{ base: string; db: Db }> {
  const db = openDb(":memory:");
  seedTwoSessions(db);
  const server = createUiServer({ db });

  try {
    const base = await listen(server);
    close = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      } finally {
        if (db.open) db.close();
      }
    };
    return { base, db };
  } catch (error) {
    db.close();
    throw error;
  }
}

test("GET /api/sessions returns the summaries", async () => {
  const { base } = await serve();
  const response = await fetch(`${base}/api/sessions`);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  const body = (await response.json()) as Array<{ id: string }>;
  expect(body.map((session) => session.id)).toEqual(["sess-claude", "sess-codex"]);
});

test("GET /api/sessions/:id returns detail and URL-decodes the id", async () => {
  const { base, db } = await serve();
  db.prepare("INSERT INTO session (id, harness) VALUES (?, ?)").run("sess/encoded", "test");

  const response = await fetch(`${base}/api/sessions/sess%2Fencoded`);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ session: { id: "sess/encoded" } });
});

test("GET /api/sessions/:id returns a JSON 404 for an unknown session", async () => {
  const { base } = await serve();
  const response = await fetch(`${base}/api/sessions/ghost`);

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(await response.json()).toEqual({ error: "session not found" });
});

test("GET /api/lineage returns file lineage", async () => {
  const { base } = await serve();
  const response = await fetch(`${base}/api/lineage`);

  expect(response.status).toBe(200);
  const body = (await response.json()) as Array<{ path: string }>;
  expect(body[0]?.path).toBe("src/app.ts");
});

test("GET /api/compare returns the requested session comparison", async () => {
  const { base } = await serve();
  const response = await fetch(`${base}/api/compare?a=sess-claude&b=sess-codex`);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    a: { session: { id: "sess-claude" } },
    b: { session: { id: "sess-codex" } },
  });
});

test.each([
  "/api/compare",
  "/api/compare?a=sess-claude",
  "/api/compare?b=sess-codex",
  "/api/compare?a=&b=sess-codex",
  "/api/compare?a=sess-claude&b=",
])("GET %s returns JSON 400 when either comparison parameter is missing", async (path) => {
  const { base } = await serve();
  const response = await fetch(`${base}${path}`);

  expect(response.status).toBe(400);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(await response.json()).toEqual({ error: "compare requires a and b query params" });
});

test.each(["/", "/index.html"])("GET %s serves the dashboard HTML", async (path) => {
  const { base } = await serve();
  const response = await fetch(`${base}${path}`);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(await response.text()).toBe(
    '<!doctype html><title>acplane</title><div id="app"></div>',
  );
});

test("unknown routes return a JSON 404", async () => {
  const { base } = await serve();
  const response = await fetch(`${base}/nope`);

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(await response.json()).toEqual({ error: "not found" });
});

test("non-GET requests return a JSON 405", async () => {
  const { base } = await serve();
  const response = await fetch(`${base}/api/sessions`, { method: "POST" });

  expect(response.status).toBe(405);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(await response.json()).toEqual({ error: "method not allowed" });
});

test("query exceptions return a JSON 500", async () => {
  const { base, db } = await serve();
  db.close();

  const response = await fetch(`${base}/api/sessions`);

  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(await response.json()).toEqual({ error: "The database connection is not open" });
});
