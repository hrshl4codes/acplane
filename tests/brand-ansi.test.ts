import { expect, test } from "vitest";
import { bold, detectStyle, paint } from "../src/brand/ansi.js";

const TTY = { isTTY: true };
const PIPE = { isTTY: false };

test("detectStyle reads tty, color, and truecolor from env", () => {
  expect(detectStyle(PIPE, {})).toEqual({ tty: false, color: false, truecolor: false });
  expect(detectStyle(TTY, {})).toEqual({ tty: true, color: true, truecolor: false });
  expect(detectStyle(TTY, { COLORTERM: "truecolor" })).toEqual({ tty: true, color: true, truecolor: true });
  expect(detectStyle(TTY, { NO_COLOR: "1" }).color).toBe(false);
  expect(detectStyle(TTY, { NO_COLOR: "" }).color).toBe(false);
  expect(detectStyle(TTY, { TERM: "dumb" }).color).toBe(false);
});

test("paint emits truecolor, 16-color, or plain per capability", () => {
  const cyan: [number, number, number] = [56, 189, 248];
  expect(paint("x", cyan, { tty: true, color: true, truecolor: true })).toBe("\x1b[38;2;56;189;248mx\x1b[39m");
  expect(paint("x", cyan, { tty: true, color: true, truecolor: false })).toBe("\x1b[36mx\x1b[39m");
  expect(paint("x", cyan, { tty: false, color: false, truecolor: false })).toBe("x");
});

test("bold is a no-op without color", () => {
  expect(bold("x", { tty: true, color: true, truecolor: false })).toBe("\x1b[1mx\x1b[22m");
  expect(bold("x", { tty: false, color: false, truecolor: false })).toBe("x");
});
