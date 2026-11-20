// Pointer input on the board. A press starts a "gesture" (pan, move, resize, marquee, link, create);
// the gesture handles the following move and up events. Shape tools draw like Excalidraw:
// box shapes by dragging, lines and arrows from start to end, the brush freehand.
import { SNAP_STEP } from "../config.js";
import { history } from "../history.js";
import {
  addEdge, addNode, assignContainer, createNode, fitHeight, nodeById, removeItems, select, selectedNodes, toggleCollapsed, toggleSelected,
} from "../model/diagram.js";
import { descendants, hiddenIds, isGroup, toggleRect } from "../model/groups.js";
import { nodeType } from "../shapes/registry.js";
import { emit, on, store } from "../store.js";
import { edgeToolType, isEdgeTool, setTool } from "../tools.js";
import { screenToWorld, zoomAt } from "./camera.js";
import { edgeAt, handleAt, nodeAt } from "./geometry.js";

const MIN_W = 50, MIN_H = 40;
const circleCursor = (color) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='6' fill='${color}' stroke='%23333' stroke-width='1.5'/%3E%3C/svg%3E") 10 10, crosshair`;
const TOOL_CURSORS = { eraser: circleCursor("%23fff"), laser: circleCursor("%23ff2020") };
const snap = (v) => (store.ui.snap ? Math.round(v / SNAP_STEP) * SNAP_STEP : v);
const tolerance = () => 8 / store.cam.zoom;
const finishDrawing = (type) => { if (!nodeType(type).stayActive) setTool("select"); };

// ---- gestures ---------------------------------------------------------------------

function panGesture(e) {
  const start = { sx: e.clientX, sy: e.clientY, x: store.cam.x, y: store.cam.y };
  return {
    cursor: "grabbing",
    move(_, ev) {
      store.cam.x = start.x - (ev.clientX - start.sx) / store.cam.zoom;
      store.cam.y = start.y - (ev.clientY - start.sy) / store.cam.zoom;
      emit("view");
    },
  };
}

function moveGesture(p) {
  history.begin();
  // containers carry their members along
  const moving = new Map();
  for (const n of selectedNodes()) {
    moving.set(n.id, n);
    if (isGroup(n)) descendants(n.id, store.doc.nodes).forEach((d) => moving.set(d.id, d));
  }
  const orig = [...moving.values()].map((n) => ({ n, x: n.x, y: n.y }));
  let moved = false;
  return {
    move(w) {
      moved = true;
      for (const o of orig) { o.n.x = snap(o.x + w.x - p.x); o.n.y = snap(o.y + w.y - p.y); }
      emit("view");
    },
    up() {
      // dropped into / dragged out of a container? (only the outermost moved shapes change container)
      if (moved) for (const o of orig) if (!o.n.parent || !moving.has(o.n.parent)) assignContainer(o.n);
      history.commit();
      emit("doc");
    },
  };
}

function resizeGesture(p, node, dir) {
  history.begin();
  const o = { x: node.x, y: node.y, w: node.w, h: node.h };
  return {
    move(w) {
      const dx = w.x - p.x, dy = w.y - p.y;
      let { x, y, w: nw, h: nh } = o;
      if (dir.includes("e")) nw = Math.max(MIN_W, o.w + dx);
      if (dir.includes("s")) nh = Math.max(MIN_H, o.h + dy);
      if (dir.includes("w")) { nw = Math.max(MIN_W, o.w - dx); x = o.x + o.w - nw; }
      if (dir.includes("n")) { nh = Math.max(MIN_H, o.h - dy); y = o.y + o.h - nh; }
      Object.assign(node, { x: snap(x), y: snap(y), w: snap(nw), h: snap(nh) });
      emit("view");
    },
    up() { history.commit(); emit("doc"); emit("selection"); },
  };
}

