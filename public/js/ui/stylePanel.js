// Floating style panel (top-left of the canvas), like Excalidraw's properties panel.
//
// - While a drawing tool is active (pen, highlighter, rect, arrow, text...), it sets the style of the
//   NEXT thing you draw; choices are remembered per tool (store.ui.toolStyle, saved in this browser).
// - With Select and only drawing shapes selected, it restyles the selection (one undo step per click).
//
// Which controls a tool shows comes from its `styleProps` in the shape registry.
import { DEFAULT_STYLE, FILL_STYLES, FILLS, INKS } from "../config.js";
import { history } from "../history.js";
import { selectedNodes } from "../model/diagram.js";
import { nodeType, nodeTypes } from "../shapes/registry.js";
import { emit, on, store } from "../store.js";
import { $, esc } from "./dom.js";

const STORAGE_KEY = "umlforge-toolstyle";
const COLLAPSED_KEY = "umlforge-stylepanel-collapsed";

const line = (w, dash = "") => `<svg viewBox="0 0 24 12" aria-hidden="true"><path d="M3 6h18" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" ${dash}/></svg>`;
const fillIcon = {
  solid: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  hachure: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor"/><path d="M3 9l6-6M3 13l10-10M7 13l6-6" stroke="currentColor"/></svg>',
  "cross-hatch": '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor"/><path d="M3 9l6-6M3 13l10-10M7 13l6-6M3 7l6 6M3 3l10 10M7 3l6 6" stroke="currentColor"/></svg>',
};

// Control definitions. Swatch controls use a palette; segment controls use [value, iconHtml, title].
const CONTROLS = {
  color: { label: "Stroke", palette: INKS },
  bg: { label: "Background", palette: FILLS },
  fillStyle: { label: "Fill", options: FILL_STYLES.map((v) => [v, fillIcon[v], v]) },
  strokeWidth: { label: "Width", options: [[1, line(1.5), "Thin"], [2, line(3), "Bold"], [4, line(5.5), "Extra bold"]] },
  strokeStyle: { label: "Style", options: [["solid", line(2.5), "Solid"], ["dashed", line(2.5, 'stroke-dasharray="5 4"'), "Dashed"], ["dotted", line(2.5, 'stroke-dasharray="0.5 4.5"'), "Dotted"]] },
  fontSize: { label: "Size", options: [[16, "S", "Small"], [20, "M", "Medium"], [28, "L", "Large"], [36, "XL", "Extra large"]] },
};

function loadToolStyle() {
  try { store.ui.toolStyle = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { store.ui.toolStyle = {}; }
}
function saveToolStyle() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.ui.toolStyle)); } catch { /* storage blocked */ }
}

/** What the panel edits right now: the active tool's defaults, or the selected drawing shapes. */
function currentTarget() {
  if (store.ui.readOnly) return null;
  const tool = store.ui.tool;
  const def = nodeTypes().find((t) => t.type === tool);
  if (def?.styleProps) {
    return { kind: "tool", type: tool, title: def.label, props: def.styleProps, palette: def.palette,
      values: { ...DEFAULT_STYLE, color: "slate", bg: "white", ...def.defaults, ...store.ui.toolStyle[tool] } };
  }
  const nodes = selectedNodes();
  if (tool === "select" && nodes.length && nodes.every((n) => nodeType(n.type).styleProps)) {
    const props = nodes.map((n) => nodeType(n.type).styleProps).reduce((a, b) => a.filter((p) => b.includes(p)));
    if (!props.length) return null;
    const first = nodeType(nodes[0].type);
    return { kind: "selection", nodes, title: nodes.length > 1 ? `${nodes.length} shapes` : first.label, props,
      palette: nodes.every((n) => n.type === nodes[0].type) ? first.palette : undefined,
      values: { ...DEFAULT_STYLE, ...nodes[0] } };
  }
  return null;
}

function controlHtml(prop, target) {
  const c = CONTROLS[prop], value = target.values[prop];
  let body;
  if (c.palette) {
    const keys = prop === "color" && target.palette ? target.palette : Object.keys(c.palette);
    body = keys.map((k) => `<button class="sw${k === value ? " sel" : ""}${c.palette[k] === "transparent" ? " transparent" : ""}"
      data-prop="${prop}" data-value="${k}" title="${k}" style="background:${c.palette[k]}"></button>`).join("");
  } else {
    body = c.options.map(([v, icon, title]) => `<button class="seg${String(v) === String(value) ? " on" : ""}"
      data-prop="${prop}" data-value="${v}" title="${esc(title)}">${icon}</button>`).join("");
  }
  return `<div class="spRow"><div class="spLabel">${c.label}</div><div class="spCtl">${body}</div></div>`;
}

function render() {
  const panel = $("stylePanel"), target = currentTarget();
  panel.hidden = !target;
  if (!target) return;
  const collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  panel.classList.toggle("collapsed", collapsed);
  panel.innerHTML = `<div class="spHead"><span>${esc(target.title)}${target.kind === "tool" ? " style" : ""}</span>
      <button class="spToggle" title="${collapsed ? "Show" : "Hide"} style options">${collapsed ? "▸" : "▾"}</button></div>
    ${collapsed ? "" : `<div class="spBody">${target.props.map((p) => controlHtml(p, target)).join("")}</div>`}`;
}

function apply(prop, raw) {
  const target = currentTarget();
  if (!target) return;
  const value = prop === "strokeWidth" || prop === "fontSize" ? Number(raw) : raw;
  if (target.kind === "tool") {
    store.ui.toolStyle[target.type] = { ...store.ui.toolStyle[target.type], [prop]: value };
    saveToolStyle();
  } else {
    history.record();
    target.nodes.forEach((n) => { n[prop] = value; });
    emit("doc");
  }
  render();
}

export function initStylePanel() {
  loadToolStyle();
  const panel = document.createElement("div");
  panel.id = "stylePanel";
  panel.hidden = true;
  $("canvasWrap").appendChild(panel);

  panel.addEventListener("click", (e) => {
    if (e.target.closest(".spToggle")) {
      const collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
      try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1"); } catch { /* ignore */ }
      render();
      return;
    }
    const btn = e.target.closest("[data-prop]");
    if (btn) apply(btn.dataset.prop, btn.dataset.value);
  });
  // keep canvas shortcuts and drawing from reacting to clicks inside the panel
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());

  on("tool", render);
  on("selection", render);
  render();
}
