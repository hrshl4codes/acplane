import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");

describe("Acplane landing page", () => {
  test("ships a standalone page with one primary destination", () => {
    expect(existsSync(resolve(root, "site/index.html"))).toBe(true);
    expect(existsSync(resolve(root, "site/tokens.css"))).toBe(true);
    expect(existsSync(resolve(root, "site/styles.css"))).toBe(true);

    const html = read("site/index.html");
    expect(html).toContain("<title>acplane — ACP visibility and policy</title>");
    expect(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).toContain("See what agents actually do.");
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

  test("maps the complete ACP traffic, permission, and telemetry paths", () => {
    const html = read("site/index.html");
    expect(html).toContain('<svg class="system-map map--desktop"');
    expect(html).toContain('role="img" aria-labelledby="map-title map-desc"');
    expect(html).toContain('<title id="map-title">How Acplane handles an ACP session</title>');
    expect(html).toContain('<desc id="map-desc">');
    for (const node of [
      "ACP editor",
      "acplane",
      "Agent harness",
      "JSONL flight log",
      "SQLite dashboard",
    ]) {
      expect(html).toContain(node);
    }
    for (const decision of ["allow", "deny", "escalate"]) {
      expect(html).toContain(`>${decision}<`);
    }
    expect(html).toContain('class="system-map-mobile map--mobile"');
  });

  test("limits quantitative claims to implementation facts", () => {
    const html = read("site/index.html");
    expect(html).toMatch(/<strong>5<\/strong>\s*indexed flows/);
    expect(html).toMatch(/<strong>3<\/strong>\s*policy inputs/);
    expect(html).toMatch(/<strong>3<\/strong>\s*outcomes/);
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

    expect(tokens).toContain("macrostructure: Workbench");
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
    expect(css).toMatch(/\.hero-copy,\s*\.map-frame\s*\{[^}]*min-width:\s*0;/s);
    expect(css).toContain(".map--desktop {\n  display: none;");
    expect(css).toContain("@media (min-width: 60rem)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css.match(/@keyframes\s+/g)).toHaveLength(2);
    expect(css).toContain("@keyframes node-ink");
    expect(css).toContain("@keyframes traffic-trace");
  });

  test("does not override SVG node positioning during motion", () => {
    const css = read("site/styles.css");
    const nodeInk = css.slice(css.indexOf("@keyframes node-ink"), css.indexOf("@keyframes traffic-trace"));
    expect(nodeInk).not.toContain("transform:");
    expect(css).not.toMatch(/\.map-node,\s*\.permission-gate,\s*\.traffic-trace\s*\{[^}]*transform:\s*none/s);
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
    expect(html).not.toMatch(/<script\b/i);
    const remoteTargets = [...html.matchAll(/(?:src|href)="(https:\/\/[^\"]+)"/g)].map((match) => match[1]!);
    expect(remoteTargets.every((target) => /^https:\/\/(?:github\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(target))).toBe(true);
  });

  test("keeps the wide-screen system map in the opening composition without browser noise", () => {
    const html = read("site/index.html");
    const css = read("site/styles.css");
    const desktop = css.slice(css.indexOf("@media (min-width: 60rem)"));

    expect(html).toContain('<link rel="icon" href="data:,">');
    expect(desktop).toMatch(/\.hero-main\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*5fr\)\s+minmax\(0,\s*7fr\);/s);
    expect(desktop).toMatch(/\.hero-copy\s*\{[^}]*margin-block-end:\s*0;/s);
    expect(css).toMatch(/\.hero\s*\{[^}]*padding-block:\s*var\(--space-xl\)\s+var\(--space-2xl\);/s);
    expect(desktop).toMatch(/\.hero-main\s*\{[^}]*gap:\s*var\(--space-2xl\);/s);
  });
});
