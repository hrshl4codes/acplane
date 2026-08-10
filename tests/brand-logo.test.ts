import { expect, test, vi } from "vitest";
import { renderLogo, revealLogo } from "../src/brand/logo.js";

const PLAIN = { tty: false, color: false, truecolor: false };

test("renderLogo returns the plain wordmark with no ANSI when color is off", () => {
  const out = renderLogo(PLAIN, "control plane for coding agents");

  expect(out).not.toMatch(/\x1b\[/);
  expect(out).toContain("control plane for coding agents");
  expect(out.split("\n").length).toBeGreaterThanOrEqual(5);
});

test("revealLogo on a non-TTY writes one static plain logo", async () => {
  const writes: string[] = [];
  const stream = { isTTY: false, write: (chunk: string) => (writes.push(chunk), true) } as any;

  await revealLogo(stream, PLAIN, "v0.0.1");

  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain("v0.0.1");
  expect(writes[0]).not.toMatch(/\x1b\[/);
});

test("revealLogo suppresses ANSI on a non-TTY even with a colored style", async () => {
  const writes: string[] = [];
  const stream = { isTTY: false, write: (chunk: string) => (writes.push(chunk), true) } as any;
  const colored = { tty: true, color: true, truecolor: true };

  await revealLogo(stream, colored, "v0.0.1");

  expect(writes).toHaveLength(1);
  expect(writes[0]).not.toMatch(/\x1b\[/);
});

test("revealLogo on a TTY animates line by line then resolves", async () => {
  vi.useFakeTimers();
  const writes: string[] = [];
  const stream = { isTTY: true, write: (chunk: string) => (writes.push(chunk), true) } as any;
  const style = { tty: true, color: true, truecolor: true };

  try {
    const done = revealLogo(stream, style, "v0.0.1");
    await vi.runAllTimersAsync();
    await expect(done).resolves.toBeUndefined();

    expect(writes.length).toBeGreaterThan(1);
    expect(writes.at(-1)).toContain("v0.0.1");
  } finally {
    vi.useRealTimers();
  }
});

test("revealLogo settles when a non-TTY stream write throws", async () => {
  const stream = {
    isTTY: false,
    write: () => {
      throw new Error("broken pipe");
    },
  } as any;

  await expect(revealLogo(stream, PLAIN)).resolves.toBeUndefined();
});

test("revealLogo clears its TTY timer when a stream write throws", async () => {
  vi.useFakeTimers();
  const stream = {
    isTTY: true,
    write: () => {
      throw new Error("broken pipe");
    },
  } as any;
  const style = { tty: true, color: true, truecolor: true };

  try {
    const done = revealLogo(stream, style);
    await vi.runAllTimersAsync();
    await expect(done).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
