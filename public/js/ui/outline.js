// Outline tab: a browsable tree of containers and what is inside them.
// Click a name to jump to it (its containers expand if needed); ▸/▾ collapses a container on the canvas.
// Overview collapses every container, Expand all shows every detail.
import { centerOn } from "../canvas/camera.js";
import { nodeById, select, setAllCollapsed, setCollapsed } from "../model/diagram.js";
import { ancestors, indexNodes, isGroup } from "../model/groups.js";
import { nodeType } from "../shapes/registry.js";
import { on, store } from "../store.js";
import { $, esc } from "./dom.js";

// Only meaningful shapes are listed (no brush strokes, lines or decorative boxes).
const LISTED = (n) => isGroup(n) || nodeType(n.type).classLike || ["actor", "usecase", "note"].includes(n.type);
const label = (n) => n.name || (n.type === "note" ? (n.text || "Note").slice(0, 30) : nodeType(n.type).label);

function rows(parentId, depth, byParent) {
  return (byParent.get(parentId) || []).map((n) => {
    const kids = byParent.get(n.id) || [];
    const group = isGroup(n);
    const toggle = group ? `<button class="olToggle" data-toggle="${n.id}" title="${n.collapsed ? "Expand" : "Collapse"}">${n.collapsed ? "▸" : "▾"}</button>` : `<span class="olToggle"></span>`;
    const sel = store.ui.selNodes.includes(n.id) ? " sel" : "";
    const row = `<div class="olRow${sel}" style="padding-left:${depth * 14}px">${toggle}
      <button class="olName" data-go="${n.id}"><span class="olKind">${esc(nodeType(n.type).label)}</span>${esc(label(n))}</button>
      ${group ? `<span class="olCount">${kids.length}</span>` : ""}</div>`;
    return row + (group && !n.collapsed ? rows(n.id, depth + 1, byParent) : "");
  }).join("");
}

function render() {
  const listed = store.doc.nodes.filter(LISTED);
  const byParent = new Map();
  const ids = new Set(listed.map((n) => n.id));
  for (const n of listed) {
    const key = n.parent && ids.has(n.parent) ? n.parent : "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  }
  for (const list of byParent.values()) list.sort((a, b) => isGroup(b) - isGroup(a) || label(a).localeCompare(label(b)));
  const hasGroups = listed.some(isGroup);
  $("outlineTree").innerHTML = listed.length ? rows("", 0, byParent) : '<div class="muted">Nothing here yet.</div>';
  $("outlineHelp").hidden = hasGroups;
  $("overviewBtns").hidden = !hasGroups;
}

/** Selects a shape and brings it into view, expanding the containers it sits in. */
function reveal(id) {
  const n = nodeById(id);
  if (!n) return;
  const closed = ancestors(n, indexNodes(store.doc.nodes)).filter((a) => a.collapsed).map((a) => a.id);
  if (closed.length) setCollapsed(closed, false);
  select([id]);
  centerOn(n.x + n.w / 2, n.y + n.h / 2);
}

export function initOutline() {
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); } };
  on("doc", later);
  on("selection", later);
  $("outlineTree").addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]")?.dataset.toggle;
    const go = e.target.closest("[data-go]")?.dataset.go;
    if (toggle) { const g = nodeById(toggle); setCollapsed([toggle], !g.collapsed); }
    else if (go) reveal(go);
  });
  $("overviewBtn").addEventListener("click", () => setAllCollapsed(true));
  $("expandAllBtn").addEventListener("click", () => setAllCollapsed(false));
  $("zoomOverviewBtn").addEventListener("click", () => setAllCollapsed(true));
  $("zoomExpandBtn").addEventListener("click", () => setAllCollapsed(false));
  on("doc", () => {
    const has = store.doc.nodes.some(isGroup);
    $("zoomOverviewBtn").hidden = $("zoomExpandBtn").hidden = !has;
  });
  render();
}
