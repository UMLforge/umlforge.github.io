// In-place editing on the canvas (like Excalidraw's text editing).
//
//   Double-click a class  -> edit the part you clicked: name, attributes or methods
//   Double-click a shape  -> edit its text / name
//   Double-click a link   -> edit its label, or a multiplicity when you click near an end
//   Enter on a selection  -> edit its first part; new classes open straight into name editing
//
// Keys: Enter finishes a one-line field (in lists, Enter adds a line). Ctrl+Enter, Esc or clicking
// elsewhere finishes. Tab / Shift+Tab jump to the next / previous part of the same class.
// The whole edit is one undo step.
import { worldToCanvas } from "../canvas/camera.js";
import { edgeEnds, indexNodes } from "../canvas/geometry.js";
import { FONTS } from "../config.js";
import { history } from "../history.js";
import { edgeById, fitHeight, nodeById, select, splitLines } from "../model/diagram.js";
import { nodeType } from "../shapes/registry.js";
import { emit, on, store } from "../store.js";
import { $ } from "./dom.js";

const LIST_FIELDS = new Set(["attrs", "methods"]);
let active = null; // { kind: "node" | "edge", id, field, el }

// ---- which part of a shape is where -------------------------------------------------------

function regionsOf(n) {
  const def = nodeType(n.type);
  if (def.editRegions) return def.editRegions(n);
  const field = def.fields[0];
  if (!field) return [];
  const font = field === "text" ? (n.type === "text" ? n.fontSize || 20 : 15) : 15;
  const center = field === "name" && !["package"].includes(n.type);
  return [{ field, y0: 0, y1: n.h, font, align: center ? "center" : "left", rowH: Math.round(font * 1.3) }];
}

function regionAt(n, worldPoint) {
  const regions = regionsOf(n);
  if (!worldPoint) return regions[0];
  const y = worldPoint.y - n.y;
  return regions.find((r) => y >= r.y0 && y < r.y1) || regions[regions.length - 1];
}

/** Which part of a link was clicked: a multiplicity near either end, otherwise the label. */
function edgeFieldAt(e, worldPoint) {
  const ends = edgeEnds(e, indexNodes(store.doc.nodes));
  if (!ends || !worldPoint) return "label";
  const len = Math.hypot(ends.p2.x - ends.p1.x, ends.p2.y - ends.p1.y) || 1;
  const t = ((worldPoint.x - ends.p1.x) * (ends.p2.x - ends.p1.x) + (worldPoint.y - ends.p1.y) * (ends.p2.y - ends.p1.y)) / (len * len);
  return t < 0.25 ? "multA" : t > 0.75 ? "multB" : "label";
}

// ---- the editor element ---------------------------------------------------------------------

const valueOf = (target, field) => (LIST_FIELDS.has(field) ? (target[field] || []).join("\n") : target[field] || "");

function fontFamily() { return store.ui.roughness > 0 ? FONTS.hand : FONTS.ui; }

function place() {
  if (!active) return;
  const { el, kind, id, field } = active, zoom = store.cam.zoom;
  if (kind === "edge") {
    const e = edgeById(id), ends = e && edgeEnds(e, indexNodes(store.doc.nodes));
    if (!ends) return finish();
    const t = field === "multA" ? 0.18 : field === "multB" ? 0.82 : 0.5;
    const p = worldToCanvas(ends.p1.x + (ends.p2.x - ends.p1.x) * t, ends.p1.y + (ends.p2.y - ends.p1.y) * t);
    Object.assign(el.style, { left: `${p.x - 70}px`, top: `${p.y - 14}px`, width: "140px", height: "28px",
      font: `${14 * Math.max(zoom, 0.8)}px ${fontFamily()}`, textAlign: "center" });
    return;
  }
  const n = nodeById(id);
  if (!n) return finish();
  const r = regionsOf(n).find((x) => x.field === field);
  const p = worldToCanvas(n.x, n.y + r.y0);
  const fontPx = (r.font + (store.ui.roughness > 0 ? 1 : 0)) * zoom;
  Object.assign(el.style, {
    left: `${p.x}px`, top: `${p.y}px`, width: `${n.w * zoom}px`,
    font: `${r.bold ? "bold " : ""}${fontPx}px ${fontFamily()}`,
    lineHeight: r.rowH ? `${r.rowH * zoom}px` : "normal",
    textAlign: r.align || "left",
    padding: `${(LIST_FIELDS.has(field) ? 6 : 4) * zoom}px ${10 * zoom}px`,
  });
  el.style.height = "auto";
  el.style.height = `${Math.max((r.y1 - r.y0) * zoom, el.scrollHeight)}px`;
}

function apply() {
  const { kind, id, field, el } = active;
  const target = kind === "edge" ? edgeById(id) : nodeById(id);
  if (!target) return;
  target[field] = LIST_FIELDS.has(field) ? splitLines(el.value) : el.value;
  if (kind === "node") fitHeight(target);
  emit("doc");
  place();
}

export function finish() {
  if (!active) return;
  const { el } = active;
  active = null;
  el.remove();
  history.commit();
  emit("doc");
  $("board").focus?.();
}

function open(kind, id, field) {
  finish();
  if (store.ui.readOnly) return;
  const target = kind === "edge" ? edgeById(id) : nodeById(id);
  if (!target || !field) return;
  const multiline = LIST_FIELDS.has(field) || field === "text" || (kind === "node" && target.type === "usecase");
  const el = document.createElement(multiline ? "textarea" : "input");
  el.className = "inlineEditor";
  el.value = valueOf(target, field);
  el.spellcheck = false;
  const region = kind === "node" && regionsOf(target).find((r) => r.field === field);
  el.placeholder = region?.placeholder || (field === "label" ? "label" : field.startsWith("mult") ? "1, 0..*" : "");
  $("canvasWrap").appendChild(el);

  if (kind === "node") select([id]); else select([], id); // before begin(): selecting closes other edit sessions
  history.begin();
  active = { kind, id, field, el };
  place();
  el.focus();
  // Names: select all for a quick rename. Lists and text: caret at the end so typing never wipes them.
  if (multiline) el.setSelectionRange(el.value.length, el.value.length);
  else el.select();

  el.addEventListener("input", apply);
  el.addEventListener("blur", () => { if (active?.el === el) finish(); });
  el.addEventListener("keydown", (e) => {
    e.stopPropagation(); // canvas shortcuts must not fire while typing
    if (e.key === "Escape" || (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      finish();
    } else if (e.key === "Tab" && kind === "node") {
      e.preventDefault();
      const fields = regionsOf(target).map((r) => r.field);
      const next = fields[(fields.indexOf(field) + (e.shiftKey ? fields.length - 1 : 1)) % fields.length];
      finish();
      open("node", id, next);
    }
  });
}

/** Starts editing whatever is at `worldPoint` on a node or edge (double-click). */
export function editAt({ node, edge }, worldPoint) {
  if (node) open("node", node.id, regionAt(node, worldPoint)?.field);
  else if (edge) open("edge", edge.id, edgeFieldAt(edge, worldPoint));
}

export function editNode(node) {
  open("node", node.id, regionsOf(node)[0]?.field);
}

export function initInlineEditor() {
  on("view", place);
  on("replaced", finish);
  on("created", (n) => { if (nodeType(n.type).editOnCreate) editNode(n); });
}
