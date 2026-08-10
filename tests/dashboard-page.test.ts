import { createContext, runInContext, Script, type Context } from "node:vm";
import { expect, test } from "vitest";
import { DASHBOARD_HTML } from "../src/dashboard/page.js";

type FetchHandler = (url: string) => unknown | Promise<unknown>;

interface PendingRequest {
  url: string;
  resolve: (body: unknown) => void;
  reject: (error: unknown) => void;
}

function extractScript(): string {
  const source = DASHBOARD_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!source) throw new Error("dashboard inline script not found");
  return source.replace(/\nroute\(\);\s*$/, "");
}

function extractStylesheet(): string {
  const source = DASHBOARD_HTML.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!source) throw new Error("dashboard inline stylesheet not found");
  return source;
}

function mockElement(attributes: Record<string, string> = {}) {
  const classes = new Set<string>();
  return {
    innerHTML: "",
    value: "",
    disabled: false,
    focusCount: 0,
    onclick: null as null | ((event: unknown) => void),
    onchange: null as null | (() => void),
    onkeydown: null as null | ((event: unknown) => void),
    dataset: {} as Record<string, string>,
    classList: {
      toggle(name: string, force: boolean) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
    setAttribute(name: string, value: string) {
      attributes[name] = value;
    },
    removeAttribute(name: string) {
      delete attributes[name];
    },
    querySelectorAll() {
      return [];
    },
    querySelector(): unknown {
      return null;
    },
    focus() {
      this.focusCount += 1;
    },
  };
}

function createPageHarness(handler?: FetchHandler) {
  const app = mockElement();
  const heading = mockElement();
  app.querySelector = () => heading;
  const controls = { ca: mockElement(), cb: mockElement() };
  const links = ["#/", "#/lineage", "#/compare"].map((route) =>
    mockElement({ "data-route": route }),
  );
  const location = { hash: "#/" };
  const calls: string[] = [];
  const pending: PendingRequest[] = [];

  const response = (body: unknown) => ({ ok: true, json: async () => body });
  const fetch = (url: string) => {
    calls.push(url);
    if (handler) return Promise.resolve().then(() => handler(url)).then(response);
    return new Promise<ReturnType<typeof response>>((resolve, reject) => {
      pending.push({
        url,
        resolve: (body) => resolve(response(body)),
        reject,
      });
    });
  };

  const context = createContext({
    AbortController,
    URLSearchParams,
    addEventListener() {},
    clearTimeout,
    console,
    decodeURIComponent,
    document: {
      getElementById(id: string) {
        if (id === "app") return app;
        if (id === "ca" || id === "cb") return controls[id];
        return null;
      },
      querySelectorAll(selector: string) {
        return selector === "header a" ? links : [];
      },
    },
    encodeURIComponent,
    fetch,
    location,
    setTimeout,
  });
  new Script(extractScript()).runInContext(context);

  return {
    app,
    calls,
    controls,
    evaluate<T>(source: string): T {
      return runInContext(source, context as Context) as T;
    },
    pending,
    route(hash: string): Promise<void> {
      location.hash = hash;
      return runInContext("route()", context as Context) as Promise<void>;
    },
  };
}

function turn(overrides: Record<string, unknown> = {}) {
  return {
    seq: 1,
    prompt: "prompt",
    toolCalls: [],
    fileTouches: [],
    permissions: [],
    usageSource: "reported",
    tokensIn: 1,
    tokensOut: 2,
    costUsd: 0,
    ...overrides,
  };
}

function detail(id: string, turns: unknown[] = []) {
  return { session: { id, harness: `harness-${id}` }, turns };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: "session",
    startedAt: "2026-08-10T10:00:00.000Z",
    harness: "codex",
    turnCount: 1,
    toolCallCount: 2,
    fileCount: 3,
    tokensIn: 100,
    tokensOut: 50,
    usageSource: "reported",
    costUsd: 0.01,
    denialCount: 0,
    ...overrides,
  };
}

