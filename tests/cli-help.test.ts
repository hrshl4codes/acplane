import { expect, test, vi } from "vitest";
import { main } from "../src/cli.js";

async function captureStdout(run: () => Promise<number>): Promise<{ code: number; output: string }> {
  const output: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
    output.push(String(chunk));
    return true;
  });

  try {
    return { code: await run(), output: output.join("") };
  } finally {
    spy.mockRestore();
  }
}

test.each([{ flag: "--version" }, { flag: "-v" }])("$flag prints the version and returns 0", async ({ flag }) => {
  const argv = [flag];
  const { code, output } = await captureStdout(() => main(argv));

  expect(code).toBe(0);
  expect(output).toMatch(/^acplane \d+\.\d+\.\d+\n$/);
});

test.each([{ flag: "--help" }, { flag: "-h" }])("$flag returns 0 and prints plain help on a non-TTY", async ({ flag }) => {
  const argv = [flag];
  const { code, output } = await captureStdout(() => main(argv));

  expect(code).toBe(0);
  expect(output).toContain("index");
  expect(output).toContain("ui");
  expect(output).not.toMatch(/\x1b\[/);
});
