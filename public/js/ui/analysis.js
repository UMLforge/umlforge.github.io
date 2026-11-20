// Analyze pane: rule-based scores from the backend, plus a short structured AI review.
import { api } from "../api.js";
import { DEBUG } from "../config.js";
import { centerOn } from "../canvas/camera.js";
import { nodeById, select } from "../model/diagram.js";
import { isClassLike } from "../shapes/registry.js";
import { store } from "../store.js";
import { $, esc, switchPane } from "./dom.js";
import { showError } from "./notify.js";

const CIRCUMFERENCE = 2 * Math.PI * 42;
const scoreColor = (v) => (v >= 80 ? "#16a34a" : v >= 65 ? "#bf4d22" : v >= 50 ? "#d97706" : "#dc2626");
const GRADE_COLORS = { S: "#16a34a", A: "#16a34a", B: "#bf4d22", C: "#d97706" };
const AI_SEVERITY = { critical: "crit", major: "warn", minor: "info" };

function highlight(ids) {
  const found = ids.filter((id) => nodeById(id));
  select(found);
  const n = nodeById(found[0]);
  if (n) centerOn(n.x + n.w / 2, n.y + n.h / 2);
}

function highlightButton(ids) {
  const b = document.createElement("button");
  b.className = "abtn small"; b.textContent = "Highlight";
  b.addEventListener("click", () => highlight(ids));
  return b;
}

// ---- rule-based analysis ------------------------------------------------------------

const FILTERS = [["all", "All"], ["crit", "Critical"], ["warn", "Warnings"], ["info", "Info"]];
let lastIssues = [], filter = "all";

/** One line per issue; click to expand the details and the fix. */
function renderIssue(issue) {
  const el = document.createElement("details");
  el.className = `issue ${issue.sev}`;
  el.innerHTML = `<summary><span class="sevDot"></span><span class="ttl">${esc(issue.title)}</span>${issue.tag ? `<span class="tag">${esc(issue.tag)}</span>` : ""}</summary>
    <div class="body"><div class="det">${esc(issue.detail)}</div><div class="fix"><b>Fix:</b> ${esc(issue.fix)}</div></div>`;
  if (issue.ids.length) el.querySelector(".body").appendChild(highlightButton(issue.ids));
  return el;
}

function renderIssues() {
  const counts = { all: lastIssues.length, crit: 0, warn: 0, info: 0 };
  lastIssues.forEach((i) => { counts[i.sev]++; });
  $("issueCount").textContent = lastIssues.length || "";
  $("issueFilter").innerHTML = FILTERS.filter(([k]) => k === "all" || counts[k])
    .map(([k, label]) => `<button class="chip${k === filter ? " on" : ""}" data-filter="${k}">${label} ${counts[k]}</button>`).join("");
  const list = $("issueList"), shown = lastIssues.filter((i) => filter === "all" || i.sev === filter);
  list.innerHTML = shown.length ? "" : '<div class="muted">No issues found. Now stress-test multiplicities and where behavior lives.</div>';
  shown.forEach((i) => list.appendChild(renderIssue(i)));
}

function renderResult(r) {
  $("localCard").hidden = false;
  $("issueCard").hidden = false;
  const arc = $("donutArc");
  arc.setAttribute("stroke-dasharray", `${(CIRCUMFERENCE * r.overall) / 100} ${CIRCUMFERENCE}`);
  arc.setAttribute("stroke", scoreColor(r.overall));
  $("donutText").textContent = r.overall;
  $("qualityNum").textContent = `${r.overall} / 100`;
  $("flawNum").textContent = `${r.flaw} / 100`;
  const badge = $("gradeBadge");
  badge.textContent = `Grade ${r.grade}`;
  badge.style.background = GRADE_COLORS[r.grade] || "#dc2626";

  $("dimList").innerHTML = Object.entries(r.dims).map(([k, v]) =>
    `<div class="dimRow"><div class="dimHead"><span>${esc(k)}</span><span>${v}</span></div><div class="dimBar"><i style="width:${v}%"></i></div></div>`).join("");

  lastIssues = r.issues;
  if (filter !== "all" && !r.issues.some((i) => i.sev === filter)) filter = "all";
  renderIssues();
}

const reveal = (id) => $(id).scrollIntoView({ behavior: "smooth", block: "start" });

async function runAnalysis() {
  switchPane("analyzePane");
  try { renderResult(await api.analyze(store.doc)); reveal("localCard"); }
  catch (err) { showError(err, "Analysis failed"); }
}

// ---- AI review -------------------------------------------------------------------------

/** Maps class names the AI mentions back to node ids on the canvas. */
function idsForNames(names) {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  return store.doc.nodes.filter((n) => isClassLike(n) && wanted.has((n.name || "").toLowerCase())).map((n) => n.id);
}

function renderReview(r) {
  const out = $("aiOut");
  out.innerHTML = `<div class="aiHead">
      <span class="gradeBadge" style="background:${GRADE_COLORS[r.grade] || "#dc2626"}">Grade ${esc(r.grade)}${r.score != null ? ` · ${r.score}` : ""}</span>
      <span class="aiVerdict">${esc(r.verdict)}</span></div>`;
  if (r.fixes.length) {
    const list = document.createElement("div");
    r.fixes.forEach((f) => {
      const el = document.createElement("div");
      el.className = `issue ${AI_SEVERITY[f.severity] || "warn"}`;
      el.innerHTML = `<div class="sev">${esc(f.severity)}</div><div class="ttl">${esc(f.problem)}</div><div class="fix"><b>Fix:</b> ${esc(f.fix)}</div>`;
      const ids = idsForNames(f.classes);
      if (ids.length) el.appendChild(highlightButton(ids));
      list.appendChild(el);
    });
    out.appendChild(list);
  }
  const extras = [];
  if (r.strengths.length) extras.push(`<div class="aiLine"><b>Good:</b> ${r.strengths.map(esc).join(" · ")}</div>`);
  if (r.missing.length) extras.push(`<div class="aiLine"><b>Missing:</b> ${r.missing.map((m) => `<span class="chip static">${esc(m)}</span>`).join(" ")}</div>`);
  out.insertAdjacentHTML("beforeend", extras.join(""));
}

async function runReview() {
  switchPane("analyzePane");
  const out = $("aiOut"), btn = $("runAiBtn");
  btn.disabled = true;
  out.classList.remove("empty");
  out.innerHTML = '<span class="loading">Reviewing diagram</span>';
  reveal("aiCard");
  try {
    renderReview(await api.review(store.doc));
  } catch (err) {
    out.classList.add("empty");
    out.textContent = "No AI review. The rule-based analysis above still applies.";
    showError(err, "AI review failed");
  } finally {
    btn.disabled = false;
  }
}

async function showAiStatus() {
  const el = $("aiStatus");
  try {
    const s = await api.aiStatus();
    el.textContent = s.available
      ? "AI review: ready"
      : `AI review: unavailable (${s.title.toLowerCase()})`;
    if (DEBUG) el.title = s.available ? `${s.provider} · ${s.model}` : s.details || "";
    if (!s.available && s.details) console.warn(`[UMLforge] ${s.title}: ${s.details}`);
  } catch {
    el.textContent = "AI review: unavailable";
  }
}

export function initAnalysisPane() {
  $("runLocalBtn").addEventListener("click", runAnalysis);
  $("runAiBtn").addEventListener("click", runReview);
  $("issueFilter").addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]")?.dataset.filter;
    if (f) { filter = f; renderIssues(); }
  });
  showAiStatus();
}