test("page is a self-contained document with the app mount and no external assets", () => {
  expect(DASHBOARD_HTML).toContain("<!doctype html>");
  expect(DASHBOARD_HTML).toContain('<main id="app"><p class="muted" role="status">Loading…</p></main>');
  expect(DASHBOARD_HTML).not.toMatch(/<(?:script|img)[^>]+src\s*=\s*["']https?:/i);
  expect(DASHBOARD_HTML).not.toMatch(/<link[^>]+href\s*=\s*["']https?:/i);
  expect(DASHBOARD_HTML).not.toMatch(/@import\s+(?:url\()?\s*["']?https?:/i);
});

test("stylesheet declares the complete locked token system without legacy colors", () => {
  const stylesheet = extractStylesheet();
  const requiredRoles = [
    "paper", "paper-2", "ink", "muted", "line", "accent", "accent-ink", "focus",
    "ok", "deny", "warn", "accent-soft", "ok-soft", "deny-soft", "warn-soft",
    "font-ui", "font-mono", "text-xs", "text-sm", "text-md", "text-lg", "text-xl",
    "space-1", "space-2", "space-3", "space-4", "space-6", "space-8", "space-12",
    "radius", "radius-pill", "ease-out", "dur-fast", "dur", "dur-slow",
  ];

  for (const role of requiredRoles) expect(stylesheet).toContain(`--${role}:`);
  expect(stylesheet).toContain("oklch(");
  expect(stylesheet).not.toMatch(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/);
  expect(stylesheet).not.toMatch(/\b(?:rgba?|hsla?|color)\s*\(/i);
});

test("raw OKLCH colors stay inside token declaration blocks", () => {
  const rules = extractStylesheet().replace(/:root\s*\{[^}]*\}/g, "");
  expect(rules).not.toMatch(/\b(?:oklch|color-mix)\s*\(/i);
});

test("Hallmark stamp records the verified stat-led app audit without exceptions", () => {
  const stylesheet = extractStylesheet();

  expect(stylesheet).toContain("Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4");
  expect(stylesheet).toContain("macrostructure: Stat-Led app adaptation");
  expect(stylesheet).toContain("theme: custom cool sky-cyan instrumentation");
  expect(stylesheet).toContain("nav: preserved dashboard route bar/app nav");
  expect(stylesheet).toContain("hero/footer: none");
  expect(stylesheet).toContain("contrast: pass (40–41)");
  expect(stylesheet).toContain("slop: pass (1–58)");
  expect(stylesheet).toContain("honest: pass (46)");
  expect(stylesheet).toContain("chrome: pass (47)");
  expect(stylesheet).toContain("tokens: pass (48)");
  expect(stylesheet).toContain("icons: pass (30)");
  expect(stylesheet).toContain("gate 1: no display face/app UI");
  expect(stylesheet).toContain("gate 5: semantic open row, not a card");
  expect(stylesheet).toContain("n/a: hero/footer/enrichment gates");
  expect(stylesheet).not.toContain("exceptions:");
  expect(stylesheet).not.toMatch(/font-style:\s*italic/);
  expect(stylesheet).not.toMatch(/transition:\s*all/);
  expect(DASHBOARD_HTML).not.toMatch(/<(?:svg|canvas|footer)\b/i);
});

test("compare columns stay open around turn cards and each hover has one visual signal", () => {
  const stylesheet = extractStylesheet();
  const comparePanel = stylesheet.match(/\.compare-panel\s*\{([^}]*)\}/)?.[1];

  expect(comparePanel).toContain("min-width:0");
  expect(comparePanel).not.toMatch(/(?:border|background|border-radius|padding)\s*:/);
  expect(stylesheet).toMatch(
    /\.cols::before\s*\{[^}]*background:var\(--line\)[^}]*content:""/,
  );
  expect(stylesheet).toMatch(/\.session-row:hover\s*\{[^}]*transform:translateY\(-1px\)/);
  expect(stylesheet).not.toMatch(/\.session-row:hover td\s*\{/);
});

test("masthead uses the locked type scale without page-only tokens", () => {
  const stylesheet = extractStylesheet();
  expect(stylesheet).not.toContain("--text-wordmark:");
  expect(stylesheet).toMatch(/\.wordmark\s*\{[^}]*font-size:var\(--text-xl\)/);
});

test("small links use ink text with accent reserved for non-text cues", () => {
  const stylesheet = extractStylesheet();
  const withoutWordmark = stylesheet.replace(/\.wordmark\s*\{[^}]*\}/g, "");
  expect(withoutWordmark).not.toMatch(/(?:^|[;{]\s*)color:var\(--accent\)/m);
  expect(stylesheet).toMatch(/\.session-link\s*\{[^}]*color:var\(--ink\)/);
  expect(stylesheet).toMatch(/\.session-link\s*\{[^}]*text-decoration-color:var\(--accent\)/);
  expect(stylesheet).toMatch(/header a\.active::after\s*\{[^}]*background:var\(--accent\)/);
});

test("links and selects provide explicit tokenized interaction states", () => {
  const stylesheet = extractStylesheet();

  expect(stylesheet).toMatch(/header a\s*\{[^}]*line-height:1/);
  expect(stylesheet).toMatch(
    /header a:hover\s*\{[^}]*text-underline-offset:2px/,
  );
  expect(stylesheet).toMatch(
    /\.session-link\s*\{[^}]*text-underline-offset:2px/,
  );
  expect(stylesheet).toMatch(
    /\.session-link:hover\s*\{[^}]*color:var\(--ink\)[^}]*text-decoration-color:var\(--accent\)/,
  );
  expect(stylesheet).toMatch(
    /\.session-link:active\s*\{[^}]*color:var\(--ink\)[^}]*text-decoration-color:var\(--accent\)/,
  );
  expect(stylesheet).toMatch(
    /select\s*\{[^}]*outline:2px solid transparent[^}]*outline-offset:1px/,
  );
  expect(stylesheet).toMatch(
    /select:hover\s*\{[^}]*border-color:var\(--ink\)[^}]*background:var\(--paper-2\)/,
  );
  expect(stylesheet).toMatch(
    /select:active\s*\{[^}]*border-color:var\(--ink\)[^}]*background:var\(--paper-2\)/,
  );
  expect(stylesheet).toMatch(
    /select:focus-visible\s*\{[^}]*outline:2px solid var\(--focus\)[^}]*outline-offset:1px/,
  );
  expect(stylesheet).toMatch(
    /select:disabled\s*\{[^}]*cursor:not-allowed[^}]*opacity:\.55/,
  );
});

