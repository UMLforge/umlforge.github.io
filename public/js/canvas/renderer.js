// Paints the board. drawDiagram() is reused by the PNG export.
import { DEFAULT_STYLE, FILLS, GRID_STEP, INKS, THEME } from "../config.js";
import { drawEdge, drawEdgeLabels } from "../edges/registry.js";
import { ancestors, hiddenIds, isGroup, layoutGroups, visibleRep } from "../model/groups.js";
import { nodeType } from "../shapes/registry.js";
import { on, store } from "../store.js";
import { anchorFor, edgeEnds, handles, indexNodes } from "./geometry.js";
import { createPen } from "./pen.js";

const styleOf = (n) => ({ ink: INKS[n.color] || INKS.slate, bg: FILLS[n.bg] ?? FILLS.white });

/** Draws edges, then nodes, in world coordinates onto any 2D context. */
/** Links as drawn: a link to a member of a collapsed container is redrawn to that container (once). */
function visibleLinks(doc, byId, hidden) {
  const out = [], seen = new Set();
  for (const e of doc.edges) {
    if (!hidden.has(e.a) && !hidden.has(e.b)) { out.push(e); continue; }
    const a = visibleRep(e.a, byId), b = visibleRep(e.b, byId);
    if (!a || !b || a.id === b.id) continue;
    const key = `${e.type}|${a.id}|${b.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, id: `${e.id}~${a.id}~${b.id}`, a: a.id, b: b.id, label: "", multA: "", multB: "" });
  }
  return out;
}

export function drawDiagram(ctx, doc, { roughness = 1, faded = null } = {}) {
  layoutGroups(doc.nodes); // containers fit around their members
  const pen = createPen(ctx, { roughness });
  const byId = indexNodes(doc.nodes), hidden = hiddenIds(doc.nodes, byId);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // draw order: containers (outermost first), then links, then everything else
  const visible = doc.nodes.filter((n) => !hidden.has(n.id));
  const groups = visible.filter(isGroup).sort((a, b) => ancestors(a, byId).length - ancestors(b, byId).length);
  const drawNode = (n) => {
    ctx.save();
    if (faded?.has(n.id)) ctx.globalAlpha = 0.2; // being erased
    ctx.translate(n.x, n.y); // shapes draw in local coordinates (cache-friendly, like Excalidraw)
    nodeType(n.type).draw(pen, { ...DEFAULT_STYLE, ...n }, styleOf(n));
    ctx.restore();
  };
  groups.forEach(drawNode);
  const links = visibleLinks(doc, byId, hidden).map((e) => ({ e: { ...DEFAULT_STYLE, ...e }, ends: edgeEnds(e, byId) })).filter((l) => l.ends);
  // Two passes: all lines first, then all labels, so no line ever crosses a label.
  for (const pass of [drawEdge, drawEdgeLabels]) {
    for (const { e, ends } of links) {
      ctx.globalAlpha = faded?.has(e.id) ? 0.2 : 1;
      pass(pen, e, ends.p1, ends.p2);
    }
  }
  ctx.globalAlpha = 1;
  visible.filter((n) => !isGroup(n)).forEach(drawNode);
}

// Excalidraw-like grid: thin lines, a darker line every 5 cells.
function drawGrid(ctx, w, h) {
  const { x, y, zoom } = store.cam, step = GRID_STEP * zoom;
  if (step < 6) return;
  const first = (origin) => Math.floor(origin / GRID_STEP);
  ctx.lineWidth = 1;
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? THEME.gridMajor : THEME.gridMinor;
    ctx.beginPath();
    for (let i = first(x); (i * GRID_STEP - x) * zoom < w; i++) {
      if ((i % 5 === 0) !== major) continue;
      const sx = Math.round((i * GRID_STEP - x) * zoom) + 0.5;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
    }
    for (let j = first(y); (j * GRID_STEP - y) * zoom < h; j++) {
      if ((j % 5 === 0) !== major) continue;
      const sy = Math.round((j * GRID_STEP - y) * zoom) + 0.5;
      ctx.moveTo(0, sy); ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }
}

const LASER_MS = 1000;

/** Red trail that fades over a second. Returns true while something is still visible. */
function drawLaser(ctx, px) {
  const trail = store.ui.overlay.laser, now = performance.now();
  while (trail.length && (trail[0] === null || now - trail[0].t > LASER_MS)) trail.shift();
  if (!trail.length) return false;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    if (!a || !b) continue;
    const life = 1 - (now - b.t) / LASER_MS;
    ctx.strokeStyle = `rgba(255, 32, 32, ${Math.max(0, life)})`;
    ctx.lineWidth = px(2 + 3 * life);
    ctx.shadowColor = "rgba(255, 0, 0, 0.6)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
  return true;
}

// Live-check badges: a small red (critical) or orange (warning) dot on shapes that break a rule.
const BADGE_COLORS = { crit: "#e03131", warn: "#f08c00" };
function drawBadges(ctx, byId, px) {
  if (!store.ui.liveCheck) return;
  const hidden = hiddenIds(store.doc.nodes, byId);
  for (const [id, issues] of store.ui.issuesByNode) {
    const n = !hidden.has(id) && byId.get(id), shown = issues.filter((i) => i.badge);
    if (!n || !shown.length) continue;
    const sev = shown.some((i) => i.sev === "crit") ? "crit" : "warn";
    const r = px(9), cx = n.x + n.w, cy = n.y;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = BADGE_COLORS[sev]; ctx.fill();
    ctx.lineWidth = px(2); ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${px(11)}px Inter, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(shown.length > 1 ? String(shown.length) : "!", cx, cy + px(0.5));
    ctx.textBaseline = "alphabetic";
  }
}

function drawOverlays(ctx) {
  const { overlay, selNodes, selEdge } = store.ui, zoom = store.cam.zoom;
  const byId = indexNodes(store.doc.nodes);
  const px = (v) => v / zoom; // screen pixels -> world units
  drawBadges(ctx, byId, px);
  ctx.strokeStyle = THEME.selection;

  if (overlay.draft) { // link being dragged
    const src = byId.get(overlay.draft.fromId);
    if (src) {
      const p = anchorFor(src, overlay.draft.cur.x, overlay.draft.cur.y);
      ctx.setLineDash([px(6), px(4)]); ctx.lineWidth = px(2);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(overlay.draft.cur.x, overlay.draft.cur.y); ctx.stroke();
      ctx.strokeRect(src.x - px(5), src.y - px(5), src.w + px(10), src.h + px(10));
      ctx.setLineDash([]);
    }
  }
  if (overlay.marquee) {
    const m = overlay.marquee;
    ctx.fillStyle = "rgba(105, 101, 219, 0.08)";
    ctx.lineWidth = px(1);
    const [x, y, w, h] = [Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0)];
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  }
  const hiddenSel = hiddenIds(store.doc.nodes, byId);
  for (const id of selNodes) {
    const n = byId.get(id);
    if (!n || hiddenSel.has(id)) continue;
    const fitted = isGroup(n) && (n.collapsed || store.doc.nodes.some((m) => m.parent === n.id)); // sized by members
    const pad = px(6), hs = px(9);
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(4), px(3)]);
    ctx.strokeRect(n.x - pad, n.y - pad, n.w + pad * 2, n.h + pad * 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    for (const h of fitted ? [] : handles(n)) {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(h.x - hs / 2, h.y - hs / 2, hs, hs, px(2)) : ctx.rect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      ctx.fill(); ctx.stroke();
    }
  }
  const edge = selEdge && store.doc.edges.find((e) => e.id === selEdge);
  const ends = edge && edgeEnds(edge, byId);
  if (ends) {
    ctx.fillStyle = "#fff"; ctx.lineWidth = px(1.5);
    for (const p of [ends.p1, ends.p2, { x: (ends.p1.x + ends.p2.x) / 2, y: (ends.p1.y + ends.p2.y) / 2 }]) {
      ctx.beginPath(); ctx.arc(p.x, p.y, px(5), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  return drawLaser(ctx, px);
}

export function initRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let dpr = 1, queued = false;

  function paint() {
    const { width, height } = canvas.getBoundingClientRect(), { x, y, zoom } = store.cam;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = THEME.paper; ctx.fillRect(0, 0, width, height);
    if (store.ui.grid) drawGrid(ctx, width, height);
    ctx.save();
    ctx.scale(zoom, zoom); ctx.translate(-x, -y);
    drawDiagram(ctx, store.doc, { roughness: store.ui.roughness, faded: store.ui.overlay.erasing });
    const animating = drawOverlays(ctx);
    ctx.restore();
    if (animating) requestDraw(); // keep fading the laser trail
  }

  function requestDraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; paint(); });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(50, Math.round(r.width * dpr));
    canvas.height = Math.max(50, Math.round(r.height * dpr));
    requestDraw();
  }

  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  ["doc", "view", "selection"].forEach((evt) => on(evt, requestDraw));
  // The Virgil webfont loads lazily; ask for it and repaint once it is ready so canvas text uses it.
  document.fonts?.load('16px "Virgil"').then(requestDraw, () => {});
  document.fonts?.ready.then(requestDraw);
  return { requestDraw };
}
