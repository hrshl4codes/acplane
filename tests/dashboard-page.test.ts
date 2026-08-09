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

test("page is a self-contained document with the app mount and no external assets", () => {
  expect(DASHBOARD_HTML).toContain("<!doctype html>");
  expect(DASHBOARD_HTML).toContain('<main id="app"><p class="muted" role="status">Loading…</p></main>');
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

test("page renders permission decisions and governing rules distinctly", () => {
  expect(DASHBOARD_HTML).toContain(
    'p.decision === "deny" ? " deny" : p.decision === "allow" ? " allow" : ""',
  );
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

test("programmatic route-heading focus is visually quiet without removing interactive rings", () => {
  expect(DASHBOARD_HTML).toContain('app.querySelector("[data-route-heading]")?.focus()');
  expect(DASHBOARD_HTML).toMatch(/:focus-visible\s*\{[^}]*outline:2px solid var\(--accent\)/);
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

test("only exact permission decisions receive allow or deny styling", () => {
  const harness = createPageHarness();
  const permissions = [
    { decision: "deny", rule: "protect", toolCallId: "d" },
    { decision: "allow", rule: "permit", toolCallId: "a" },
    { decision: null, rule: "review", toolCallId: "p" },
    { decision: "cancelled", rule: "review", toolCallId: "c" },
    { decision: "escalate", rule: "review", toolCallId: "e" },
  ];
  const html = harness.evaluate<string>(
    `turnHtml(${JSON.stringify(turn({ permissions }))})`,
  );

  expect(html).toContain('<span class="badge deny">deny</span>');
  expect(html).toContain('<span class="badge allow">allow</span>');
  expect(html).toContain('<span class="badge">pending</span>');
  expect(html).toContain('<span class="badge">cancelled</span>');
  expect(html).toContain('<span class="badge">escalate</span>');
  expect(html).not.toContain('class="badge allow">pending');
  expect(html).not.toContain('class="badge allow">cancelled');
  expect(html).not.toContain('class="badge allow">escalate');
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

test("empty session details render an explicit timeline marker", async () => {
  const harness = createPageHarness((url) => {
    if (url === "/api/sessions/empty") return detail("empty");
    throw new Error(`unexpected request: ${url}`);
  });

  await harness.route("#/session/empty");

  expect(harness.app.innerHTML).toMatch(/harness-empty[\s\S]*class="muted">—<\/p>/);
});
