import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Direction = "client->harness" | "harness->client";

export class JsonlRecorder {
  readonly #filePath: string;
  readonly #redact: ((raw: string) => string) | undefined;
  #warned = false;
  #dropped = 0;

  constructor(filePath: string, redact?: (raw: string) => string) {
    this.#filePath = filePath;
    this.#redact = redact;
    try {
      mkdirSync(dirname(filePath), { recursive: true });
    } catch {
      // The first record attempt reports the failure without blocking the proxy.
    }
  }

  get droppedCount(): number {
    return this.#dropped;
  }

  record(direction: Direction, raw: string): void {
    let stored: string;
    try {
      stored = this.#redact ? this.#redact(raw) : raw;
    } catch {
      this.#drop("acplane: recorder redaction failed, session log incomplete");
      return;
    }

    const line = JSON.stringify({ ts: new Date().toISOString(), direction, raw: stored });
    try {
      appendFileSync(this.#filePath, `${line}\n`);
    } catch (error) {
      this.#drop(`acplane: recorder write failed, session log incomplete: ${String(error)}`);
    }
  }

  #drop(message: string): void {
    this.#dropped += 1;
    if (!this.#warned) {
      this.#warned = true;
      console.error(message);
    }
  }
}
