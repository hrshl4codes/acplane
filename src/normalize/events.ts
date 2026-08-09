import { readFileSync } from "node:fs";
import type { Direction } from "../recorder.js";

export interface RecordedEvent {
  ts: string;
  direction: Direction;
  msg: unknown;
}

export function readSessionEvents(filePath: string): RecordedEvent[] {
  const text = readFileSync(filePath, "utf8");
  const events: RecordedEvent[] = [];

  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;

    let record: { ts: string; direction: Direction; raw: string };
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    let msg: unknown = null;
    try {
      msg = JSON.parse(record.raw);
    } catch {
      msg = null;
    }

    events.push({ ts: record.ts, direction: record.direction, msg });
  }

  return events;
}
