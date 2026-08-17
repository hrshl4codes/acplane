import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");

type Listener = (event: { clientX?: number; clientY?: number; target?: unknown }) => void;

class FakeTarget {
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly styleValues = new Map<string, string>();
  children: FakeTarget[] = [];

  readonly style = {
    setProperty: (name: string, value: string): void => {
      this.styleValues.set(name, value);
    },
  };

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string, event: Parameters<Listener>[0] = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelectorAll(selector: string): FakeTarget[] {
    return selector === "[data-plane]" ? this.children : [];
  }

  contains(target: unknown): boolean {
    return target === this || this.children.includes(target as FakeTarget);
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 1000, height: 500 };
  }
}

const controllerSource = (): string | null => {
  const match = read("site/index.html").match(
    /<script\s+type="module"\s+data-signal-controller>([\s\S]*?)<\/script>/,
  );
  return match?.[1] ?? null;
};

const runController = (options: { fine?: boolean; reduced?: boolean; chamber?: boolean } = {}) => {
  const source = controllerSource();
  expect(source, "Signal Chamber controller script is missing").not.toBeNull();

  const documentTarget = new FakeTarget();
  const chamber = new FakeTarget();
  chamber.dataset.active = "none";
  const planes = ["proxy", "policy", "recorder"].map((name) => {
    const plane = new FakeTarget();
    plane.dataset.plane = name;
    plane.attributes.set("aria-pressed", "false");
    return plane;
  });
  chamber.children = planes;
  const frames: Array<(time: number) => void> = [];

  runInNewContext(source!, {
    document: Object.assign(documentTarget, {
      querySelector: (selector: string) =>
        selector === "[data-signal-chamber]" && options.chamber !== false ? chamber : null,
    }),
    matchMedia: (query: string) => ({
      matches: query.includes("hover") ? options.fine === true : options.reduced === true,
    }),
    requestAnimationFrame: (callback: (time: number) => void) => {
      frames.push(callback);
      return frames.length;
    },
  });

  return { chamber, documentTarget, frames, planes };
};

