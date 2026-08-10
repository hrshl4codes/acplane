import { CLEAR_LINE, paint, type Style } from "./ansi.js";
import { ACCENT } from "./logo.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FAILURE: [number, number, number] = [248, 113, 113];

export interface Spinner {
  setLabel(label: string): void;
  succeed(message: string): void;
  fail(message: string): void;
}

function writeSafely(stream: NodeJS.WritableStream, chunk: string): boolean {
  try {
    stream.write(chunk);
    return true;
  } catch {
    return false;
  }
}

export function createSpinner(
  stream: NodeJS.WritableStream & { isTTY?: boolean },
  style: Style,
  label: string,
): Spinner {
  let current = label;
  let finished = false;

  if (!stream.isTTY) {
    const finish = (message: string) => {
      if (finished) return;
      finished = true;
      writeSafely(stream, `${message}\n`);
    };

    return {
      setLabel: (next) => {
        current = next;
      },
      succeed: finish,
      fail: finish,
    };
  }

  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const renderFrame = () => {
    if (finished) return;
    const symbol = FRAMES[frame % FRAMES.length]!;
    frame += 1;
    if (!writeSafely(stream, `${CLEAR_LINE}${paint(symbol, ACCENT, style)} ${current}`)) {
      finished = true;
      stop();
    }
  };

  timer = setInterval(renderFrame, 80);

  const finish = (symbol: string, message: string) => {
    if (finished) return;
    finished = true;
    stop();
    writeSafely(stream, `${CLEAR_LINE}${symbol} ${message}\n`);
  };

  return {
    setLabel: (next) => {
      current = next;
    },
    succeed: (message) => finish(paint("✓", ACCENT, style), message),
    fail: (message) => finish(paint("✗", FAILURE, style), message),
  };
}
