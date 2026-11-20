// Inspector panel: edits whatever is selected. Node forms are built from the type's `fields`.
import { centerOn } from "../canvas/camera.js";
import { DEFAULT_STYLE, FILL_STYLES, FILLS, INKS, STROKE_STYLES, STROKE_WIDTHS } from "../config.js";
import { EDGE_TYPES } from "../edges/registry.js";
import { history } from "../history.js";
import {
  alignLeft, deleteSelection, duplicateSelection, fitHeight, nodeById, selectedEdge, selectedNodes, splitLines,
} from "../model/diagram.js";
import { nodeType } from "../shapes/registry.js";
import { emit, on } from "../store.js";
import { $, esc, switchPane } from "./dom.js";

// ---- field templates ----------------------------------------------------------------

const FIELD_HTML = {
  name: (n) => `<div class="fld full"><label>Name</label><input class="textInput" data-field="name" value="${esc(n.name)}"></div>`,
  text: (n) => `<div class="fld full"><label>Body text</label><textarea class="textInput" data-field="text" rows="3">${esc(n.text)}</textarea></div>`,
  attrs: (n) => `<div class="fld full"><label>${n.type === "enum" ? "Literals" : "Attributes"} (one per line)</label>
    <textarea class="textInput" data-field="attrs" rows="4" placeholder="- name: Type">${esc(n.attrs.join("\n"))}</textarea></div>`,
  methods: (n) => `<div class="fld full"><label>Methods (one per line)</label>
    <textarea class="textInput" data-field="methods" rows="4" placeholder="+ name(params): Return">${esc(n.methods.join("\n"))}</textarea></div>`,
};

const LIST_FIELDS = new Set(["attrs", "methods"]);

const swatches = (palette, current, attr) =>
  `<div class="swatches">${Object.entries(palette).map(([k, v]) =>
    `<button class="sw${k === current ? " sel" : ""}${swatchClass(v)}" data-${attr}="${k}" title="${k}" style="background:${v}"></button>`).join("")}</div>`;

const swatchClass = (v) => (v === "transparent" ? " transparent" : "");

// Excalidraw-style segmented control, e.g. stroke width thin / bold / extra.
const segment = (label, prop, options, current) =>
  `<div class="fld full"><label>${label}</label><div class="segment">${options.map(([value, text]) =>
    `<button class="seg${String(value) === String(current) ? " on" : ""}" data-prop="${prop}" data-value="${value}">${text}</button>`).join("")}</div></div>`;

function styleControls(el, { fill = true, dash = true } = {}) {
  const v = { ...DEFAULT_STYLE, ...el };
  return segment("Stroke width", "strokeWidth", Object.entries(STROKE_WIDTHS).map(([k, w]) => [w, k]), v.strokeWidth)
    + (el.a || !dash ? "" : segment("Stroke style", "strokeStyle", STROKE_STYLES.map((x) => [x, x]), v.strokeStyle))
    + (fill ? segment("Fill style", "fillStyle", FILL_STYLES.map((x) => [x, x]), v.fillStyle) : "");
}

function bindSegments(root, target) {
  root.querySelectorAll(".seg").forEach((b) => b.addEventListener("click", () => {
    history.record();
    const { prop, value } = b.dataset;
    target[prop] = prop === "strokeWidth" ? Number(value) : value;
    b.parentElement.querySelectorAll(".seg").forEach((x) => x.classList.toggle("on", x === b));
    emit("doc");
  }));
}

const buttons = (list) =>
  `<div class="fld full"><div class="btnRow">${list.map(([id, label]) => `<button class="abtn small" data-action="${id}">${label}</button>`).join("")}</div></div>`;

// ---- binding: a typing session becomes ONE undo step; the canvas updates on every keystroke ----

function bindTextInputs(root, apply) {
  root.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("focus", () => history.begin());
    el.addEventListener("input", () => { apply(el.dataset.field, el.value); emit("doc"); });
    el.addEventListener("change", () => history.commit());
  });
}

function bindSwatches(root, target) {
  root.querySelectorAll(".sw").forEach((sw) => sw.addEventListener("click", () => {
    history.record();
    if (sw.dataset.ink) target.color = sw.dataset.ink;
    if (sw.dataset.fill) target.bg = sw.dataset.fill;
    sw.parentElement.querySelectorAll(".sw").forEach((s) => s.classList.toggle("sel", s === sw));
    emit("doc");
  }));
}

function bindActions(root, actions) {
  root.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", actions[b.dataset.action]));
}

// ---- forms --------------------------------------------------------------------------