test("session data cells opt into mono tabular typography without styling every table cell", () => {
  const stylesheet = extractStylesheet();
  expect(stylesheet).not.toMatch(/\btd\s*\{[^}]*font-variant-numeric/);
  expect(stylesheet).toMatch(
    /\.session-data\s*\{[^}]*font-family:var\(--font-mono\)[^}]*font-variant-numeric:tabular-nums/,
  );
  expect(stylesheet).toMatch(
    /\.harness-chip\s*\{[^}]*border-color:var\(--accent\)[^}]*background:var\(--accent-soft\)/,
  );
});

test("select uses the contrast-safe locked boundary token", () => {
  expect(extractStylesheet()).toMatch(/select\s*\{[^}]*border:1px solid var\(--muted\)/);
});

test("page masthead identifies the product context and keeps dashboard navigation", () => {
  expect(DASHBOARD_HTML).toContain('<div class="masthead-brand">');
  expect(DASHBOARD_HTML).toContain('<strong class="wordmark">acplane</strong>');
  expect(DASHBOARD_HTML).toContain("Agent session observability");
  expect(DASHBOARD_HTML).toContain('<nav aria-label="Dashboard">');
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
  expect(DASHBOARD_HTML).toContain('j("/api/sessions", signal)');
  expect(DASHBOARD_HTML).toContain('j("/api/sessions/" + encodeURIComponent(id), signal)');
  expect(DASHBOARD_HTML).toContain('j("/api/lineage", signal)');
  expect(DASHBOARD_HTML).toContain(
    'j("/api/compare?a=" + encodeURIComponent(a) + "&b=" + encodeURIComponent(b), signal)',
  );
});

