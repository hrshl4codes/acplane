import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readSessionEvents } from "../src/normalize/events.js";

let directory: string;

afterEach(() => rmSync(directory, { recursive: true, force: true }));

test("reads recorded events while skipping blank and malformed outer lines", () => {
  directory = mkdtempSync(join(tmpdir(), "acplane-events-"));
  const file = join(directory, "session.jsonl");
  writeFileSync(
    file,
    [
      JSON.stringify({
        ts: "t0",
        direction: "client->harness",
        raw: '{"id":1,"method":"initialize"}',
      }),
      "",
      "not an outer record",
      JSON.stringify({
        ts: "t1",
        direction: "harness->client",
        raw: "not inner json",
      }),
    ].join("\n") + "\n",
  );

  const events = readSessionEvents(file);

  expect(events).toHaveLength(2);
  expect(events[0]).toEqual({
    ts: "t0",
    direction: "client->harness",
    msg: { id: 1, method: "initialize" },
  });
  expect(events[1]).toEqual({
    ts: "t1",
    direction: "harness->client",
    msg: null,
  });
});
