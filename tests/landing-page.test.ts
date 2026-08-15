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
    expect(html).toContain("See what agents actually do.");
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
});