test("page escapes indexed strings including both quote styles before HTML insertion", () => {
  expect(DASHBOARD_HTML).toContain('/[&<>"\']/g');
  expect(DASHBOARD_HTML).toContain('"\\\"":"&quot;"');
  expect(DASHBOARD_HTML).toContain('"\'":"&#39;"');
  expect(DASHBOARD_HTML).toContain('esc("#/session/" + encodeURIComponent(s.id))');
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

test("permission rows use locked severity surfaces and readable metadata", () => {
  const stylesheet = extractStylesheet();

  expect(stylesheet).toMatch(
    /\.perm\s*\{[^}]*border-left:3px solid var\(--warn\)[^}]*background:var\(--warn-soft\)/,
  );
  expect(stylesheet).toMatch(
    /\.perm-deny\s*\{[^}]*border-left-color:var\(--deny\)[^}]*background:var\(--deny-soft\)/,
  );
  expect(stylesheet).toMatch(
    /\.perm-allow\s*\{[^}]*border-left-color:var\(--ok\)[^}]*background:var\(--ok-soft\)/,
  );
  expect(stylesheet).toMatch(
    /\.perm-warn\s*\{[^}]*border-left-color:var\(--warn\)[^}]*background:var\(--warn-soft\)/,
  );
  expect(stylesheet).toMatch(/\.perm-rule\s*\{[^}]*background:var\(--paper\)/);
  expect(stylesheet).toMatch(/\.perm-meta\s*\{[^}]*color:var\(--muted\)/);
  expect(stylesheet).toMatch(/\.perm-tool\s*\{[^}]*font-family:var\(--font-mono\)/);
});

test("motion is limited to the approved load, route, and row-hover primitives", () => {
  const stylesheet = extractStylesheet();

  expect(stylesheet).toMatch(
    /body\s*\{[^}]*animation:initial-load var\(--dur-slow\) var\(--ease-out\) both/,
  );
  expect(stylesheet).toMatch(
    /#app\s*>\s*\*\s*\{[^}]*animation:route-enter var\(--dur\) var\(--ease-out\) both/,
  );
  expect(stylesheet).toMatch(
    /\.session-row\s*\{[^}]*transition:transform var\(--dur-fast\) var\(--ease-out\)/,
  );
  expect(stylesheet).toMatch(
    /@media\s*\(hover:hover\)\s*and\s*\(pointer:fine\)[\s\S]*?\.session-row:hover\s*\{[^}]*transform:translateY\(-1px\)/,
  );
  expect(stylesheet.match(/@keyframes\s+/g)).toHaveLength(2);
  expect(stylesheet.match(/\banimation:/g)).toHaveLength(3);
  expect(stylesheet.match(/\btransition:/g)).toHaveLength(2);
  expect(stylesheet).not.toMatch(/\b(?:animation|transition):[^;]*(?:width|height|margin|padding|top|left|right|bottom)/);
  expect(stylesheet).not.toMatch(/\banimation:[^;]*(?:infinite|linear)/);
});

test("reduced motion removes the spatial hover and disables decorative fades", () => {
  const stylesheet = extractStylesheet();

  expect(stylesheet).toMatch(
    /@media\s*\(prefers-reduced-motion:reduce\)[\s\S]*?body,#app\s*>\s*\*\s*\{[^}]*animation:none/,
  );
  expect(stylesheet).toMatch(
    /@media\s*\(prefers-reduced-motion:reduce\)[\s\S]*?\.session-row,\.session-row:hover\s*\{[^}]*transform:none[^}]*transition:none/,
  );
});

test("responsive rules keep navigation, data, and controls usable through 768px", () => {
  const stylesheet = extractStylesheet();

  expect(DASHBOARD_HTML).toContain('class="table-wrap"');
  expect(stylesheet.match(/overflow-x:auto/g)).toHaveLength(1);
  expect(stylesheet).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:auto/);
  expect(stylesheet).toMatch(/html,body\s*\{[^}]*overflow-x:clip/);
  expect(stylesheet).not.toContain("100vw");
  expect(stylesheet).toMatch(/header nav\s*\{[^}]*flex-wrap:nowrap/);
  expect(stylesheet).toMatch(/\.session-link\s*\{[^}]*white-space:nowrap/);
  expect(stylesheet).toMatch(
    /@media\s*\(max-width:48rem\)[\s\S]*?\.cols\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/,
  );
  expect(stylesheet).toMatch(
    /@media\s*\(max-width:48rem\)[\s\S]*?\.compare-controls\s*\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)/,
  );
  expect(stylesheet).toMatch(
    /@media\s*\(max-width:48rem\)[\s\S]*?select\s*\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0/,
  );
  expect(stylesheet).toMatch(
    /@media\s*\(max-width:48rem\)[\s\S]*?\.stat\s*\{[^}]*padding:var\(--space-3\)/,
  );
  expect(stylesheet).toMatch(/\.stat-value\s*\{[^}]*overflow-wrap:anywhere/);
});