function nodeForm(form, n) {
  const def = nodeType(n.type);
  form.innerHTML = `<div class="inspGrid">
    <div class="fld full"><label>Kind</label><b>${esc(def.label)}</b></div>
    ${def.fields.map((f) => FIELD_HTML[f](n)).join("")}
    <div class="fld full"><label>Stroke</label>${swatches(INKS, n.color, "ink")}</div>
    ${def.noFill ? "" : `<div class="fld full"><label>Background</label>${swatches(FILLS, n.bg, "fill")}</div>`}
    ${def.type === "text" ? "" : styleControls(n, { fill: !def.noFill, dash: def.create !== "freedraw" })}
    <div class="fld"><label>Width</label><input class="textInput" type="number" data-size="w" value="${Math.round(n.w)}"></div>
    <div class="fld"><label>Height</label><input class="textInput" type="number" data-size="h" value="${Math.round(n.h)}"></div>
    ${buttons([["dup", "Duplicate"], ["del", "Delete"], ["focus", "Center on canvas"]])}
  </div>`;

  bindTextInputs(form, (field, value) => {
    n[field] = LIST_FIELDS.has(field) ? splitLines(value) : value;
    if (LIST_FIELDS.has(field)) fitHeight(n);
  });
  bindSwatches(form, n);
  bindSegments(form, n);
  form.querySelectorAll("[data-size]").forEach((el) => el.addEventListener("change", () => {
    history.record();
    const v = parseInt(el.value, 10);
    n[el.dataset.size] = Math.max(30, Math.min(900, Number.isFinite(v) ? v : n[el.dataset.size]));
    emit("doc");
  }));
  bindActions(form, { dup: duplicateSelection, del: deleteSelection, focus: () => centerOn(n.x + n.w / 2, n.y + n.h / 2) });
}

function edgeForm(form, e) {
  const a = nodeById(e.a), b = nodeById(e.b);
  const options = Object.keys(EDGE_TYPES).map((t) => `<option value="${t}"${t === e.type ? " selected" : ""}>${t}</option>`).join("");
  form.innerHTML = `<div class="inspGrid">
    <div class="fld full"><label>Relationship</label><b>${esc(a?.name || "?")}</b> → <b>${esc(b?.name || "?")}</b></div>
    <div class="fld"><label>Type</label><select class="textInput" id="edgeType">${options}</select></div>
    <div class="fld"><label>Label</label><input class="textInput" data-field="label" value="${esc(e.label)}" placeholder="verb phrase"></div>
    <div class="fld"><label>Mult. at source</label><input class="textInput" data-field="multA" value="${esc(e.multA)}" placeholder="1, 0..*, *"></div>
    <div class="fld"><label>Mult. at target</label><input class="textInput" data-field="multB" value="${esc(e.multB)}" placeholder="1, 0..*, *"></div>
    <div class="fld full"><label>Stroke</label>${swatches(INKS, e.color, "ink")}</div>
    ${styleControls(e, { fill: false })}
    ${buttons([["reverse", "Reverse direction"], ["del", "Delete link"]])}
  </div>`;

  bindTextInputs(form, (field, value) => { e[field] = value; });
  bindSwatches(form, e);
  bindSegments(form, e);
  $("edgeType").addEventListener("change", (ev) => { history.record(); e.type = ev.target.value; emit("doc"); });
  bindActions(form, {
    reverse: () => { history.record(); [e.a, e.b] = [e.b, e.a]; emit("doc"); render(); },
    del: deleteSelection,
  });
}

function multiForm(form, nodes) {
  form.innerHTML = `<div class="muted">${nodes.length} shapes selected. Drag any of them to move them together.</div>
    <div class="btnRow"><button class="abtn small" data-action="dup">Duplicate all</button>
    <button class="abtn small" data-action="del">Delete all</button><button class="abtn small" data-action="align">Align left</button></div>`;
  bindActions(form, { dup: duplicateSelection, del: deleteSelection, align: alignLeft });
}

function render() {
  history.commit(); // close any typing session whose input is about to disappear
  const form = $("inspForm"), edge = selectedEdge(), nodes = selectedNodes();
  $("inspEmpty").hidden = !!(edge || nodes.length);
  form.innerHTML = "";
  if (edge) edgeForm(form, edge);
  else if (nodes.length > 1) multiForm(form, nodes);
  else if (nodes.length === 1) nodeForm(form, nodes[0]);
}

/** Opens the inspector and focuses its first text field (used on double-click). */
export function openInspector() {
  switchPane("inspectorPane");
  const first = $("inspForm").querySelector("input[data-field], textarea[data-field]");
  if (first) { first.focus(); first.select?.(); }
}

export function initInspector() {
  on("selection", render);
  render();
}
