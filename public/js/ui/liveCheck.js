// Live rule checks on the canvas. After each edit (debounced) the backend analyzer runs, and:
//   - shapes that break a design rule get a red/orange badge (drawn by the renderer)
//   - hovering a shape shows a tooltip with its issues and fixes
//   - a mistake you JUST made pops a callout next to the shape
//
// Expected "work in progress" states (a fresh class with no links yet, a default name...)
// never pop callouts or badges; they only appear in the hover tooltip and the Analyze tab.
import { api } from "../api.js";
import { worldToCanvas } from "../canvas/camera.js";
import { nodeById } from "../model/diagram.js";
import { emit, on, store } from "../store.js";
import { $, esc } from "./dom.js";

const DEBOUNCE_MS = 450;
const CALLOUT_MS = 8000;
const MAX_CALLOUTS = 2;
const IN_PROGRESS = new Set([
  "EMPTY", "START", "UNNAMED", "EMPTYCLASS", "ORPHAN", "FRAGMENT", "SPARSE", "NOIMPL", "LONEABSTRACT",
  "NOUC", "NOACTOR", "LONELYACTOR", "LONELYUC", "FLOATNOTE", "COVERAGE", "COVERAGE2", "NOPROB", "NOLABEL",
  "NOVIS", "MULT", "MULTMANY", "NOABST",
]);
const SEV_ICON = { crit: "⛔", warn: "⚠️", info: "ℹ️" };

let timer = null, runId = 0, known = null, quiet = true;
const keyOf = (i) => `${i.code}|${[...i.ids].sort().join(",")}`;

async function run() {
  const id = ++runId;
  let result;
  try { result = await api.analyze(store.doc); } catch { return; } // offline: stay silent, popups come from user actions
  if (id !== runId) return; // a newer edit already started another run

  const byNode = new Map();
  for (const issue of result.issues) {
    issue.badge = issue.sev !== "info" && !IN_PROGRESS.has(issue.code);
    for (const nodeId of issue.ids) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId).push(issue);
    }
  }
  store.ui.issuesByNode = byNode;
  emit("analysis", result);
  emit("view");

  const keys = new Set(result.issues.map(keyOf));
  if (known && !quiet && store.ui.liveCheck && !store.ui.readOnly) {
    result.issues.filter((i) => i.badge && i.ids.length && !known.has(keyOf(i))).slice(0, MAX_CALLOUTS).forEach(showCallout);
  }
  known = keys;
  quiet = false;
}

// ---- callouts: anchored to the shape, follow pan/zoom ------------------------------------------

function calloutLayer() {
  let el = $("callouts");
  if (!el) { el = document.createElement("div"); el.id = "callouts"; $("canvasWrap").appendChild(el); }
  return el;
}

function placeCallout(el) {
  const n = nodeById(el.dataset.node);
  if (!n) { el.remove(); return; }
  const p = worldToCanvas(n.x + n.w, n.y);
  el.style.transform = `translate(${Math.round(p.x + 14)}px, ${Math.round(p.y - 10)}px)`;
}

function showCallout(issue) {
  const layer = calloutLayer();
  while (layer.children.length >= MAX_CALLOUTS) layer.firstChild.remove();
  const el = document.createElement("div");
  el.className = `callout ${issue.sev}`;
  el.dataset.node = issue.ids[0];
  el.innerHTML = `<button class="cClose" aria-label="Dismiss">×</button>
    <div class="cTitle">${SEV_ICON[issue.sev]} ${esc(issue.title)}${issue.tag ? `<span class="tag">${esc(issue.tag)}</span>` : ""}</div>
    <div class="cDetail">${esc(issue.detail)}</div>
    <div class="cFix"><b>Fix:</b> ${esc(issue.fix)}</div>`;
  el.querySelector(".cClose").addEventListener("click", () => el.remove());
  layer.appendChild(el);
  placeCallout(el);
  setTimeout(() => el.classList.add("leaving"), CALLOUT_MS);
  setTimeout(() => el.remove(), CALLOUT_MS + 300);
}

// ---- hover tooltip --------------------------------------------------------------------------

function showTooltip(hover) {
  let tip = $("canvasTip");
  if (!tip) { tip = document.createElement("div"); tip.id = "canvasTip"; $("canvasWrap").appendChild(tip); }
  const issues = hover && store.ui.liveCheck ? store.ui.issuesByNode.get(hover.id) : null;
  if (!issues?.length) { tip.hidden = true; return; }
  const order = { crit: 0, warn: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.sev] - order[b.sev] || b.badge - a.badge);
  tip.innerHTML = sorted.slice(0, 4).map((i) => `<div class="tRow ${i.sev}">
      <div class="tTitle">${SEV_ICON[i.sev]} ${esc(i.title)}${i.tag ? `<span class="tag">${esc(i.tag)}</span>` : ""}</div>
      <div class="tFix">${esc(i.fix)}</div></div>`).join("")
    + (sorted.length > 4 ? `<div class="tMore">+${sorted.length - 4} more in the Analyze tab</div>` : "");
  const wrap = $("canvasWrap").getBoundingClientRect();
  tip.hidden = false;
  const x = Math.min(hover.clientX - wrap.left + 16, wrap.width - tip.offsetWidth - 8);
  const y = Math.min(hover.clientY - wrap.top + 16, wrap.height - tip.offsetHeight - 8);
  tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}

export function initLiveCheck() {
  on("doc", () => { clearTimeout(timer); timer = setTimeout(run, DEBOUNCE_MS); });
  on("replaced", () => { quiet = true; calloutLayer().innerHTML = ""; });
  on("view", () => calloutLayer().querySelectorAll(".callout").forEach(placeCallout));
  on("hover", showTooltip);

  const btn = $("liveCheckBtn");
  btn.addEventListener("click", () => {
    store.ui.liveCheck = !store.ui.liveCheck;
    btn.classList.toggle("on", store.ui.liveCheck);
    if (!store.ui.liveCheck) calloutLayer().innerHTML = "";
    emit("view");
  });
  run();
}