test("programmatic route-heading focus is visually quiet without removing interactive rings", () => {
  expect(DASHBOARD_HTML).toContain('app.querySelector("[data-route-heading]")?.focus()');
  expect(DASHBOARD_HTML).toMatch(/:focus-visible\s*\{[^}]*outline:2px solid var\(--focus\)/);
  expect(DASHBOARD_HTML).toMatch(
    /\[data-route-heading\]:focus\s*\{[^}]*outline:\s*none/,
  );
});

test("timeline preserves missing token directions and explicit zeroes", () => {
  const harness = createPageHarness();
  const render = (value: ReturnType<typeof turn>) =>
    harness.evaluate<string>(`turnHtml(${JSON.stringify(value)})`);

  expect(render(turn({ tokensIn: 12, tokensOut: null }))).toContain("12 in / — out");
  expect(render(turn({ tokensIn: null, tokensOut: 9 }))).toContain("— in / 9 out");
  expect(render(turn({ tokensIn: 0, tokensOut: 0 }))).toContain("0 in / 0 out");
});

test("permission rows map exact allow and deny decisions with every other state warning", () => {
  const harness = createPageHarness();
  const permissions = [
    { decision: "deny", decidedBy: "policy", rule: "protect", toolCallId: "d" },
    { decision: "allow", rule: "permit", toolCallId: "a" },
    { decision: null, rule: "review", toolCallId: "p" },
    { decision: "cancelled", rule: "review", toolCallId: "c" },
    { decision: "escalate", rule: "review", toolCallId: "e" },
  ];
  const html = harness.evaluate<string>(
    `turnHtml(${JSON.stringify(turn({ permissions }))})`,
  );

  expect(html).toContain(
    '<div class="perm perm-deny"><span class="badge perm-decision">deny</span> <code class="perm-tool">d</code><span class="perm-meta"> · policy</span> <span class="badge perm-rule">protect</span></div>',
  );
  expect(html).toContain(
    '<div class="perm perm-allow"><span class="badge perm-decision">allow</span> <code class="perm-tool">a</code>',
  );
  expect(html).toContain(
    '<div class="perm perm-warn"><span class="badge perm-decision">pending</span> <code class="perm-tool">p</code>',
  );
  expect(html).toContain(
    '<div class="perm perm-warn"><span class="badge perm-decision">cancelled</span> <code class="perm-tool">c</code>',
  );
  expect(html).toContain(
    '<div class="perm perm-warn"><span class="badge perm-decision">escalate</span> <code class="perm-tool">e</code>',
  );
  expect(html.match(/class="perm perm-warn"/g)).toHaveLength(3);
});

test("permission rows preserve the pending fallback and escape every displayed field", () => {
  const harness = createPageHarness();
  const html = harness.evaluate<string>(
    `turnHtml(${JSON.stringify(turn({
      permissions: [
        {
          decision: null,
          decidedBy: "human&operator",
          rule: '\"><script>',
          toolCallId: "<tool>",
        },
      ],
    }))})`,
  );

  expect(html).toContain('<span class="badge perm-decision">pending</span>');
  expect(html).toContain('<code class="perm-tool">&lt;tool&gt;</code>');
  expect(html).toContain('<span class="perm-meta"> · human&amp;operator</span>');
  expect(html).toContain('<span class="badge perm-rule">&quot;&gt;&lt;script&gt;</span>');
  expect(html).not.toContain("<script>");
});

