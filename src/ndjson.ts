export type LineHandler = (msg: unknown | null, raw: string) => void;

export function createLineParser(onLine: LineHandler): (chunk: Buffer | string) => void {
  let buffer = "";

  return (chunk: Buffer | string) => {
    buffer += chunk.toString();

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const raw = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (raw.trim() === "") continue;

      let msg: unknown | null;
      try {
        msg = JSON.parse(raw);
      } catch {
        msg = null;
      }
      onLine(msg, raw);
    }
  };
}
