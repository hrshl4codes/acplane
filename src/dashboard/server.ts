import { createServer, type Server, type ServerResponse } from "node:http";
import type { Db } from "../db/schema.js";
import { DASHBOARD_HTML } from "./page.js";
import {
  compareSessions,
  fileLineage,
  sessionDetail,
  sessionSummaries,
} from "./queries.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function createUiServer(options: { db: Db }): Server {
  const { db } = options;

  return createServer((req, res) => {
    try {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }

      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;

      if (path === "/" || path === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DASHBOARD_HTML);
        return;
      }

      if (path === "/api/sessions") {
        sendJson(res, 200, sessionSummaries(db));
        return;
      }

      const detailMatch = path.match(/^\/api\/sessions\/(.+)$/);
      if (detailMatch) {
        const detail = sessionDetail(db, decodeURIComponent(detailMatch[1]!));
        sendJson(res, detail ? 200 : 404, detail ?? { error: "session not found" });
        return;
      }

      if (path === "/api/lineage") {
        sendJson(res, 200, fileLineage(db));
        return;
      }

      if (path === "/api/compare") {
        const a = url.searchParams.get("a");
        const b = url.searchParams.get("b");
        if (!a || !b) {
          sendJson(res, 400, { error: "compare requires a and b query params" });
          return;
        }
        sendJson(res, 200, compareSessions(db, a, b));
        return;
      }

      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      sendJson(res, 500, {
        error: String(error instanceof Error ? error.message : error),
      });
    }
  });
}
