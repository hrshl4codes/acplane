import { dim, paint, type Style } from "./ansi.js";

export const ACCENT: [number, number, number] = [56, 189, 248];

const WORDMARK_LINES = [
  "  __ _  ___ _ __ | | __ _ _ __   ___",
  " / _` |/ __| '_ \\| |/ _` | '_ \\ / _ \\",
  "| (_| | (__| |_) | | (_| | | | |  __/",
  " \\__,_|\\___| .__/|_|\\__,_|_| |_|\\___|",
  "           |_|",
];

function writeSafely(stream: NodeJS.WritableStream, chunk: string): boolean {
  try {
    stream.write(chunk);
    return true;
  } catch {
    return false;
  }
}

export function renderLogo(style: Style, subtitle?: string): string {
  const art = WORDMARK_LINES.map((line) => paint(line, ACCENT, style)).join("\n");
  return subtitle ? `${art}\n${dim(` ${subtitle}`, style)}\n` : `${art}\n`;
}

export function revealLogo(
  stream: NodeJS.WritableStream & { isTTY?: boolean },
  style: Style,
  subtitle?: string,
): Promise<void> {
  if (!stream.isTTY) {
    writeSafely(stream, renderLogo({ tty: false, color: false, truecolor: false }, subtitle));
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };

    const revealNext = () => {
      if (index < WORDMARK_LINES.length) {
        const line = WORDMARK_LINES[index]!;
        index += 1;
        if (!writeSafely(stream, `${paint(line, ACCENT, style)}\n`)) {
          finish();
          return;
        }
        timer = setTimeout(revealNext, 80);
        return;
      }

      if (subtitle && !writeSafely(stream, `${dim(` ${subtitle}`, style)}\n`)) {
        finish();
        return;
      }
      finish();
    };

    timer = setTimeout(revealNext, 80);
  });
}
