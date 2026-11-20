// Builds the tool strip from the registries, and wires the top bar and zoom controls.
import { fitView, zoomCenter } from "../canvas/camera.js";
import { EDGE_TYPES } from "../edges/registry.js";
import { history } from "../history.js";
import { deleteSelection, duplicateSelection } from "../model/diagram.js";
import { nodeTypes } from "../shapes/registry.js";
import { emit, on, store } from "../store.js";
import { hintFor, setTool } from "../tools.js";
import { $, esc, svgIcon } from "./dom.js";

const ICONS = {
  select: '<path d="M6.5 3.2 15 10.3l-4.9.9-2.2 4.8-2.2-1.2 1.9-4.5-3.3-2.1z" fill="currentColor" stroke="none"/>',
  pan: '<path d="M7.2 11.2V6a1.3 1.3 0 0 1 2.6 0v4.1"/><path d="M9.8 10.1V4.6a1.3 1.3 0 0 1 2.6 0v5.5"/><path d="M12.4 10.3V6.3a1.3 1.3 0 0 1 2.6 0v4.9c0 3.6-2.5 6-5.7 6-2.2 0-3.6-1-4.8-2.9l-1.6-2.6c-.5-.9 0-1.9 1-1.8.7.1 2.4 1.6 2.4.4"/>',
  dup: '<rect x="7.5" y="7.5" width="9" height="9" rx="1.5"/><path d="M12.5 7.5v-2a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5.5v6A1.5 1.5 0 0 0 5 13h2.5"/>',
  del: '<path d="M3.5 5.5h13M8 5.5v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6.3 5.5l.8 10a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.8-10"/><path d="M8.7 9v5M11.3 9v5"/>',
  eraser: '<path d="M8 16.5h8.5"/><path d="M3.8 12.6 11.6 4.8a1.6 1.6 0 0 1 2.3 0l2.3 2.3a1.6 1.6 0 0 1 0 2.3L9.6 16H6.8z"/><path d="M8 8.4l3.6 3.6"/>',
  laser: '<circle cx="5" cy="15" r="2" fill="currentColor"/><path d="M7 13 16 4M12 4h4v4" opacity=".8"/><path d="M14.5 11.5l2 1M10 16.5l1.5 1.5" opacity=".6"/>',
};

const toolBtn = (tool, label, icon, title = label) =>
  `<button class="tool" data-tool="${tool}" title="${esc(title)}">${svgIcon(icon)}${esc(label)}</button>`;
const actionBtn = (id, label, icon, title) =>
  `<button class="tool" id="${id}" title="${esc(title)}">${svgIcon(icon)}${esc(label)}</button>`;
const group = (label, buttons) => `<div class="toolGroup"><span class="tlabel">${label}</span>${buttons.join("")}</div>`;
const withKey = (t) => (t.key ? `${t.label} (${t.key.toUpperCase()})` : t.label);

function buildToolstrip() {
  const shapes = (g) => nodeTypes().filter((t) => t.group === g).map((t) => toolBtn(t.type, t.label, t.icon, withKey(t)));
  const links = Object.entries(EDGE_TYPES).filter(([, d]) => d.toolbar).map(([type, d]) => toolBtn(`edge:${type}`, d.label, d.icon));
  $("toolstrip").innerHTML = [
    group("Edit", [
      toolBtn("select", "Select", ICONS.select, "Select (V)"),
      toolBtn("pan", "Hand", ICONS.pan, "Hand (H)"),
      actionBtn("dupBtn", "Dup", ICONS.dup, "Duplicate selection (Ctrl+D)"),
      actionBtn("delBtn", "Del", ICONS.del, "Delete selection (Del)"),
    ]),
    group("UML", shapes("uml")),
    group("Links", links),
    group("Organize", shapes("organize")),
    group("Sketch", shapes("sketch")),
    group("Annotate", [
      ...shapes("annotate"),
      toolBtn("eraser", "Eraser", ICONS.eraser, "Eraser (E)"),
      toolBtn("laser", "Laser", ICONS.laser, "Laser pointer (K)"),
    ]),
  ].join("");

  $("toolstrip").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tool]");
    if (btn) setTool(btn.dataset.tool);
  });
  $("dupBtn").addEventListener("click", duplicateSelection);
  $("delBtn").addEventListener("click", deleteSelection);
}

function syncTool() {
  document.querySelectorAll(".tool[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === store.ui.tool));
  $("hintBar").textContent = hintFor(store.ui.tool);
}

function toggle(id, key) {
  $(id).addEventListener("click", () => {
    store.ui[key] = !store.ui[key];
    $(id).classList.toggle("on", store.ui[key]);
    emit("view");
  });
}

export function initToolbar() {
  buildToolstrip();
  on("tool", syncTool);
  syncTool();

  $("undoBtn").addEventListener("click", () => history.undo());
  $("redoBtn").addEventListener("click", () => history.redo());
  const syncHistory = () => { $("undoBtn").disabled = !history.canUndo; $("redoBtn").disabled = !history.canRedo; };
  on("history", syncHistory);
  syncHistory();

  toggle("gridBtn", "grid");
  $("sloppinessSelect").addEventListener("change", (e) => { store.ui.roughness = Number(e.target.value); emit("view"); });

  $("zoomInBtn").addEventListener("click", () => zoomCenter(1.2));
  $("zoomOutBtn").addEventListener("click", () => zoomCenter(1 / 1.2));
  $("fitBtn").addEventListener("click", () => fitView());
  on("view", () => { $("zoomLabel").textContent = `${Math.round(store.cam.zoom * 100)}%`; });

  $("sideToggleBtn").addEventListener("click", () => $("side").classList.toggle("hidden"));
  if (window.innerWidth <= 1020) $("side").classList.add("hidden");
}
