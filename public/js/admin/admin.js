// Monitoring dashboard. Sign in with an account made on the server (python -m app.admin create-user NAME).
// The session token is kept in sessionStorage (cleared when the tab closes) and sent as a Bearer header.
import { API_BASE } from "../config.js";
import { notify, showError } from "../ui/notify.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TOKEN_KEY = "umlforge-admin-token";
const cpuHistory = []; // client-side, while the page is open
let timer = null;

// ---- API -----------------------------------------------------------------------------------------

const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
const setToken = (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { title: "Can't reach the backend", message: "The server didn't answer.", hint: "Check that it is running." };
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { ...(data.error || { title: `Request failed (${res.status})` }), status: res.status };
  return data;
}

// ---- formatting ----------------------------------------------------------------------------------

function bytes(n) {
  if (n == null) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${units[i]}`;
}
function duration(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
const ms = (v) => (v == null ? "–" : `${Math.round(v)} ms`);
const ago = (t) => { const s = Date.now() / 1000 - t; return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
const row = (k, v) => `<div class="row"><span>${esc(k)}</span><span>${v}</span></div>`;

function meter(label, used, total) {
  if (!total) return row(label, "unavailable");
  const pct = Math.round((used / total) * 100);
  const level = pct >= 90 ? "full" : pct >= 80 ? "high" : "";
  const flag = level ? `<span class="flag ${level}">${level === "full" ? "Critical" : "High"}</span>` : "";
  return `<div class="meter"><div class="meterHead"><span>${esc(label)}</span><span>${bytes(used)} of ${bytes(total)} · ${pct}%${flag}</span></div>
    <div class="meterBar" role="meter" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><i class="${level}" style="width:${pct}%"></i></div></div>`;
}

/** Single-series sparkline (one hue, 2px line) with a hover crosshair and value readout. */
function sparkline(el, points, format) {
  const values = points.map((p) => p.value).filter((v) => v != null);
  if (values.length < 2) { el.innerHTML = '<div class="empty">Collecting data…</div>'; return; }
  const W = 240, H = 46, max = Math.max(...values, 1), n = points.length;
  const x = (i) => (i / (n - 1)) * W, y = (v) => H - 3 - (v / max) * (H - 8);
  let d = "", started = false;
  points.forEach((p, i) => { if (p.value == null) { started = false; return; } d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`; started = true; });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="trend">
      <line x1="0" y1="${H - 3}" x2="${W}" y2="${H - 3}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      <path d="${d}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <line class="xh" x1="0" x2="0" y1="0" y2="${H}" stroke="#9a9a9a" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/>
      <circle class="dot" r="3.5" fill="var(--series)" stroke="#fff" stroke-width="2" visibility="hidden"/>
    </svg><div class="sparkTip" hidden></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".sparkTip"), xh = el.querySelector(".xh"), dot = el.querySelector(".dot");
  el.onmousemove = (e) => {
    const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    const p = points[i];
    if (p.value == null) return;
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.value)); dot.setAttribute("visibility", "visible");
    tip.hidden = false; tip.style.left = `${(x(i) / W) * 100}%`; tip.textContent = `${p.label} · ${format(p.value)}`;
  };
  el.onmouseleave = () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); };
}

// ---- render ----------------------------------------------------------------------------------

function renderStatus(s) {
  // state: "ok" | "warn" | "bad" -> icon + word, never color alone
  const WORD = { ok: "Up", warn: "Degraded", bad: "Down" }, ICON = { ok: "✓", warn: "!", bad: "✕" };
  const pill = (name, ok, sub, state = ok ? "ok" : "bad") => `<span class="pill ${state}"><span class="ic" aria-hidden="true">${ICON[state]}</span>
    <b>${esc(name)}</b><span>${WORD[state]}</span>${sub ? `<span class="sub">· ${esc(sub)}</span>` : ""}</span>`;
  const ai = s.ai, aiState = !ai.ok ? "bad" : ai.degraded ? "warn" : "ok";
  $("statusRow").innerHTML = [
    pill("API", s.api.ok, ""),
    pill("Database", s.database.ok, `${s.database.kind || ""}${s.database.query_ms != null ? ` · ${ms(s.database.query_ms)}` : ""}`),
    pill("AI", ai.ok, aiState === "ok" ? `${ai.provider} · ${ai.model} · ${ms(ai.latency_ms)}`
      : aiState === "warn" ? `${ai.degraded} (${ai.failures_10m} failures in 10 min)` : (ai.problem || "").slice(0, 90), aiState),
    pill("Rate limiter", s.rate_limiter.ok, s.rate_limiter.kind),
  ].join("");
}

