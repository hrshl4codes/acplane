export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>acplane</title>
<style>
  :root { --bg:#ffffff; --fg:#1a1a1a; --muted:#666; --line:#e3e3e3; --card:#f7f7f8; --accent:#2b6cb0; --deny:#c53030; --allow:#2f855a; }
  @media (prefers-color-scheme:dark) {
    :root { --bg:#161719; --fg:#e8e8e8; --muted:#9aa0a6; --line:#2c2e31; --card:#1e1f22; --accent:#63b3ed; --deny:#fc8181; --allow:#68d391; }
  }
  * { box-sizing:border-box; }
  html { max-width:100%; }
  body { max-width:100%; margin:0; overflow-x:hidden; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  header { display:flex; flex-wrap:wrap; gap:20px; align-items:baseline; padding:14px 20px; border-bottom:1px solid var(--line); }
  header b { font-size:16px; }
  header nav { display:flex; flex-wrap:wrap; gap:20px; }
  header a { color:var(--muted); text-decoration:none; }
  header a:hover { color:var(--fg); }
  header a.active { color:var(--fg); font-weight:600; }
  :focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  main { width:100%; min-width:0; max-width:1100px; margin:0 auto; padding:20px; }
  .table-wrap { width:100%; overflow-x:auto; overscroll-behavior-inline:contain; }
  table { width:100%; min-width:760px; border-collapse:collapse; }
  th,td { padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  th { color:var(--muted); font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
  .session-row:hover td { background:var(--card); }
  .session-link { color:var(--accent); text-decoration:none; }
  .pill { display:inline-block; max-width:100%; padding:1px 8px; overflow-wrap:anywhere; border:1px solid var(--line); border-radius:999px; background:var(--card); font-size:12px; }
  .badge { display:inline-block; padding:1px 6px; border:1px solid var(--line); border-radius:4px; font-size:11px; }
  .deny { color:var(--deny); border-color:var(--deny); }
  .allow { color:var(--allow); border-color:var(--allow); }
  .turn { min-width:0; margin:12px 0; padding:14px; overflow-wrap:anywhere; border:1px solid var(--line); border-radius:8px; background:var(--card); }
  .muted { color:var(--muted); }
  .row { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; }
  .cols { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace; overflow-wrap:anywhere; }
  h2 { margin:6px 0 12px; font-size:18px; line-height:1.35; }
  .est { color:var(--muted); font-size:11px; }
  label { display:inline-flex; align-items:center; gap:6px; }
  select { max-width:min(34vw,320px); padding:6px 8px; border:1px solid var(--line); border-radius:4px; background:var(--bg); color:var(--fg); font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  select:disabled { color:var(--muted); }
  @media (max-width:760px) {
    header { gap:14px; padding:12px 14px; }
    header nav { gap:14px; }
    main { padding:14px; }
    .cols { grid-template-columns:1fr; gap:12px; }
    select { max-width:calc(100vw - 70px); }
  }
  @media (prefers-reduced-motion:reduce) {
    *,*::before,*::after { scroll-behavior:auto !important; transition-duration:.01ms !important; animation-duration:.01ms !important; }
  }
</style>
</head>
<body>
<header>
  <b>acplane</b>
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
const cost = (c) => (c == null ? '<span class="muted">—</span>' : "$" + Number(c).toFixed(2));
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
  const rows = sessions.map((s) => {
    const href = esc("#/session/" + encodeURIComponent(s.id));
    return '<tr class="session-row"><td>' + esc(s.startedAt || "") + '</td><td><a class="session-link" href="' + href + '"><span class="pill">' + esc(s.harness) + '</span></a></td><td>' + esc(s.turnCount) + '</td><td>' + esc(s.toolCallCount) + '</td><td>' + esc(s.fileCount) + '</td><td>' + esc((s.tokensIn || 0) + (s.tokensOut || 0)) + estMark(s.usageSource) + '</td><td>' + cost(s.costUsd) + '</td><td>' + (s.denialCount ? '<span class="badge deny">' + esc(s.denialCount) + '</span>' : "0") + "</td></tr>";
  }).join("");
  commitRoute(generation, routeHeading("Sessions") + tableHtml("Sessions", ["Started", "Harness", "Turns", "Tools", "Files", "Tokens", "Cost", "Denials"], rows), true);
}

function turnHtml(t) {
  const tools = t.toolCalls.map((c) => '<span class="pill">' + esc(c.kind) + ": " + esc(c.title || c.toolCallId) + "</span>").join(" ");
  const files = t.fileTouches.map((f) => '<span class="pill">' + esc(f.mode) + " " + esc(f.path) + "</span>").join(" ");
  const perms = t.permissions.map((p) => {
    const cls = p.decision === "deny" ? " deny" : p.decision === "allow" ? " allow" : "";
    const who = p.decidedBy ? " · " + esc(p.decidedBy) : "";
    const rule = p.rule ? ' <span class="badge">' + esc(p.rule) + "</span>" : "";
    return '<div class="row"><span class="badge' + cls + '">' + esc(p.decision || "pending") + "</span> " + esc(p.toolCallId || "") + who + rule + "</div>";
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
  const rows = entries.map((entry) => "<tr><td><code>" + esc(entry.path) + "</code></td><td>" + esc(entry.readCount) + "</td><td>" + esc(entry.writeCount) + "</td><td>" + entry.sessions.map((session) => '<span class="pill">' + esc(session.harness) + ": " + esc(session.modes.join("/")) + "</span>").join(" ") + "</td></tr>").join("");
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
  const panel = (detail) => detail ? "<section>" + routeHeading(esc(detail.session.harness)) + turnsHtml(detail.turns) + '</section>' : '<div class="muted">Not found</div>';
  const html = routeHeading("Compare") + '<div class="row"><label>A <select id="ca">' + opts(a) + '</select></label><label>B <select id="cb">' + opts(b) + '</select></label></div><div class="cols">' + panel(comparison.a) + panel(comparison.b) + "</div>";
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
