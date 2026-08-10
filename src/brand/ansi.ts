export interface Style {
  tty: boolean;
  color: boolean;
  truecolor: boolean;
}

export const HIDE_CURSOR = "\x1b[?25l";
export const SHOW_CURSOR = "\x1b[?25h";
export const CLEAR_LINE = "\r\x1b[2K";

export function detectStyle(
  stream: { isTTY?: boolean },
  env: Record<string, string | undefined> = process.env,
): Style {
  const tty = Boolean(stream.isTTY);
  const color = tty && !("NO_COLOR" in env) && env["TERM"] !== "dumb";
  const truecolor = color && (env["COLORTERM"] === "truecolor" || env["COLORTERM"] === "24bit");
  return { tty, color, truecolor };
}

export function paint(text: string, rgb: [number, number, number], style: Style): string {
  if (!style.color) return text;
  if (style.truecolor) return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
  return `\x1b[36m${text}\x1b[39m`;
}

export function bold(text: string, style: Style): string {
  return style.color ? `\x1b[1m${text}\x1b[22m` : text;
}

export function dim(text: string, style: Style): string {
  return style.color ? `\x1b[2m${text}\x1b[22m` : text;
}
