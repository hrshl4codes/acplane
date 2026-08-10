import { expect, test } from "vitest";
import { detectStyle } from "../src/brand/ansi.js";
import { getVersion, HELP_TEXT, renderHelp } from "../src/brand/banner.js";

test("getVersion returns the package version", () => {
  expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
});

test("help text documents all three commands", () => {
  expect(HELP_TEXT).toContain("index");
  expect(HELP_TEXT).toContain("ui");
  expect(HELP_TEXT).toMatch(/--harness/);
});

test("renderHelp emits no ANSI for a non-TTY or NO_COLOR", () => {
  expect(renderHelp(detectStyle({ isTTY: false }, {}))).not.toMatch(/\x1b\[/);
  expect(renderHelp(detectStyle({ isTTY: true }, { NO_COLOR: "1" }))).not.toMatch(/\x1b\[/);
});

test("renderHelp applies styling for a color-capable TTY", () => {
  expect(renderHelp(detectStyle({ isTTY: true }, { COLORTERM: "truecolor" }))).toMatch(/\x1b\[/);
});
