import { expect, test } from "vitest";
import { createLineParser } from "../src/ndjson.js";

function collect() {
  const out: Array<{ msg: unknown | null; raw: string }> = [];
  const feed = createLineParser((msg, raw) => out.push({ msg, raw }));
  return { out, feed };
}

test("parses one complete JSON line", () => {
  const { out, feed } = collect();
  feed('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
  expect(out).toHaveLength(1);
  expect(out[0]!.msg).toEqual({ jsonrpc: "2.0", id: 1, method: "initialize" });
  expect(out[0]!.raw).toBe('{"jsonrpc":"2.0","id":1,"method":"initialize"}');
});

test("buffers partial lines across chunks", () => {
  const { out, feed } = collect();
  feed('{"id":');
  expect(out).toHaveLength(0);
  feed('1}\n{"id":2}\n');
  expect(out.map((o) => o.msg)).toEqual([{ id: 1 }, { id: 2 }]);
});

test("handles multiple lines in one chunk and skips empty lines", () => {
  const { out, feed } = collect();
  feed('{"a":1}\n\n{"b":2}\n');
  expect(out).toHaveLength(2);
});

test("invalid JSON is delivered with msg null and raw preserved", () => {
  const { out, feed } = collect();
  feed("not json at all\n");
  expect(out).toEqual([{ msg: null, raw: "not json at all" }]);
});

test("accepts Buffer chunks", () => {
  const { out, feed } = collect();
  feed(Buffer.from('{"c":3}\n'));
  expect(out[0]!.msg).toEqual({ c: 3 });
});

test("preserves carriage returns from CRLF framing", () => {
  const { out, feed } = collect();
  feed('{ "id": 4 }\r\n');
  expect(out).toEqual([{ msg: { id: 4 }, raw: '{ "id": 4 }\r' }]);
});