test("compare disables empty controls and shows the approved empty marker", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") return [];
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/compare");

  expect(harness.app.innerHTML).toMatch(/<select id="ca"[^>]*disabled/);
  expect(harness.app.innerHTML).toMatch(/<select id="cb"[^>]*disabled/);
  expect(harness.app.innerHTML).toContain(">—<");
  expect(harness.calls).toEqual(["/api/sessions"]);
});

test("compare self-compares the only session without requiring a selection change", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") return [{ id: "only", harness: "solo" }];
    if (url === "/api/compare?a=only&b=only") {
      return { a: detail("only"), b: detail("only") };
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/compare");

  expect(harness.calls).toContain("/api/compare?a=only&b=only");
  expect(harness.app.innerHTML).toContain('class="cols"');
});

test("compare chooses useful defaults for two sessions", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") {
      return [
        { id: "first", harness: "one" },
        { id: "second", harness: "two" },
      ];
    }
    if (url === "/api/compare?a=first&b=second") {
      return { a: detail("first"), b: detail("second") };
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/compare");

  expect(harness.calls).toContain("/api/compare?a=first&b=second");
  expect(harness.app.innerHTML).toContain("harness-first");
  expect(harness.app.innerHTML).toContain("harness-second");
});

test("compare keeps a missing response side explicit", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") {
      return [
        { id: "first", harness: "one" },
        { id: "second", harness: "two" },
      ];
    }
    if (url === "/api/compare?a=first&b=second") {
      return { a: null, b: detail("second") };
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/compare?a=first&b=second");

  expect(harness.app.innerHTML).toContain("Not found");
  expect(harness.app.innerHTML).toContain(
    '<section class="compare-panel" aria-labelledby="compare-panel-a"><h3 class="compare-panel-header" id="compare-panel-a">Session A</h3><p class="muted">Not found</p>',
  );
  expect(harness.app.innerHTML).toContain("harness-second");
});

test("a stale route completion cannot replace the current view", async () => {
  const harness = createPageHarness();
  const sessionsRoute = harness.route("#/");
  const lineageRoute = harness.route("#/lineage");

  expect(harness.pending.map((request) => request.url)).toEqual([
    "/api/sessions",
    "/api/lineage",
  ]);
  harness.pending[1]!.resolve([]);
  await lineageRoute;
  expect(harness.app.innerHTML).toContain("File lineage");

  harness.pending[0]!.resolve([]);
  await sessionsRoute;
  expect(harness.app.innerHTML).toContain("File lineage");
  expect(harness.app.innerHTML).not.toContain("<h2>Sessions</h2>");
});

test("stale route rejection cannot replace the current view", async () => {
  const harness = createPageHarness();
  const sessionsRoute = harness.route("#/");
  const lineageRoute = harness.route("#/lineage");

  harness.pending[1]!.resolve([]);
  await lineageRoute;
  harness.pending[0]!.reject(new Error("late failure"));
  await sessionsRoute;

  expect(harness.app.innerHTML).toContain("File lineage");
  expect(harness.app.innerHTML).not.toContain('role="alert"');
});

test("current routes expose truthful loading and error live regions", async () => {
  const harness = createPageHarness();
  const request = harness.route("#/lineage");
  expect(harness.app.innerHTML).toContain('role="status"');
  expect(harness.app.innerHTML).toContain("Loading…");

  harness.pending[0]!.reject(new Error("offline"));
  await request;
  expect(harness.app.innerHTML).toContain('role="alert"');
  expect(harness.app.innerHTML).toContain("Failed to load (Error: offline).");
});

test("session tables preserve row semantics and expose real escaped links", async () => {
  const id = `session/\"'<unsafe>`;
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") {
      return [{
        id,
        startedAt: "now",
        harness: "test",
        turnCount: 0,
        toolCallCount: 0,
        fileCount: 0,
        tokensIn: 0,
        tokensOut: 0,
        usageSource: "reported",
        costUsd: null,
        denialCount: 0,
      }];
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/");

  expect(harness.app.innerHTML).not.toContain('<tr class="click" role="link"');
  expect(harness.app.innerHTML).toContain(
    'href="#/session/session%2F%22&#39;%3Cunsafe%3E"',
  );
  expect(harness.app.innerHTML).not.toContain("<unsafe>");
});

