// Hit-testing and anchor math in world coordinates. Pure functions with no side effects.
import { hiddenIds } from "../model/groups.js";
import { nodeType } from "../shapes/registry.js";

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const center = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

// Point on the shape's outline in the direction of (tx, ty).
const ANCHORS = {
  rect(n, dx, dy) {
    const s = Math.min(n.w / 2 / Math.abs(dx || 1e-9), n.h / 2 / Math.abs(dy || 1e-9));
    return [dx * s, dy * s];
  },
  ellipse(n, dx, dy) {
    const rx = n.w / 2, ry = n.h / 2, t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return [dx * t, dy * t];
  },
  diamond(n, dx, dy) {
    const s = 1 / (Math.abs(dx) / (n.w / 2) + Math.abs(dy) / (n.h / 2));
    return [dx * s, dy * s];
  },
};

export function anchorFor(n, tx, ty) {
  const c = center(n), dx = tx - c.x, dy = ty - c.y;
  if (!dx && !dy) return c;
  const [ox, oy] = (ANCHORS[nodeType(n.type).anchor] || ANCHORS.rect)(n, dx, dy);
  return { x: c.x + ox, y: c.y + oy };
}

export function edgeEnds(edge, nodesById) {
  const a = nodesById.get(edge.a), b = nodesById.get(edge.b);
  if (!a || !b) return null;
  const ca = center(a), cb = center(b);
  return { p1: anchorFor(a, cb.x, cb.y), p2: anchorFor(b, ca.x, ca.y) };
}

export const indexNodes = (nodes) => new Map(nodes.map((n) => [n.id, n]));

/** Topmost node under p. Shapes with a `hit` function (lines, brush strokes) use it instead of their box. */
export function nodeAt(nodes, p, tolerance = 4) {
  const hidden = hiddenIds(nodes); // members of collapsed containers can't be clicked
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i], hit = nodeType(n.type).hit;
    if (hidden.has(n.id)) continue;
    if (hit ? hit(n, p, tolerance) : p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) return n;
  }
  return null;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function edgeAt(doc, p, tolerance) {
  const byId = indexNodes(doc.nodes), hidden = hiddenIds(doc.nodes);
  for (let i = doc.edges.length - 1; i >= 0; i--) {
    if (hidden.has(doc.edges[i].a) || hidden.has(doc.edges[i].b)) continue;
    const ends = edgeEnds(doc.edges[i], byId);
    if (ends && distToSegment(p, ends.p1, ends.p2) <= tolerance) return doc.edges[i];
  }
  return null;
}

export function handles(n) {
  const { x, y, w, h } = n;
  return [
    { x, y, dir: "nw" }, { x: x + w / 2, y, dir: "n" }, { x: x + w, y, dir: "ne" },
    { x: x + w, y: y + h / 2, dir: "e" }, { x: x + w, y: y + h, dir: "se" }, { x: x + w / 2, y: y + h, dir: "s" },
    { x, y: y + h, dir: "sw" }, { x, y: y + h / 2, dir: "w" },
  ];
}

export function handleAt(nodes, p, tolerance) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const hit = handles(nodes[i]).find((h) => Math.abs(p.x - h.x) <= tolerance && Math.abs(p.y - h.y) <= tolerance);
    if (hit) return { node: nodes[i], dir: hit.dir };
  }
  return null;
}

export function bounds(nodes) {
  if (!nodes.length) return null;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of nodes) {
    b.minX = Math.min(b.minX, n.x); b.minY = Math.min(b.minY, n.y);
    b.maxX = Math.max(b.maxX, n.x + n.w); b.maxY = Math.max(b.maxY, n.y + n.h);
  }
  return b;
}
