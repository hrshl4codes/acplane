function escapeLiteral(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pathGlobToRegExp(glob: string): RegExp {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]!;
    if (char === "*") {
      if (glob[index + 1] === "*") {
        index += 1;
        if (glob[index + 1] === "/") {
          index += 1;
          pattern += "(?:.*/)?";
        } else {
          pattern += ".*";
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += escapeLiteral(char);
    }
  }
  return new RegExp(`${pattern}$`);
}

export function commandGlobToRegExp(glob: string): RegExp {
  let pattern = "^";
  for (const char of glob) {
    if (char === "*") pattern += ".*";
    else if (char === "?") pattern += ".";
    else pattern += escapeLiteral(char);
  }
  return new RegExp(`${pattern}$`);
}

export function matchesAnyGlob(value: string, globs: string[], kind: "path" | "command"): boolean {
  const compile = kind === "path" ? pathGlobToRegExp : commandGlobToRegExp;
  return globs.some((glob) => compile(glob).test(value));
}
