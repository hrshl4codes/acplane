<!-- Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 -->
# Design — acplane dashboard

Locked design system. Future Hallmark runs read this file first and defer to it.
Amend intentionally; this file is the visual contract, not a runtime dependency.

## System

- Genre · modern-minimal developer observability UI
- Audience · engineers reviewing coding-agent sessions across harnesses
- Use · scan sessions, inspect a timeline, trace file lineage, and compare sessions
- Tone · technical, utilitarian, calm, and read-only
- Macrostructure · Stat-Led app adaptation; summary before detail, with no hero or footer apparatus
- Theme · custom (vibe: "cool precise sky-cyan instrumentation")
- Axes · light-and-dark parity / system sans + mono / cool sky-cyan accent

## Runtime boundary

`src/dashboard/page.ts` remains one self-contained `DASHBOARD_HTML` string. Its
inline `<style>` is the runtime source of truth for these tokens. Do not add
`tokens.css`, external fonts, remote images, runtime design assets, or a design
dependency. Preserve the existing inline script's data, routing, focus, abort,
escaping, and accessibility behavior when applying this system.

## Standalone marketing-site variant

The separately deployed static site under `site/` may amplify this system for
brand communication without changing the dashboard runtime contract:

- Macrostructure · Workbench; the protocol map opens the page and the real
  dashboard capture is the central product proof.
- Display · Space Grotesk 700 for the wordmark and major headings.
- Body · IBM Plex Sans 400/600 for prose and navigation.
- Mono · JetBrains Mono 400/600 for protocol methods, paths, commands, and data.
- Layout · the same 4 px foundation, expanded to 40/64/96/144 px section steps
  so marketing rhythm can move between dense technical detail and large proof.
- Colour · preserve the cool sky-cyan accent and semantic status colours; one
  stable dark ink band is allowed around the dashboard capture.
- Assets · only the real local dashboard capture and code-native HTML/CSS/SVG.
  No remote product imagery, fake browser chrome, or invented proof.

## Tokens (locked reference)

```css
:root {
  --paper: oklch(99% 0.004 240);
  --paper-2: oklch(96% 0.008 240);
  --ink: oklch(22% 0.020 250);
  --muted: oklch(48% 0.025 250);
  --line: oklch(88% 0.012 250);
  --accent: oklch(54% 0.150 230);
  --accent-ink: oklch(99% 0.004 240);
  --focus: var(--accent);

  --ok: oklch(50% 0.140 150);
  --deny: oklch(54% 0.190 25);
  --warn: oklch(52% 0.140 75);
  --accent-soft: color-mix(in oklch, var(--accent) 10%, var(--paper));
  --ok-soft: color-mix(in oklch, var(--ok) 10%, var(--paper));
  --deny-soft: color-mix(in oklch, var(--deny) 10%, var(--paper));
  --warn-soft: color-mix(in oklch, var(--warn) 12%, var(--paper));

  --font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --text-xs: 0.6875rem;
  --text-sm: 0.8125rem;
  --text-md: 0.875rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;

  --radius: 8px;
  --radius-pill: 999px;
  --ease-out: cubic-bezier(0.2, 0.6, 0.2, 1);
  --dur-fast: 120ms;
  --dur: 160ms;
  --dur-slow: 240ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper: oklch(17% 0.012 255);
    --paper-2: oklch(22% 0.014 255);
    --ink: oklch(94% 0.010 250);
    --muted: oklch(72% 0.020 250);
    --line: oklch(34% 0.014 255);
    --accent: oklch(76% 0.130 225);
    --accent-ink: oklch(18% 0.012 255);
    --ok: oklch(76% 0.130 150);
    --deny: oklch(74% 0.160 25);
    --warn: oklch(82% 0.130 78);
  }
}
```

## Typography and data

- Use `--font-ui` for the wordmark, headings, controls, labels, and prose.
- Use `--font-mono` for identifiers, paths, tokens, counts, costs, and event data.
- Numeric data uses `font-variant-numeric: tabular-nums`.
- Headings are upright and compact; do not add display fonts or italic emphasis.

## Information hierarchy

- Masthead · wordmark, one-line context, then the existing primary routes.
- Sessions · honest aggregate stat tiles before the session table.
- Timeline · compact turn cards; permissions are the strongest governance signal.
- Lineage and compare · mono paths and IDs, aligned counts, regular grid structure.
- Accent is interactive/brand only. `--ok`, `--deny`, and `--warn` communicate data
  semantics and must never be replaced by the accent.

## Interaction and motion

- Primary action · `--accent` fill, `--accent-ink` text, `--radius`, 8px/12px rhythm.
- Secondary action · quiet outline or ghost treatment using `--line`.
- Focus · instant visible `--focus` ring with at least 3:1 adjacent contrast.
- Motion · restrained to opacity/transform, at most three primitives, using locked durations.
- Reduced motion · collapse spatial motion to an opacity change no longer than 150ms.

## Exports

There is no separate runtime export. Keep the token block inline in
`src/dashboard/page.ts`; this document records the contract for implementation
and future Hallmark runs. The hard self-contained string architecture takes
precedence over Hallmark's usual `tokens.css` export.
