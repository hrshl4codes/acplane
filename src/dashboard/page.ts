export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>acplane</title>
<style>
  :root {
    color-scheme:light;
    --paper:oklch(99% 0.004 240);
    --paper-2:oklch(96% 0.008 240);
    --ink:oklch(22% 0.020 250);
    --muted:oklch(48% 0.025 250);
    --line:oklch(88% 0.012 250);
    --accent:oklch(54% 0.150 230);
    --accent-ink:oklch(99% 0.004 240);
    --focus:var(--accent);
    --ok:oklch(50% 0.140 150);
    --deny:oklch(54% 0.190 25);
    --warn:oklch(52% 0.140 75);
    --accent-soft:color-mix(in oklch,var(--accent) 10%,var(--paper));
    --ok-soft:color-mix(in oklch,var(--ok) 10%,var(--paper));
    --deny-soft:color-mix(in oklch,var(--deny) 10%,var(--paper));
    --warn-soft:color-mix(in oklch,var(--warn) 12%,var(--paper));
    --font-ui:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    --font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
    --text-xs:.6875rem;
    --text-sm:.8125rem;
    --text-md:.875rem;
    --text-lg:1.125rem;
    --text-xl:1.5rem;
    --space-1:4px;
    --space-2:8px;
    --space-3:12px;
    --space-4:16px;
    --space-6:24px;
    --space-8:32px;
    --space-12:48px;
    --radius:8px;
    --radius-pill:999px;
    --ease-out:cubic-bezier(.2,.6,.2,1);
    --dur-fast:120ms;
    --dur:160ms;
    --dur-slow:240ms;
  }
  @media (prefers-color-scheme:dark) {
    :root {
      color-scheme:dark;
      --paper:oklch(17% 0.012 255);
      --paper-2:oklch(22% 0.014 255);
      --ink:oklch(94% 0.010 250);
      --muted:oklch(72% 0.020 250);
      --line:oklch(34% 0.014 255);
      --accent:oklch(76% 0.130 225);
      --accent-ink:oklch(18% 0.012 255);
      --ok:oklch(76% 0.130 150);
      --deny:oklch(74% 0.160 25);
      --warn:oklch(82% 0.130 78);
    }
  }
  * { box-sizing:border-box; }
  html,body { max-width:100%; overflow-x:clip; }
  body { min-height:100dvh; margin:0; font-family:var(--font-ui); font-size:var(--text-md); line-height:1.5; background:var(--paper); color:var(--ink); animation:initial-load var(--dur-slow) var(--ease-out) both; }
  header { display:flex; align-items:stretch; gap:var(--space-12); min-height:88px; padding:0 var(--space-8); border-bottom:1px solid var(--line); background:var(--paper); color:var(--ink); }
  .masthead-brand { display:flex; align-items:center; gap:var(--space-6); min-width:0; }
  .wordmark { color:var(--accent); font-family:var(--font-ui); font-size:var(--text-xl); font-style:normal; font-weight:700; letter-spacing:-.035em; line-height:1; white-space:nowrap; }
  .masthead-context { color:var(--muted); font-size:var(--text-lg); white-space:nowrap; }
  header nav { display:flex; align-items:stretch; flex-wrap:nowrap; gap:var(--space-2); }
  header a { position:relative; display:grid; min-height:44px; padding:0 var(--space-4); place-items:center; color:var(--ink); font-size:var(--text-lg); font-weight:600; text-decoration:none; white-space:nowrap; }
  header a.active { color:var(--ink); }
  header a.active::after { position:absolute; right:0; bottom:0; left:0; height:2px; background:var(--accent); content:""; }
  @media (hover:hover) and (pointer:fine) {
    header a:hover { color:var(--ink); text-decoration:underline; text-decoration-color:var(--accent); text-decoration-thickness:2px; text-underline-offset:var(--space-1); }
    .session-row:hover { transform:translateY(-1px); }
    .session-row:hover td { background:var(--paper-2); color:var(--ink); }
  }
  header a:active { color:var(--ink); }
  :focus-visible { outline:2px solid var(--focus); outline-offset:3px; }
  [data-route-heading]:focus { outline:none; }
  main { width:100%; min-width:0; max-width:96rem; margin:0 auto; padding:var(--space-8); }
  #app > * { animation:route-enter var(--dur) var(--ease-out) both; }
  .table-wrap { width:100%; overflow-x:auto; overscroll-behavior-inline:contain; }
  table { width:100%; min-width:760px; border:1px solid var(--line); border-collapse:collapse; background:var(--paper); color:var(--ink); }
  th,td { padding:var(--space-2) var(--space-3); border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  th { color:var(--muted); font-size:var(--text-xs); font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
  .session-row { transition:transform var(--dur-fast) var(--ease-out); }
  .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin:0 0 var(--space-6); overflow:hidden; border:1px solid var(--line); border-radius:var(--radius); background:var(--paper); }
  .stat { min-width:0; margin:0; padding:var(--space-4) var(--space-6); }
  .stat + .stat { border-inline-start:1px solid var(--line); }
  .stat-label { color:var(--muted); font-size:var(--text-xs); font-weight:700; letter-spacing:.08em; line-height:1.2; text-transform:uppercase; }
  .stat-value { margin:var(--space-2) 0 0; overflow-wrap:anywhere; color:var(--ink); font-family:var(--font-mono); font-size:var(--text-xl); font-variant-numeric:tabular-nums; line-height:1.2; }
  .stat-deny { background:var(--deny-soft); }
  .stat-deny .stat-value { color:var(--deny); }
  .session-data { font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
  .session-link { color:var(--ink); text-decoration:underline; text-decoration-color:var(--accent); text-decoration-thickness:1px; text-underline-offset:3px; white-space:nowrap; }
  .pill { display:inline-block; max-width:100%; padding:var(--space-1) var(--space-2); overflow-wrap:anywhere; border:1px solid var(--line); border-radius:var(--radius-pill); background:var(--paper-2); color:var(--ink); font-family:var(--font-mono); font-size:var(--text-sm); }
  .harness-chip { border-color:var(--accent); background:var(--accent-soft); }
  .badge { display:inline-block; padding:var(--space-1) var(--space-2); border:1px solid var(--line); border-radius:var(--radius); background:var(--paper); color:var(--ink); font-family:var(--font-mono); font-size:var(--text-xs); }
  .session-denial { background:var(--deny-soft); }
  .deny { color:var(--deny); border-color:var(--deny); }
  .allow { color:var(--ok); border-color:var(--ok); }
  .turn { min-width:0; margin:var(--space-3) 0; padding:var(--space-4); overflow-wrap:anywhere; border:1px solid var(--line); border-radius:var(--radius); background:var(--paper-2); color:var(--ink); }
  .perm { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2); margin:var(--space-2) 0; padding:var(--space-2) var(--space-3); border-left:3px solid var(--warn); border-radius:var(--radius); background:var(--warn-soft); color:var(--ink); }
  .perm-deny { border-left-color:var(--deny); background:var(--deny-soft); color:var(--ink); }
  .perm-allow { border-left-color:var(--ok); background:var(--ok-soft); color:var(--ink); }
  .perm-warn { border-left-color:var(--warn); background:var(--warn-soft); color:var(--ink); }
  .perm-decision { background:var(--paper); color:var(--ink); font-weight:700; }
  .perm-deny .perm-decision { border-color:var(--deny); color:var(--deny); }
  .perm-allow .perm-decision { border-color:var(--ok); color:var(--ok); }
  .perm-warn .perm-decision { border-color:var(--warn); color:var(--warn); }
  .perm-rule { background:var(--paper); color:var(--ink); }
  .perm-meta { color:var(--muted); font-size:var(--text-xs); }
  .perm-tool { font-family:var(--font-mono); font-size:var(--text-sm); }
  .lineage-path { font-family:var(--font-mono); }
  .count-chip { display:inline-flex; align-items:baseline; gap:var(--space-1); padding:var(--space-1) var(--space-2); border:1px solid var(--line); border-radius:var(--radius-pill); font-family:var(--font-mono); font-size:var(--text-xs); font-variant-numeric:tabular-nums; }
  .count-label { font-family:var(--font-ui); font-size:var(--text-xs); font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
  .count-read { border-color:var(--muted); background:var(--paper-2); color:var(--muted); }
  .count-write { border-color:var(--warn); background:var(--warn-soft); color:var(--warn); }
  .compare-controls { display:flex; flex-wrap:wrap; gap:var(--space-2); margin:0 0 var(--space-4); }
  .compare-panel { min-width:0; padding:var(--space-4); border:1px solid var(--line); border-radius:var(--radius); background:var(--paper-2); color:var(--ink); }
  .compare-panel-header { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2); min-width:0; margin:0 0 var(--space-3); padding:0 0 var(--space-3); border-bottom:1px solid var(--line); font-family:var(--font-ui); font-size:var(--text-md); font-style:normal; font-weight:700; line-height:1.2; }
  .compare-panel-id { min-width:0; overflow-wrap:anywhere; color:var(--muted); font-family:var(--font-mono); font-size:var(--text-sm); }
  .muted { color:var(--muted); }
  .row { display:flex; flex-wrap:wrap; gap:var(--space-2); margin:var(--space-2) 0; }
  .cols { position:relative; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:var(--space-4); }
  .cols::before { position:absolute; top:var(--space-4); bottom:var(--space-4); left:50%; width:1px; background:var(--line); content:""; pointer-events:none; }
  code { font-family:var(--font-mono); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  h2 { min-width:0; margin:var(--space-2) 0 var(--space-4); overflow-wrap:anywhere; font-family:var(--font-ui); font-size:var(--text-xl); font-style:normal; font-weight:700; letter-spacing:-.025em; line-height:1.2; }
  .est { color:var(--muted); font-size:var(--text-xs); }
  label { display:inline-flex; align-items:center; gap:var(--space-2); }
  select { max-width:min(34vw,320px); min-height:44px; padding:var(--space-2) var(--space-3); border:1px solid var(--muted); border-radius:var(--radius); background:var(--paper); color:var(--ink); font-family:var(--font-ui); font-size:var(--text-sm); line-height:1.5; }
  select:disabled { color:var(--muted); cursor:not-allowed; opacity:.55; }
  @keyframes initial-load { from { opacity:0; } to { opacity:1; } }
  @keyframes route-enter { from { opacity:0; } to { opacity:1; } }
  @media (max-width:48rem) {
    header { display:block; min-height:0; padding:0 var(--space-4); }
    .masthead-brand { min-height:64px; gap:var(--space-3); }
    .wordmark { font-size:var(--text-xl); }
    .masthead-context { overflow:hidden; font-size:var(--text-sm); text-overflow:ellipsis; }
    header nav { width:100%; }
    header a { flex:1; min-width:0; padding:0 var(--space-1); font-size:var(--text-md); }
    main { padding:var(--space-4); }
    .stat { padding:var(--space-3); }
    .stat-value { font-size:var(--text-lg); }
    .compare-controls { display:grid; grid-template-columns:minmax(0,1fr); }
    .compare-controls label,.row > label { width:100%; min-width:0; }
    .cols { grid-template-columns:minmax(0,1fr); gap:var(--space-3); }
    .cols::before { content:none; }
    select { width:100%; max-width:100%; min-width:0; }
  }
  @media (prefers-reduced-motion:reduce) {
    *,*::before,*::after { scroll-behavior:auto !important; }
    body,#app > * { animation:none; }
    .session-row,.session-row:hover { transform:none; transition:none; }
  }
</style>
</head>
<body>
<header>
  <div class="masthead-brand">
    <strong class="wordmark">acplane</strong>
    <span class="masthead-context">Agent session observability</span>
  </div>
  <nav aria-label="Dashboard">
    <a href="#/" data-route="#/">Sessions</a>
    <a href="#/lineage" data-route="#/lineage">Lineage</a>
    <a href="#/compare" data-route="#/compare">Compare</a>
  </nav>
</header>
<main id="app"><p class="muted" role="status">Loading…</p></main>
<script>
const app = document.getElementById("app");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
const j = (url, signal) => fetch(url, { signal }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
const cost = (c) => {
  if (c == null) return '<span class="muted">—</span>';
  const value = Number(c);
  return value > 0 && value < 0.01 ? "&lt;$0.01" : "$" + value.toFixed(2);
};
const token = (value) => value == null ? "—" : esc(value);
const estMark = (src) => (src === "estimated" || src === "mixed") ? ' <span class="est">(' + esc(src) + ')</span>' : "";
const emptyRow = (columns) => '<tr><td colspan="' + columns + '" class="muted">—</td></tr>';
const emptyTimeline = '<p class="muted">—</p>';
const routeHeading = (content) => '<h2 tabindex="-1" data-route-heading>' + content + "</h2>";
let routeGeneration = 0;
let routeController = null;

function currentTab(hash) {
  const path = hash.slice(1).split("?")[0];
  if (path === "/lineage") return "#/lineage";
  if (path === "/compare") return "#/compare";
  return "#/";
}

function setActive(hash) {
  const tab = currentTab(hash);
  document.querySelectorAll("header a").forEach((a) => {
    const active = a.getAttribute("data-route") === tab;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function commitRoute(generation, html, focusHeading) {
  if (generation !== routeGeneration) return false;
  app.innerHTML = html;
  if (focusHeading) app.querySelector("[data-route-heading]")?.focus();
  return true;
}

function tableHtml(label, headings, rows) {
  return '<div class="table-wrap" role="region" aria-label="' + esc(label) + '" tabindex="0"><table><thead><tr>' +
    headings.map((heading) => "<th scope=col>" + esc(heading) + "</th>").join("") +
    "</tr></thead><tbody>" + (rows || emptyRow(headings.length)) + "</tbody></table></div>";
}

async function sessionsView(generation, signal) {
  const sessions = await j("/api/sessions", signal);
  const totalCost = sessions.reduce((n, s) => n + (s.costUsd || 0), 0);
  const anyCost = sessions.some((s) => s.costUsd != null);
  const denials = sessions.reduce((n, s) => n + (s.denialCount || 0), 0);
  const stats = '<div class="stats" role="group" aria-label="Session summary">' +
    '<dl class="stat"><dt class="stat-label">Sessions</dt><dd class="stat-value">' + esc(sessions.length) + "</dd></dl>" +
    '<dl class="stat"><dt class="stat-label">Cost</dt><dd class="stat-value">' + cost(anyCost ? totalCost : null) + "</dd></dl>" +
    '<dl class="stat' + (denials > 0 ? " stat-deny" : "") + '"><dt class="stat-label">Denials</dt><dd class="stat-value">' + esc(denials) + "</dd></dl></div>";
  const rows = sessions.map((s) => {
    const href = esc("#/session/" + encodeURIComponent(s.id));
    const label = esc("Open " + s.harness + " session " + s.id);
    return '<tr class="session-row"><td class="session-data">' + esc(s.startedAt || "") + '</td><td><a class="session-link" href="' + href + '" aria-label="' + label + '"><span class="pill harness-chip">' + esc(s.harness) + '</span></a></td><td class="session-data">' + esc(s.turnCount) + '</td><td class="session-data">' + esc(s.toolCallCount) + '</td><td class="session-data">' + esc(s.fileCount) + '</td><td class="session-data">' + esc((s.tokensIn || 0) + (s.tokensOut || 0)) + estMark(s.usageSource) + '</td><td class="session-data">' + cost(s.costUsd) + '</td><td class="session-data">' + (s.denialCount ? '<span class="badge deny session-denial">' + esc(s.denialCount) + '</span>' : "0") + "</td></tr>";
  }).join("");
  commitRoute(generation, routeHeading("Sessions") + stats + tableHtml("Sessions", ["Started", "Harness", "Turns", "Tools", "Files", "Tokens", "Cost", "Denials"], rows), true);
}

function turnHtml(t) {
  const tools = t.toolCalls.map((c) => '<span class="pill">' + esc(c.kind) + ": " + esc(c.title || c.toolCallId) + "</span>").join(" ");
  const files = t.fileTouches.map((f) => '<span class="pill">' + esc(f.mode) + " " + esc(f.path) + "</span>").join(" ");
  const perms = t.permissions.map((p) => {
    const cls = p.decision === "deny" ? "perm-deny" : p.decision === "allow" ? "perm-allow" : "perm-warn";
    const who = p.decidedBy ? '<span class="perm-meta"> · ' + esc(p.decidedBy) + "</span>" : "";
    const rule = p.rule ? ' <span class="badge perm-rule">' + esc(p.rule) + "</span>" : "";
    return '<div class="perm ' + cls + '"><span class="badge perm-decision">' + esc(p.decision || "pending") + '</span> <code class="perm-tool">' + esc(p.toolCallId || "") + "</code>" + who + rule + "</div>";
  }).join("");
  const usage = t.usageSource ? '<span class="muted">' + token(t.tokensIn) + " in / " + token(t.tokensOut) + " out · " + cost(t.costUsd) + estMark(t.usageSource) + "</span>" : "";
  return '<article class="turn"><b>Turn ' + esc(t.seq) + "</b> " + usage + '<div class="row muted"><code>' + esc(t.prompt) + "</code></div>" + (tools ? '<div class="row">' + tools + "</div>" : "") + (files ? '<div class="row">' + files + "</div>" : "") + perms + "</article>";
}

function turnsHtml(turns) {
  return turns.length ? turns.map(turnHtml).join("") : emptyTimeline;
}

async function detailView(id, generation, signal) {
  const detail = await j("/api/sessions/" + encodeURIComponent(id), signal);
  commitRoute(generation, routeHeading(esc(detail.session.harness) + ' · <span class="muted"><code>' + esc(detail.session.id) + "</code></span>") + turnsHtml(detail.turns), true);
}

async function lineageView(generation, signal) {
  const entries = await j("/api/lineage", signal);
  const rows = entries.map((entry) => "<tr><td><code class=\"lineage-path\">" + esc(entry.path) + "</code></td><td><span class=\"count-chip count-read\"><span class=\"count-label\">Read</span><span class=\"count-value\">" + esc(entry.readCount) + "</span></span></td><td><span class=\"count-chip count-write\"><span class=\"count-label\">Write</span><span class=\"count-value\">" + esc(entry.writeCount) + "</span></span></td><td>" + entry.sessions.map((session) => {
    const href = esc("#/session/" + encodeURIComponent(session.sessionId));
    return '<span class="pill"><a class="session-link" href="' + href + '"><code>' + esc(session.sessionId) + "</code></a> · " + esc(session.harness) + ": " + esc(session.modes.join("/")) + "</span>";
  }).join(" ") + "</td></tr>").join("");
  commitRoute(generation, routeHeading("File lineage") + tableHtml("File lineage", ["File", "Reads", "Writes", "Sessions"], rows), true);
}

function compareIds(sessions, requestedA, requestedB) {
  const ids = sessions.map((session) => String(session.id));
  if (!ids.length) return [null, null];
  const validA = ids.includes(requestedA) ? requestedA : null;
  const validB = ids.includes(requestedB) ? requestedB : null;
  const a = validA || (validB && ids.find((id) => id !== validB)) || ids[0];
  const b = validB || ids.find((id) => id !== a) || a;
  return [a, b];
}

async function compareView(params, generation, signal) {
  const sessions = await j("/api/sessions", signal);
  const [a, b] = compareIds(sessions, params.get("a"), params.get("b"));
  if (!a || !b) {
    commitRoute(generation, routeHeading("Compare") + '<div class="row"><label>A <select id="ca" disabled><option>—</option></select></label><label>B <select id="cb" disabled><option>—</option></select></label></div>' + emptyTimeline, true);
    return;
  }

  const opts = (selected) => sessions.map((session) => '<option value="' + esc(session.id) + '"' + (selected === String(session.id) ? " selected" : "") + ">" + esc(session.harness) + " · " + esc(session.id) + "</option>").join("");
  const comparison = await j("/api/compare?a=" + encodeURIComponent(a) + "&b=" + encodeURIComponent(b), signal);
  const panel = (detail, label) => detail ? '<section class="compare-panel" aria-labelledby="compare-panel-' + label.toLowerCase() + '"><h3 class="compare-panel-header" id="compare-panel-' + label.toLowerCase() + '"><span class="pill harness-chip">' + esc(detail.session.harness) + '</span><code class="compare-panel-id">' + esc(detail.session.id) + "</code></h3>" + turnsHtml(detail.turns) + '</section>' : '<section class="compare-panel" aria-labelledby="compare-panel-' + label.toLowerCase() + '"><h3 class="compare-panel-header" id="compare-panel-' + label.toLowerCase() + '">' + esc(label) + ': Not found</h3><p class="muted">Not found</p></section>';
  const html = routeHeading("Compare") + '<div class="compare-controls"><label>A <select id="ca">' + opts(a) + '</select></label><label>B <select id="cb">' + opts(b) + '</select></label></div><div class="cols">' + panel(comparison.a, "A") + panel(comparison.b, "B") + "</div>";
  if (!commitRoute(generation, html, true)) return;

  const first = document.getElementById("ca");
  const second = document.getElementById("cb");
  first.value = a;
  second.value = b;
  const go = () => { location.hash = "#/compare?a=" + encodeURIComponent(first.value) + "&b=" + encodeURIComponent(second.value); };
  first.onchange = go;
  second.onchange = go;
}

async function route() {
  const generation = ++routeGeneration;
  routeController?.abort();
  const controller = new AbortController();
  routeController = controller;
  const hash = location.hash || "#/";
  setActive(hash);
  commitRoute(generation, '<p class="muted" role="status">Loading…</p>', false);
  try {
    const [path, query] = hash.slice(1).split("?");
    const params = new URLSearchParams(query || "");
    if (path.startsWith("/session/")) await detailView(decodeURIComponent(path.slice("/session/".length)), generation, controller.signal);
    else if (path === "/lineage") await lineageView(generation, controller.signal);
    else if (path === "/compare") await compareView(params, generation, controller.signal);
    else await sessionsView(generation, controller.signal);
  } catch (err) {
    if (generation !== routeGeneration || controller.signal.aborted) return;
    commitRoute(generation, '<p class="muted" role="alert">Failed to load (' + esc(err) + ").</p>", false);
  }
}

addEventListener("hashchange", route);
route();
</script>
</body>
</html>`;
