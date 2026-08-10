import { expect, test, vi } from "vitest";
import { createSpinner } from "../src/brand/spinner.js";

const PLAIN = { tty: false, color: false, truecolor: false };
const COLORED_TTY = { tty: true, color: true, truecolor: false };

test("non-TTY creation and label updates write nothing before success", () => {
  const writes: string[] = [];
  const stream = { isTTY: false, write: (chunk: string) => (writes.push(chunk), true) } as any;

  const spinner = createSpinner(stream, PLAIN, "Indexing");
  spinner.setLabel("Still indexing");

  expect(writes).toEqual([]);

  spinner.succeed("acplane: indexed 2 sessions");
  expect(writes).toEqual(["acplane: indexed 2 sessions\n"]);
});

test("non-TTY failure is exactly its final message followed by a newline", () => {
  const writes: string[] = [];
  const stream = { isTTY: false, write: (chunk: string) => (writes.push(chunk), true) } as any;

  createSpinner(stream, PLAIN, "Indexing").fail("acplane: nothing to index");

  expect(writes).toEqual(["acplane: nothing to index\n"]);
});

test("a TTY spinner renders a braille frame after 80ms and styles its success line", () => {
  vi.useFakeTimers();
  const writes: string[] = [];
  const stream = { isTTY: true, write: (chunk: string) => (writes.push(chunk), true) } as any;

  try {
    const spinner = createSpinner(stream, COLORED_TTY, "Indexing");
    vi.advanceTimersByTime(80);
    spinner.succeed("Indexed 2 sessions");

    expect(writes).toEqual([
      "\r\x1b[2K\x1b[36m⠋\x1b[39m Indexing",
      "\r\x1b[2K\x1b[36m✓\x1b[39m Indexed 2 sessions\n",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("a terminal result is idempotent and stops TTY animation", () => {
  vi.useFakeTimers();
  const writes: string[] = [];
  const stream = { isTTY: true, write: (chunk: string) => (writes.push(chunk), true) } as any;

  try {
    const spinner = createSpinner(stream, PLAIN, "Indexing");
    spinner.fail("Nothing to index");
    spinner.succeed("Should not print");
    vi.advanceTimersByTime(160);

    expect(writes).toEqual(["\r\x1b[2K✗ Nothing to index\n"]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("a thrown stream write during TTY animation is contained and stops the timer", () => {
  vi.useFakeTimers();
  const stream = {
    isTTY: true,
    write: () => {
      throw new Error("broken pipe");
    },
  } as any;

  try {
    createSpinner(stream, PLAIN, "Indexing");

    expect(() => vi.advanceTimersByTime(80)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("a thrown final write is contained and leaves no TTY timer", () => {
  vi.useFakeTimers();
  const stream = {
    isTTY: true,
    write: () => {
      throw new Error("broken pipe");
    },
  } as any;

  try {
    const spinner = createSpinner(stream, PLAIN, "Indexing");

    expect(() => spinner.succeed("Indexed 2 sessions")).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
