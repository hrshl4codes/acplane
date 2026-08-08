import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Direction = "client->harness" | "harness->client";

export class JsonlRecorder {
  readonly #filePath: string;
  #warned = false;
  #dropped = 0;

  constructor(filePath: string) {
    this.#filePath = filePath;
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
    const line = JSON.stringify({ ts: new Date().toISOString(), direction, raw });
    try {
      appendFileSync(this.#filePath, `${line}\n`);
    } catch (error) {
      this.#dropped += 1;
      if (!this.#warned) {
        this.#warned = true;
        console.error(`acplane: recorder write failed, session log incomplete: ${String(error)}`);
      }
    }
  }
}
