// Organizing containers (package, module, component, container, plugin): pure helpers.
//
// A member points at its container with `node.parent = groupId` (containers can nest).
// - Expanded container: its box is fitted around its members (layoutGroups), so moving it moves them.
// - Collapsed container (`collapsed: true`): a compact box; members are hidden and links to them are
//   drawn to the container instead (visibleRep). That is how a big diagram becomes an overview.
// Operations that change the diagram (group, ungroup, collapse) live in model/diagram.js.
import { nodeType } from "../shapes/registry.js";

export const HEADER = 34;           // title band of an expanded container
export const PAD = 26;              // space between members and the container's border
export const COLLAPSED = [220, 78];  // size of a collapsed container
const memberCount = new Map();      // container id -> number of members inside (for "12 items")

export const isGroup = (n) => !!n && !!nodeType(n.type).isGroup;
export const indexNodes = (nodes) => new Map(nodes.map((n) => [n.id, n]));
export const countOf = (g) => memberCount.get(g.id) || 0; // by id: renderers draw copies of nodes

/** Containers above `n`, nearest first. Cycle-safe. */
export function ancestors(n, idx) {
  const out = [], seen = new Set([n.id]);
  let p = n.parent && idx.get(n.parent);
  while (p && !seen.has(p.id)) { out.push(p); seen.add(p.id); p = p.parent && idx.get(p.parent); }
  return out;
}

export function descendants(groupId, nodes) {
  const kids = new Map();
  for (const n of nodes) if (n.parent) (kids.get(n.parent) || kids.set(n.parent, []).get(n.parent)).push(n);
  const out = [], stack = [...(kids.get(groupId) || [])];
  while (stack.length) {
    const n = stack.pop();
    out.push(n);
    stack.push(...(kids.get(n.id) || []));
  }
  return out;
}

/** Ids of nodes inside a collapsed container (not drawn, not clickable). */
export function hiddenIds(nodes, idx = indexNodes(nodes)) {
  const hidden = new Set();
  for (const n of nodes) if (ancestors(n, idx).some((a) => a.collapsed)) hidden.add(n.id);
  return hidden;
}

/** What stands for node `id` on screen: itself, or its outermost collapsed container. */
export function visibleRep(id, idx) {
  const n = idx.get(id);
  if (!n) return null;
  let rep = n;
  for (const a of ancestors(n, idx)) if (a.collapsed) rep = a;
  return rep;
}

/** Fits every expanded container around its members (deepest first) and sizes collapsed ones. */
export function layoutGroups(nodes) {
  const idx = indexNodes(nodes);
  for (const n of nodes) if (n.parent && (!idx.has(n.parent) || n.parent === n.id)) delete n.parent; // dangling
  const groups = nodes.filter(isGroup).sort((a, b) => ancestors(b, idx).length - ancestors(a, idx).length);
  for (const g of groups) {
    memberCount.set(g.id, descendants(g.id, nodes).filter((d) => !isGroup(d)).length);
    if (g.collapsed) { [g.w, g.h] = COLLAPSED; continue; }
    const kids = nodes.filter((n) => n.parent === g.id);
    if (!kids.length) continue; // an empty frame keeps the size it was drawn with
    const minX = Math.min(...kids.map((k) => k.x)), minY = Math.min(...kids.map((k) => k.y));
    const maxX = Math.max(...kids.map((k) => k.x + k.w)), maxY = Math.max(...kids.map((k) => k.y + k.h));
    Object.assign(g, { x: minX - PAD, y: minY - PAD - HEADER, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 + HEADER });
  }
}

/** The innermost expanded, visible container whose box contains n's center (never n or its own members). */
export function containerAt(n, nodes) {
  const idx = indexNodes(nodes), hidden = hiddenIds(nodes, idx);
  const own = new Set([n.id, ...descendants(n.id, nodes).map((d) => d.id)]);
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const fits = nodes.filter((g) => isGroup(g) && !g.collapsed && !own.has(g.id) && !hidden.has(g.id)
    && cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h);
  return fits.sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;
}

/** Local rectangle of the collapse/expand button in a container's title band. */
export const toggleRect = (g) => ({ x: g.w - 28, y: 7, w: 20, h: 20 });