test("sessions view renders real summary aggregates before the detail table", async () => {
  const sessions = [
    summary({ id: "first", costUsd: 0.02, denialCount: 2 }),
    summary({ id: "second", costUsd: null, denialCount: 0 }),
    summary({ id: "third", costUsd: 0.03, denialCount: 1 }),
  ];
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") return sessions;
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/");

  const html = harness.app.innerHTML;
  expect(html).toContain(
    '<div class="stats" role="group" aria-label="Session summary">',
  );
  expect(html).toContain(
    '<dt class="stat-label">Sessions</dt><dd class="stat-value">3</dd>',
  );
  expect(html).toContain(
    '<dt class="stat-label">Cost</dt><dd class="stat-value">$0.05</dd>',
  );
  expect(html).toContain(
    '<dl class="stat stat-deny"><dt class="stat-label">Denials</dt><dd class="stat-value">3</dd></dl>',
  );
  expect(html.indexOf('class="stats"')).toBeLessThan(html.indexOf('class="table-wrap"'));
  expect(harness.calls).toEqual(["/api/sessions"]);
});

test("sessions summary keeps entirely unreported cost explicit", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") {
      return [
        summary({ id: "first", costUsd: null }),
        summary({ id: "second", costUsd: null }),
      ];
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/");

  const summaryHtml = harness.app.innerHTML.match(
    /<div class="stats"[^>]*>([\s\S]*?)<\/div>/,
  )?.[1];
  expect(summaryHtml).toBeDefined();
  expect(summaryHtml).toContain(
    '<dt class="stat-label">Cost</dt><dd class="stat-value"><span class="muted">—</span></dd>',
  );
  expect(summaryHtml).not.toContain("$0.00");
});

test("duplicate harness session links have distinct safe accessible names", async () => {
  const ids = ["plain", `unsafe/\"'<id>`];
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") {
      return ids.map((id) => ({
        id,
        startedAt: "now",
        harness: "shared",
        turnCount: 0,
        toolCallCount: 0,
        fileCount: 0,
        tokensIn: 0,
        tokensOut: 0,
        usageSource: "none",
        costUsd: null,
        denialCount: 0,
      }));
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/");

  expect(harness.app.innerHTML).toContain('aria-label="Open shared session plain"');
  expect(harness.app.innerHTML).toContain(
    'aria-label="Open shared session unsafe/&quot;&#39;&lt;id&gt;"',
  );
  expect(harness.app.innerHTML.match(/<a class="session-link"/g)).toHaveLength(2);
  expect(harness.app.innerHTML).not.toContain("<id>");
});