function render(m) {
  renderStatus(m.services);
  const t = m.traffic, sys = m.system, st = m.storage;
  $("whoami").textContent = m.user;
  $("updated").textContent = `Updated ${new Date(m.at * 1000).toLocaleTimeString()} · up ${duration(t.uptime_s)}`;

  const minuteLabel = (h) => (h.minute ? `${h.minute} min ago` : "this minute");
  $("tRpm").textContent = t.per_min;
  sparkline($("sRpm"), t.history.map((h) => ({ value: h.requests, label: minuteLabel(h) })), (v) => `${v} requests`);
  $("tP95").textContent = ms(t.p95_ms_5m);
  sparkline($("sP95"), t.history.map((h) => ({ value: h.p95_ms, label: minuteLabel(h) })), ms);

  cpuHistory.push({ value: sys.cpu_percent, label: new Date().toLocaleTimeString() });
  if (cpuHistory.length > 60) cpuHistory.shift();
  $("tCpu").textContent = sys.cpu_percent == null ? "–" : `${sys.cpu_percent}%`;
  sparkline($("sCpu"), cpuHistory, (v) => `${v}%`);

  $("tErr").textContent = t.errors_5m;
  $("tErrSub").textContent = `${t.client_errors_5m} client errors · ${t.rate_limited_total} rate-limited since start`;

  const mem = sys.memory, cmem = sys.container_memory, disk = sys.disk;
  $("systemBox").innerHTML = [
    sys.load ? row("Load (1 / 5 / 15 min)", `${sys.load.join(" / ")} on ${sys.cpu_count} CPUs`) : row("Load", "unavailable"),
    mem ? meter("Memory (server)", mem.total - mem.available, mem.total) : row("Memory (server)", "unavailable"),
    cmem?.limit ? meter("Memory (container limit)", cmem.used, cmem.limit) : "",
    row("Backend process memory", bytes(sys.process_rss)),
    disk ? meter("Disk (data folder)", disk.used, disk.total) : row("Disk", "unavailable"),
    row("Host", `${esc(sys.host)} · ${esc(sys.os)} · Python ${esc(sys.python)}`),
  ].join("");

  $("storageBox").innerHTML = st.error ? row("Database", `<span class="lvl error">Down</span> ${esc(st.error)}`) : [
    row("Database", `${esc(st.kind)} · ${bytes(st.size_bytes)}`),
    row("Query time", ms(st.query_ms)),
    row("Saved diagrams", st.diagrams),
    row("Published links (active)", st.active_links),
    row("Expired links waiting for cleanup", st.expired_links),
    row("Admin accounts", st.admin_users),
  ].join("");

  const areas = Object.entries(t.areas);
  $("areaTable").innerHTML = areas.length
    ? `<tr><th>Area</th><th class="num">Requests</th><th class="num">5xx</th><th class="num">p95</th></tr>`
      + areas.map(([k, a]) => `<tr><td>${esc(k)}</td><td class="num">${a.requests}</td><td class="num">${a.errors}</td><td class="num">${ms(a.p95_ms)}</td></tr>`).join("")
    : `<tr><td class="muted">No requests in the last 5 minutes.</td></tr>`;

  const L = m.limits, rate = ([n, s]) => `${n} per ${s >= 3600 ? `${s / 3600} h` : s >= 60 ? `${s / 60} min` : `${s} s`}`;
  $("limitsBox").innerHTML = [row("Publish links (per IP)", rate(L.publish)), row("Open links (per IP)", rate(L.view)),
    row("AI requests (per IP)", rate(L.ai)), row("Longest link lifetime", `${L.share_max_hours} h`),
    row("Total requests since start", t.total)].join("");

  $("errCount").textContent = m.errors.length ? `(${m.errors.length})` : "";
  $("errorTable").innerHTML = m.errors.length
    ? `<tr><th>When</th><th>Level</th><th>Where</th><th>What</th><th>Details</th></tr>` + m.errors.map((e) =>
      `<tr><td title="${new Date(e.at * 1000).toLocaleString()}">${ago(e.at)}</td><td><span class="lvl ${esc(e.level)}">${esc(e.level)}</span> ${e.status}</td>
        <td>${esc(e.path)}</td><td>${esc(e.title)}</td><td class="details">${esc(e.details)}</td></tr>`).join("")
    : `<tr><td class="muted">Nothing went wrong since the backend started.</td></tr>`;
}

// ---- flow ------------------------------------------------------------------------------------

async function refresh() {
  try {
    render(await call("GET", "/api/admin/metrics"));
  } catch (err) {
    if (err.status === 401) return signOut(false);
    showError(err, "Couldn't load metrics");
  }
}

function schedule() {
  clearInterval(timer);
  const s = Number($("refreshSel").value);
  if (s) timer = setInterval(refresh, s * 1000);
}

function showDashboard() {
  $("loginView").hidden = true;
  $("dashView").hidden = false;
  refresh();
  schedule();
}

async function signOut(callServer = true) {
  clearInterval(timer);
  if (callServer) await call("POST", "/api/admin/logout").catch(() => {});
  setToken("");
  $("dashView").hidden = true;
  $("loginView").hidden = false;
  if (!callServer) notify({ type: "info", title: "Please sign in again", message: "Your session ended." });
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginBtn").disabled = true;
  try {
    const s = await call("POST", "/api/admin/login", { username: $("loginUser").value, password: $("loginPass").value });
    setToken(s.token);
    $("loginPass").value = "";
    showDashboard();
  } catch (err) {
    showError(err, "Sign-in failed");
  } finally {
    $("loginBtn").disabled = false;
  }
});
$("logoutBtn").addEventListener("click", () => signOut(true));
$("refreshSel").addEventListener("change", schedule);
if (token()) showDashboard();
