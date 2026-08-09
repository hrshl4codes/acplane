// High-confidence secret shapes only, to avoid corrupting ordinary content.
const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /Bearer\s+[A-Za-z0-9._~+\/-]{20,}=*/gi,
];

export function redactSecrets(raw: string): string {
  let result = raw;
  for (const pattern of PATTERNS) result = result.replace(pattern, "[REDACTED]");
  return result;
}