test("file lineage visibly distinguishes same-harness sessions with safe links", async () => {
  const firstId = "session/one";
  const secondId = `session/\"'<two>`;
  const harness = createPageHarness((url) => {
    if (url === "/api/lineage") {
      return [{
        path: "src/shared.ts",
        readCount: 2,
        writeCount: 0,
        sessions: [
          { sessionId: firstId, harness: "shared", modes: ["read"] },
          { sessionId: secondId, harness: "shared", modes: ["read"] },
        ],
      }];
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/lineage");

  expect(harness.app.innerHTML).toContain(
    '<a class="session-link" href="#/session/session%2Fone"><code>session/one</code></a>',
  );
  expect(harness.app.innerHTML).toContain(
    '<a class="session-link" href="#/session/session%2F%22&#39;%3Ctwo%3E"><code>session/&quot;&#39;&lt;two&gt;</code></a>',
  );
  expect(harness.app.innerHTML.match(/shared: read/g)).toHaveLength(2);
  expect(harness.app.innerHTML).not.toContain("<two>");
});

test("lineage renders labelled tokenized counts while preserving paths and session links", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/lineage") {
      return [{
        path: "src/unsafe<path>.ts",
        readCount: 3,
        writeCount: 1,
        sessions: [{ sessionId: "session/one", harness: "codex", modes: ["read", "write"] }],
      }];
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/lineage");

  const html = harness.app.innerHTML;
  expect(html).toContain('<code class="lineage-path">src/unsafe&lt;path&gt;.ts</code>');
  expect(html).toContain(
    '<span class="count-chip count-read"><span class="count-label">Read</span><span class="count-value">3</span></span>',
  );
  expect(html).toContain(
    '<span class="count-chip count-write"><span class="count-label">Write</span><span class="count-value">1</span></span>',
  );
  expect(html).toContain(
    '<a class="session-link" href="#/session/session%2Fone"><code>session/one</code></a> · codex: read/write',
  );
});

test("compare panels name each escaped harness and session without changing the controls", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") {
      return [
        { id: "first", harness: "one" },
        { id: "second", harness: "two" },
      ];
    }
    if (url === "/api/compare?a=first&b=second") {
      return {
        a: { session: { harness: "left&<", id: 'left/"<' }, turns: [] },
        b: { session: { harness: "right", id: "right" }, turns: [] },
      };
    }
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/compare");

  const html = harness.app.innerHTML;
  expect(html).toContain('<section class="compare-panel" aria-labelledby="compare-panel-a">');
  expect(html).toContain(
    '<h3 class="compare-panel-header" id="compare-panel-a"><span class="compare-panel-label">Session A</span><span class="pill harness-chip">left&amp;&lt;</span><code class="compare-panel-id">left/&quot;&lt;</code></h3>',
  );
  expect(html).toContain(
    '<section class="compare-panel" aria-labelledby="compare-panel-b"><h3 class="compare-panel-header" id="compare-panel-b"><span class="compare-panel-label">Session B</span><span class="pill harness-chip">right</span><code class="compare-panel-id">right</code></h3>',
  );
  expect(html).not.toContain("left/<");
  expect(harness.controls.ca.value).toBe("first");
  expect(harness.controls.cb.value).toBe("second");
});

test("lineage counts and comparison panels use only the locked semantic tokens", () => {
  const stylesheet = extractStylesheet();
  const countRead = stylesheet.match(/\.count-read\s*\{([^}]*)\}/)?.[1];
  const countWrite = stylesheet.match(/\.count-write\s*\{([^}]*)\}/)?.[1];

  expect(countRead).toMatch(/(?:^|;)\s*color:var\(--muted\)/);
  expect(countRead).toContain("background:var(--paper-2)");
  expect(countWrite).toMatch(/(?:^|;)\s*color:var\(--warn\)/);
  expect(countWrite).toContain("background:var(--warn-soft)");
  expect(stylesheet).toMatch(
    /\.cols::before\s*\{[^}]*position:absolute[^}]*background:var\(--line\)/,
  );
  expect(stylesheet).toMatch(
    /@media\s*\(max-width:48rem\)[\s\S]*?\.cols::before\s*\{[^}]*content:none/,
  );
  expect(stylesheet).toMatch(
    /\.compare-panel-id\s*\{[^}]*font-family:var\(--font-mono\)/,
  );
});

test("catalog and timeline share honest null, zero, sub-cent, and ordinary costs", async () => {
  const costs = [null, 0, 0.004, 12.345];
  const sessions = costs.map((costUsd, index) => ({
    id: `cost-${index}`,
    startedAt: "now",
    harness: `cost-${index}`,
    turnCount: 0,
    toolCallCount: 0,
    fileCount: 0,
    tokensIn: 0,
    tokensOut: 0,
    usageSource: "reported",
    costUsd,
    denialCount: 0,
  }));
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions") return sessions;
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/");

  const catalog = harness.app.innerHTML;
  const timeline = costs.map((costUsd) =>
    harness.evaluate<string>(`turnHtml(${JSON.stringify(turn({ costUsd }))})`),
  ).join("");
  for (const html of [catalog, timeline]) {
    expect(html).toContain('<span class="muted">—</span>');
    expect(html).toContain("$0.00");
    expect(html).toContain("&lt;$0.01");
    expect(html).toContain("$12.35");
  }
  expect(catalog.match(/\$0\.00/g)).toHaveLength(1);
  expect(timeline.match(/\$0\.00/g)).toHaveLength(1);
});

test("empty session details render an explicit timeline marker", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions/empty") return detail("empty");
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/session/empty");

  expect(harness.app.innerHTML).toMatch(/harness-empty[\s\S]*class="muted">—<\/p>/);
});
