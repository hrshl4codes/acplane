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
});