describe("Acplane landing page", () => {
  test("ships a standalone page with one primary destination", () => {
    expect(existsSync(resolve(root, "site/index.html"))).toBe(true);
    expect(existsSync(resolve(root, "site/tokens.css"))).toBe(true);
    expect(existsSync(resolve(root, "site/styles.css"))).toBe(true);

    const html = read("site/index.html");
    expect(html).toContain("<title>acplane — ACP visibility and policy</title>");
    expect(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).toContain(
      "Agents move fast. Keep the boundary visible.",
    );
    expect(html).toContain('href="https://github.com/hrshl4codes/acplane"');
    expect(html.match(/>View on GitHub(?: ↗)?<\/a>/g)?.length).toBe(2);
    expect(html).toContain('<main id="main-content">');
    expect(html).toContain("<footer");
  });

  test("configures Vercel to publish only the static site", () => {
    expect(existsSync(resolve(root, "vercel.json"))).toBe(true);
    expect(JSON.parse(read("vercel.json"))).toEqual({
      $schema: "https://openapi.vercel.sh/vercel.json",
      outputDirectory: "site",
      cleanUrls: true,
    });
  });

  test("renders one Signal Chamber with open endpoints and a three-plane control stack", () => {
    const html = read("site/index.html");
    const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(visible).toContain("ACP control plane");
    expect(visible).toContain(
      "Acplane governs permission requests, records ACP traffic outside model context, and gives every session a durable readback.",
    );
    expect(visible).toContain("Explore the signal path ↓");
    expect(html).toContain('data-signal-chamber');
    expect(html).toContain('role="group" aria-labelledby="signal-title" aria-describedby="signal-description"');
    for (const label of [
      "Source · ACP client",
      "Editor",
      "Zed / compatible client",
      "Destination · harness",
      "Agent runtime",
      "Codex / Claude Code",
    ]) {
      expect(visible).toContain(label);
    }
    expect(html.match(/data-plane="(?:proxy|policy|recorder)"/g)).toHaveLength(3);
    expect(html).toMatch(/Proxy\s*<span[^>]*>01<\/span>/);
    expect(html).toMatch(/Policy\s*<span[^>]*>02<\/span>/);
    expect(html).toMatch(/Recorder\s*<span[^>]*>03<\/span>/);
    expect(html).not.toContain('class="system-map map--desktop"');
    expect(html).not.toContain('class="system-map-mobile map--mobile"');
  });

  test("routes compact rounded-elbow leaders to the correct stack planes", () => {
    const html = read("site/index.html");

    expect(html).toContain('class="signal-leaders"');
    expect(html.match(/class="leader leader--(?:proxy|policy|recorder)"/g)).toHaveLength(3);
    expect(html.match(/\bQ\s*[-\d.]+\s+[-\d.]+/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html.match(/marker-end="url\(#signal-arrow\)"/g)).toHaveLength(3);
    expect(html).toContain("Preserves the exchange");
    expect(html).toContain("Controls permission requests");
    expect(html).toContain("Creates the flight log");
    expect(html).not.toMatch(/rail-socket|ingress-socket|egress-socket/i);
  });

  test("limits quantitative claims to implementation facts", () => {
    const html = read("site/index.html");
    expect(html).toMatch(/<strong>5<\/strong>\s*indexed flows/);
    expect(html).toMatch(/<strong>3<\/strong>\s*policy inputs/);
    expect(html).toMatch(/<strong>3<\/strong>\s*decision outcomes/);
    expect(html).toContain("session/request_permission");
    expect(html).toContain("allow, deny, or escalate");
    expect(html).toContain("outside the model context");
    expect(html).toContain("Recorder failures never block the session");
    expect(html).not.toMatch(/trusted by|customers|faster|10×|testimonial/i);
  });

  test("uses the locked token system without improvised visual effects", () => {
    const tokens = read("site/tokens.css");
    const css = read("site/styles.css");
    expect(tokens.trimStart()).toMatch(/^\/\* Hallmark · pre-emit critique:/);
    for (const token of [
      "--color-paper",
      "--color-ink",
      "--color-accent",
      "--color-ok",
      "--color-deny",
      "--color-warn",
      "--font-body",
      "--font-display",
      "--font-mono",
      "--space-xs",
      "--ease-out",
    ]) {
      expect(tokens).toContain(token);
    }
    expect(css).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|rgba?\(|gradient\(/i);
    expect(css).not.toMatch(/font-style\s*:\s*italic/i);
    expect(css).not.toContain("100vw");
    expect(css).toMatch(/h1,\s*h2\s*\{[^}]*font-family:\s*var\(--font-display\);/s);
  });

  test("uses an authored Workbench type system instead of system defaults", () => {
    const html = read("site/index.html");
    const tokens = read("site/tokens.css");

    expect(tokens).toContain("macrostructure: Signal Chamber");
    expect(tokens).toMatch(/--font-display:\s*"Space Grotesk"/);
    expect(tokens).toMatch(/--font-body:\s*"IBM Plex Sans"/);
    expect(tokens).toMatch(/--font-mono:\s*"JetBrains Mono"/);
    expect(html).toMatch(/fonts\.googleapis\.com\/css2\?[^"']*display=swap/);
    expect(html).toContain('href="https://fonts.gstatic.com" crossorigin');
  });

  test("recomposes the page around product proof and varied section rhythm", () => {
    const html = read("site/index.html");
    const css = read("site/styles.css");

    expect(html).toContain('class="masthead-shell"');
    expect(html).toContain('class="site-nav" aria-label="Primary navigation"');
    expect(html).toContain('class="protocol-grid"');
    expect(html).toContain('class="product-proof"');
    expect(html).toContain('class="run-grid"');
    expect(html.indexOf('class="protocol-grid"')).toBeLessThan(html.indexOf('class="product-proof"'));
    expect(css).toMatch(/\.product-proof\s*\{[^}]*background:\s*var\(--color-proof\);/s);
    expect(css).toMatch(/\.protocol-grid\s*\{[^}]*display:\s*grid;/s);
  });

  test("is mobile-first, overflow-safe, and reduced-motion safe", () => {
    const css = read("site/styles.css");
    expect(css).toMatch(/html,\s*body[^{]*\{[^}]*overflow-x:\s*clip/s);
    expect(css).toMatch(/\.masthead-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s);
    expect(css).toMatch(/\.hero-copy,\s*\.signal-chamber\s*\{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.signal-chamber\s*\{[^}]*min-width:\s*0;/s);
    expect(css).toContain("@media (min-width: 60rem)");
    expect(css).toContain("@media (max-width: 48rem)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toContain("100vw");
  });

  test("gives links visible pointer, keyboard, and pressed states", () => {
    const css = read("site/styles.css");
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain(":active");
    expect(css).toContain('a[aria-disabled="true"]');
    expect(css).toContain("cursor: not-allowed;");
    expect(css).toMatch(/min-(?:block-size|height):\s*44px/);
  });

  test("ships a local dashboard capture with honest fallback text", () => {
    expect(existsSync(resolve(root, "site/assets/dashboard.png"))).toBe(true);
    const html = read("site/index.html");
    expect(html).toMatch(
      /<img[^>]+src="\.\/assets\/dashboard\.png"[^>]+width="1536"[^>]+height="1024"[^>]+loading="lazy"[^>]+alt="[^"]+"/s,
    );
    expect(html).toContain("Sanitized sample session data.");
    const remoteTargets = [...html.matchAll(/(?:src|href)="(https:\/\/[^\"]+)"/g)].map((match) => match[1]!);
    expect(remoteTargets.every((target) => /^https:\/\/(?:github\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(target))).toBe(true);
  });

  test("keeps the wide-screen Signal Chamber in the opening composition without browser noise", () => {
    const html = read("site/index.html");
    const css = read("site/styles.css");
    const desktop = css.slice(css.indexOf("@media (min-width: 60rem)"));

    expect(html).toContain('<link rel="icon" href="data:,">');
    expect(desktop).toMatch(/\.hero-main\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*5fr\)\s+minmax\(0,\s*7fr\);/s);
    expect(desktop).toMatch(/\.hero-copy\s*\{[^}]*margin-block-end:\s*0;/s);
    expect(css).toMatch(/\.hero\s*\{[^}]*padding-block:\s*var\(--space-xl\)\s+var\(--space-2xl\);/s);
    expect(desktop).toMatch(/\.hero-main\s*\{[^}]*gap:\s*var\(--space-2xl\);/s);
    expect(html).toContain('class="signal-endpoint signal-endpoint--editor"');
    expect(html).toContain('class="signal-endpoint signal-endpoint--runtime"');
  });

  test("keeps one selected plane in sync across tap, focus, and outside reset", () => {
    const { chamber, documentTarget, planes } = runController();

    planes[1]!.dispatch("click");
    expect(chamber.dataset.active).toBe("policy");
    expect(planes.map((plane) => plane.attributes.get("aria-pressed"))).toEqual(["false", "true", "false"]);

    planes[2]!.dispatch("focus");
    expect(chamber.dataset.active).toBe("recorder");
    expect(planes.map((plane) => plane.attributes.get("aria-pressed"))).toEqual(["false", "false", "true"]);

    documentTarget.dispatch("pointerdown", { target: {} });
    expect(chamber.dataset.active).toBe("none");
  });

  test("uses hover and a bounded spring only for fine pointers", () => {
    const { chamber, frames, planes } = runController({ fine: true });

    planes[0]!.dispatch("pointerenter");
    expect(chamber.dataset.active).toBe("proxy");
    chamber.dispatch("pointermove", { clientX: 750, clientY: 100 });
    expect(frames).toHaveLength(1);

    frames.shift()!(0);
    expect(chamber.styleValues.get("--tilt-x")).toMatch(/deg$/);
    expect(chamber.styleValues.get("--tilt-z")).toMatch(/deg$/);
    expect(chamber.styleValues.get("--spread")).toMatch(/px$/);

    chamber.dispatch("pointerleave");
    expect(chamber.dataset.active).toBe("none");
  });

  test("keeps selection but schedules no spring frames under reduced motion", () => {
    const { chamber, frames, planes } = runController({ fine: true, reduced: true });

    planes[1]!.dispatch("focus");
    chamber.dispatch("pointermove", { clientX: 750, clientY: 100 });
    expect(chamber.dataset.active).toBe("policy");
    expect(frames).toHaveLength(0);
  });

  test("progressively enhances without failing when the chamber is absent", () => {
    expect(() => runController({ chamber: false })).not.toThrow();
  });
});
