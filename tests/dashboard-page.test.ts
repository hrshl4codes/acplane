import { expect, test } from "vitest";
import { DASHBOARD_HTML } from "../src/dashboard/page.js";

test("page is a self-contained document with the app mount and no external assets", () => {
  expect(DASHBOARD_HTML).toContain("<!doctype html>");
  expect(DASHBOARD_HTML).toContain('<main id="app">Loading…</main>');
  expect(DASHBOARD_HTML).not.toMatch(/<(?:script|img)[^>]+src\s*=\s*["']https?:/i);
  expect(DASHBOARD_HTML).not.toMatch(/<link[^>]+href\s*=\s*["']https?:/i);
  expect(DASHBOARD_HTML).not.toMatch(/@import\s+(?:url\()?\s*["']?https?:/i);
});

test("page implements exactly the four approved hash route families", () => {
  expect(DASHBOARD_HTML).toContain('data-route="#/"');
  expect(DASHBOARD_HTML).toContain('data-route="#/lineage"');
  expect(DASHBOARD_HTML).toContain('data-route="#/compare"');
  expect(DASHBOARD_HTML).toContain('path.startsWith("/session/")');
  expect(DASHBOARD_HTML).not.toContain('data-route="#/session/"');
  expect(DASHBOARD_HTML).not.toMatch(/data-route="#\/(?:search|settings|filters)/);
});

test("page calls every dashboard endpoint", () => {
  expect(DASHBOARD_HTML).toContain('j("/api/sessions")');
  expect(DASHBOARD_HTML).toContain('j("/api/sessions/" + encodeURIComponent(id))');
  expect(DASHBOARD_HTML).toContain('j("/api/lineage")');
  expect(DASHBOARD_HTML).toContain(
    'j("/api/compare?a=" + encodeURIComponent(a) + "&b=" + encodeURIComponent(b))',
  );
});

test("page escapes indexed strings including both quote styles before HTML insertion", () => {
  expect(DASHBOARD_HTML).toContain('/[&<>"\']/g');
  expect(DASHBOARD_HTML).toContain('"\\\"":"&quot;"');
  expect(DASHBOARD_HTML).toContain('"\'":"&#39;"');
  expect(DASHBOARD_HTML).toContain('esc(s.id)');
  expect(DASHBOARD_HTML).toContain('esc(s.harness)');
  expect(DASHBOARD_HTML).toContain('esc(t.prompt)');
  expect(DASHBOARD_HTML).toContain('esc(f.path)');
  expect(DASHBOARD_HTML).toContain('esc(p.rule)');
  expect(DASHBOARD_HTML).toContain('esc(err)');
});

test("page preserves active navigation and usage provenance contracts", () => {
  expect(DASHBOARD_HTML).toContain("function currentTab(hash)");
  expect(DASHBOARD_HTML).toContain('a.classList.toggle("active"');
  expect(DASHBOARD_HTML).toContain('src === "estimated" || src === "mixed"');
  expect(DASHBOARD_HTML).toContain('estMark(s.usageSource)');
  expect(DASHBOARD_HTML).toContain('estMark(t.usageSource)');
});

test("page renders permission decisions and governing rules distinctly", () => {
  expect(DASHBOARD_HTML).toContain('p.decision === "deny" ? "deny" : "allow"');
  expect(DASHBOARD_HTML).toContain('esc(p.rule)');
  expect(DASHBOARD_HTML).toMatch(/\.deny\s*\{[^}]*var\(--deny\)/);
  expect(DASHBOARD_HTML).toMatch(/\.allow\s*\{[^}]*var\(--allow\)/);
});

test("page contains local table scrolling and a stacked mobile comparison", () => {
  expect(DASHBOARD_HTML).toContain('class="table-wrap"');
  expect(DASHBOARD_HTML).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  expect(DASHBOARD_HTML).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.cols\s*\{[^}]*grid-template-columns:\s*1fr/);
  expect(DASHBOARD_HTML).toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/);
  expect(DASHBOARD_HTML).toMatch(/:focus-visible/);
});