function marqueeGesture(p) {
  const m = (store.ui.overlay.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  return {
    move(w) { m.x1 = w.x; m.y1 = w.y; emit("view"); },
    up() {
      store.ui.overlay.marquee = null;
      const [x0, x1] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
      const [y0, y1] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
      if (Math.hypot(x1 - x0, y1 - y0) < 4) { // bare click on empty ground: hand control back to Hand
        select([]);
        setTool("pan");
        return;
      }
      const inside = (n) => { const cx = n.x + n.w / 2, cy = n.y + n.h / 2; return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1; };
      select(store.doc.nodes.filter(inside).map((n) => n.id));
    },
  };
}

function linkGesture(p, fromId, type) {
  const draft = (store.ui.overlay.draft = { fromId, cur: p });
  emit("view");
  return {
    move(w) { draft.cur = w; emit("view"); },
    up(w) {
      store.ui.overlay.draft = null;
      const target = nodeAt(store.doc.nodes, w, tolerance());
      if (target && target.id !== fromId) {
        addEdge(type, fromId, target.id);
        setTool("select");
      }
      emit("view");
    },
  };
}

// Box shapes: click drops the default size, dragging draws the box (like Excalidraw).
function boxGesture(type, p) {
  let node = null;
  return {
    move(w) {
      if (!node && Math.hypot(w.x - p.x, w.y - p.y) < 6) return;
      if (!node) {
        history.record();
        node = createNode(type, p.x, p.y);
        store.doc.nodes.push(node);
        select([node.id]);
      }
      const x0 = snap(Math.min(p.x, w.x)), y0 = snap(Math.min(p.y, w.y));
      Object.assign(node, { x: x0, y: y0, w: Math.max(20, snap(Math.max(p.x, w.x)) - x0), h: Math.max(20, snap(Math.max(p.y, w.y)) - y0) });
      emit("view");
    },
    up(w) {
      const drawn = !!node;
      if (!node) node = addNode(type, snap(w.x), snap(w.y));
      assignContainer(node);
      if (drawn && isGroup(node)) adoptShapesInside(node); // a container drawn around shapes groups them
      if (drawn) { fitHeight(node); emit("doc"); emit("selection"); } else emit("doc");
      finishDrawing(type);
      emit("created", node); // e.g. open name editing right away
    },
  };
}

/** Moves the points so the box starts at the first point, and records the drawn size for scaling. */
function normalizePoints(n) {
  const xs = n.points.map((q) => q[0]), ys = n.points.map((q) => q[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  n.points = n.points.map(([x, y]) => [x - minX, y - minY]);
  n.x += minX; n.y += minY;
  n.w = n.pw = Math.max(...xs) - minX;
  n.h = n.ph = Math.max(...ys) - minY;
}

/** Shapes whose center is inside a newly drawn container (and at the same level) become its members. */
function adoptShapesInside(g) {
  const hidden = hiddenIds(store.doc.nodes);
  for (const n of store.doc.nodes) {
    if (n === g || hidden.has(n.id) || (n.parent || null) !== (g.parent || null)) continue;
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    if (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h) n.parent = g.id;
  }
}

// Line / arrow: drag from start to end.
function linearGesture(type, p) {
  let node = null;
  return {
    move(w) {
      if (!node && Math.hypot(w.x - p.x, w.y - p.y) < 6) return;
      if (!node) {
        history.record();
        node = createNode(type, p.x, p.y, { points: [[0, 0], [0, 0]] });
        Object.assign(node, { x: p.x, y: p.y, w: 0, h: 0 });
        store.doc.nodes.push(node);
      }
      node.points[1] = [w.x - p.x, w.y - p.y];
      emit("view");
    },
    up() {
      if (!node) return;
      normalizePoints(node);
      assignContainer(node);
      emit("doc");
      select([node.id]);
      finishDrawing(type);
    },
  };
}

// Brush: perfect-freehand stroke; uses real pen pressure when available.
function freedrawGesture(type, p, e) {
  history.record();
  const usePressure = e.pointerType === "pen";
  const node = createNode(type, p.x, p.y, { points: [[0, 0]], pressures: [e.pressure || 0.5], simulatePressure: !usePressure });
  Object.assign(node, { x: p.x, y: p.y, w: 0, h: 0 });
  store.doc.nodes.push(node);
  return {
    move(w, ev) {
      node.points.push([w.x - p.x, w.y - p.y]);
      node.pressures.push(ev.pressure || 0.5);
      emit("view");
    },
    up() {
      normalizePoints(node);
      assignContainer(node);
      emit("doc");
      finishDrawing(type);
    },
  };
}

const CREATE_GESTURES = { box: boxGesture, linear: linearGesture, freedraw: freedrawGesture };

// ---- annotation tools without shapes ---------------------------------------------------

// Eraser (Excalidraw-style): everything the eraser passes over fades, and is deleted on release.
function eraserGesture(p) {
  const hits = (store.ui.overlay.erasing = new Set());
  let last = p;
  const touch = (w) => {
    // sample the path every few pixels so fast strokes don't skip thin lines
    const steps = Math.max(1, Math.ceil(Math.hypot(w.x - last.x, w.y - last.y) / (4 / store.cam.zoom)));
    for (let i = 1; i <= steps; i++) {
      const q = { x: last.x + ((w.x - last.x) * i) / steps, y: last.y + ((w.y - last.y) * i) / steps };
      const n = nodeAt(store.doc.nodes, q, tolerance());
      const e = !n && edgeAt(store.doc, q, tolerance());
      if (n) hits.add(n.id);
      if (e) hits.add(e.id);
    }
    last = w;
    emit("view");
  };
  touch(p);
  return {
    move: touch,
    up() { store.ui.overlay.erasing = null; removeItems(hits); emit("view"); },
  };
}

// Laser pointer: a red trail that fades out after a second. Nothing is saved.
function laserGesture(p) {
  const trail = store.ui.overlay.laser;
  const add = (w) => { trail.push({ x: w.x, y: w.y, t: performance.now() }); emit("view"); };
  trail.push(null); // gap between separate strokes
  add(p);
  return { move: add };
}

const TOOL_GESTURES = { eraser: eraserGesture, laser: laserGesture };

// ---- deciding which gesture a press starts --------------------------------------------

/** Container under p whose collapse / expand button was clicked. */
function toggleAt(p) {
  const hidden = hiddenIds(store.doc.nodes);
  return store.doc.nodes.find((g) => {
    if (!isGroup(g) || hidden.has(g.id)) return false;
    const t = toggleRect(g), pad = 3 / store.cam.zoom;
    return p.x >= g.x + t.x - pad && p.x <= g.x + t.x + t.w + pad && p.y >= g.y + t.y - pad && p.y <= g.y + t.y + t.h + pad;
  });
}

const resizable = (n) => !isGroup(n) || (!n.collapsed && !store.doc.nodes.some((m) => m.parent === n.id));

function selectPress(e, p) {
  const toggled = toggleAt(p);
  if (toggled) { toggleCollapsed(toggled); return null; }
  const handle = handleAt(selectedNodes().filter(resizable), p, tolerance());
  if (handle) return resizeGesture(p, handle.node, handle.dir);

  const node = nodeAt(store.doc.nodes, p, tolerance());
  if (node) {
    if (e.shiftKey) { toggleSelected(node.id); return null; }
    if (!store.ui.selNodes.includes(node.id)) select([node.id]);
    return moveGesture(p);
  }
  const edge = edgeAt(store.doc, p, tolerance());
  if (edge) { select([], edge.id); return null; }

  if (!e.shiftKey) select([]);
  return marqueeGesture(p);
}

function startGesture(e, p, spaceDown) {
  const tool = store.ui.tool;
  if (e.button === 1 || spaceDown) return panGesture(e);
  if (store.ui.readOnly) { // shared link: look around and open/close containers, nothing else
    const toggled = toggleAt(p);
    if (toggled) { toggled.collapsed = !toggled.collapsed; emit("doc"); return null; }
    return panGesture(e);
  }
  if (tool === "pan") {
    const hit = nodeAt(store.doc.nodes, p, tolerance()) || edgeAt(store.doc, p, tolerance());
    if (!hit) return panGesture(e);
    setTool("select");
    return selectPress(e, p);
  }
  if (tool === "select") return selectPress(e, p);
  if (TOOL_GESTURES[tool]) return TOOL_GESTURES[tool](p);
  if (isEdgeTool(tool)) {
    const src = nodeAt(store.doc.nodes, p, tolerance());
    return src ? linkGesture(p, src.id, edgeToolType(tool)) : null;
  }
  return CREATE_GESTURES[nodeType(tool).create](tool, p, e);
}

// ---- wiring -------------------------------------------------------------------------

export function initInteraction(canvas, { onEdit }) {
  let gesture = null, spaceDown = false;

  const idleCursor = () => (spaceDown || store.ui.tool === "pan" ? "grab"
    : store.ui.tool === "select" ? "default" : TOOL_CURSORS[store.ui.tool] || "crosshair");
  const setCursor = (c) => { canvas.style.cursor = c; };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    canvas.setPointerCapture(e.pointerId);
    emit("hover", null);
    gesture = startGesture(e, screenToWorld(e.clientX, e.clientY), spaceDown);
    if (gesture?.cursor) setCursor(gesture.cursor);
    if (e.button === 1) e.preventDefault();
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = screenToWorld(e.clientX, e.clientY);
    if (gesture) { gesture.move?.(p, e); return; }
    const hovered = nodeAt(store.doc.nodes, p, tolerance());
    if (store.ui.tool === "select" && !spaceDown) setCursor(hovered ? "move" : "default");
    // live-check tooltips listen to this
    emit("hover", hovered && (store.ui.tool === "select" || store.ui.tool === "pan") ? { id: hovered.id, clientX: e.clientX, clientY: e.clientY } : null);
  });

  const finish = (e) => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    g.up?.(screenToWorld(e.clientX, e.clientY), e);
    setCursor(idleCursor());
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointerleave", () => emit("hover", null));
  canvas.addEventListener("pointercancel", () => {
    gesture = null;
    store.ui.overlay.draft = store.ui.overlay.marquee = null;
    history.commit();
    emit("view");
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  // Double-click edits in place (ui/inlineEditor.js): the class part, shape text, or link label you clicked.
  canvas.addEventListener("dblclick", (e) => {
    const p = screenToWorld(e.clientX, e.clientY);
    const node = nodeAt(store.doc.nodes, p, tolerance());
    const edge = !node && edgeAt(store.doc, p, tolerance());
    if ((node || edge) && !store.ui.readOnly) onEdit({ node, edge }, p);
  });

  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !typing()) {
      e.preventDefault();
      if (!spaceDown) { spaceDown = true; if (!gesture) setCursor("grab"); }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") { spaceDown = false; if (!gesture) setCursor(idleCursor()); }
  });

  on("tool", () => setCursor(idleCursor()));
  // Exposed for debugging in the browser console.
  window.umlforge = { store, nodeById };
}
