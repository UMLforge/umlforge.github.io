// Every change to the diagram goes through these functions. They record undo history
// and emit events, so callers never need to remember to.
import { history } from "../history.js";
import { nodeType } from "../shapes/registry.js";
import { ancestors, containerAt, descendants, indexNodes, isGroup, layoutGroups } from "./groups.js";
import { emit, store } from "../store.js";

export const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 9);
export const nodeById = (id) => store.doc.nodes.find((n) => n.id === id) || null;
export const edgeById = (id) => store.doc.edges.find((e) => e.id === id) || null;
export const selectedNodes = () => store.ui.selNodes.map(nodeById).filter(Boolean);
export const selectedEdge = () => (store.ui.selEdge ? edgeById(store.ui.selEdge) : null);
export const splitLines = (t) => String(t || "").split("\n").map((s) => s.trim()).filter(Boolean);

export function select(nodeIds = [], edgeId = null) {
  store.ui.selNodes = nodeIds;
  store.ui.selEdge = edgeId;
  emit("selection");
}

export function toggleSelected(id) {
  const ids = store.ui.selNodes;
  select(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

// ---- creation -------------------------------------------------------------------

const counters = {};

/** Builds a node centered on (cx, cy) without adding it to the diagram. */
export function createNode(type, cx, cy, overrides = {}) {
  const def = nodeType(type);
  counters[type] = (counters[type] || 0) + 1;
  const [w, h] = def.size;
  const n = {
    id: uid("n"), type, x: 0, y: 0, w, h,
    name: def.namePrefix ? def.namePrefix + counters[type] : "",
    attrs: [], methods: [], text: "", color: "slate", bg: "white",
    ...structuredClone(def.defaults), ...store.ui.toolStyle[type], ...overrides, // toolStyle = style panel choices
  };
  fitHeight(n);
  n.x = Math.round(cx - n.w / 2);
  n.y = Math.round(cy - n.h / 2);
  return n;
}

/** Grows class-like boxes so all members stay visible. */
export function fitHeight(n) {
  const auto = nodeType(n.type).autoHeight;
  if (auto) n.h = Math.max(n.h, auto(n));
}

export function addNode(type, cx, cy) {
  history.record();
  const n = createNode(type, cx, cy);
  store.doc.nodes.push(n);
  emit("doc");
  select([n.id]);
  return n;
}

export function addEdge(type, fromId, toId) {
  history.record();
  const e = { id: uid("e"), type, a: fromId, b: toId, label: "", multA: "", multB: "", color: "slate" };
  store.doc.edges.push(e);
  emit("doc");
  select([], e.id);
  return e;
}

// ---- selection operations -----------------------------------------------------------

/** Ids plus every member of the containers among them. */
function withMembers(ids) {
  const all = new Set(ids);
  for (const id of ids) descendants(id, store.doc.nodes).forEach((d) => all.add(d.id));
  return all;
}

export function deleteSelection() {
  const ids = withMembers(store.ui.selNodes), edgeId = store.ui.selEdge;
  if (!ids.size && !edgeId) return;
  history.record();
  store.doc.nodes = store.doc.nodes.filter((n) => !ids.has(n.id));
  store.doc.edges = store.doc.edges.filter((e) => !ids.has(e.a) && !ids.has(e.b) && e.id !== edgeId);
  emit("doc");
  select([]);
}

/** Deletes nodes and edges by id (eraser). Links touching a removed node go too. One undo step. */
export function removeItems(ids) {
  if (!ids.size) return;
  ids = withMembers(ids);
  history.record();
  store.doc.nodes = store.doc.nodes.filter((n) => !ids.has(n.id));
  store.doc.edges = store.doc.edges.filter((e) => !ids.has(e.id) && !ids.has(e.a) && !ids.has(e.b));
  emit("doc");
  select([]);
}

export function duplicateSelection() {
  const nodes = selectedNodes(), edge = selectedEdge();
  if (!nodes.length && !edge) return;
  history.record();
  if (!nodes.length) {
    const copy = { ...structuredClone(edge), id: uid("e") };
    store.doc.edges.push(copy);
    emit("doc");
    return select([], copy.id);
  }
  const idMap = new Map();
  const all = [...withMembers(nodes.map((n) => n.id))].map(nodeById).filter(Boolean);
  for (const n of all) idMap.set(n.id, uid("n"));
  for (const n of all) {
    const copy = { ...structuredClone(n), id: idMap.get(n.id), x: n.x + 28, y: n.y + 28 };
    if (n.parent && idMap.has(n.parent)) copy.parent = idMap.get(n.parent);
    store.doc.nodes.push(copy);
  }
  for (const e of [...store.doc.edges]) {
    if (idMap.has(e.a) && idMap.has(e.b)) {
      store.doc.edges.push({ ...structuredClone(e), id: uid("e"), a: idMap.get(e.a), b: idMap.get(e.b) });
    }
  }
  emit("doc");
  select(nodes.map((n) => idMap.get(n.id)));
}

export function alignLeft() {
  const nodes = selectedNodes();
  if (nodes.length < 2) return;
  history.record();
  const x = Math.min(...nodes.map((n) => n.x));
  nodes.forEach((n) => { n.x = x; });
  emit("doc");
}

// ---- organizing containers (see model/groups.js) ------------------------------------------

/** Puts `n` into the container under its center, or takes it out when it is outside all of them. */
export function assignContainer(n) {
  const target = containerAt(n, store.doc.nodes);
  if (target) n.parent = target.id; else delete n.parent;
}

/** Wraps the selected shapes in a new container of `type` (package, module, component, container, plugin). */
export function groupSelection(type) {
  const sel = selectedNodes();
  if (!sel.length) return;
  history.record();
  const idx = indexNodes(store.doc.nodes), ids = new Set(sel.map((n) => n.id));
  const top = sel.filter((n) => !ancestors(n, idx).some((a) => ids.has(a.id))); // not already inside a selected one
  const g = createNode(type, 0, 0);
  const parents = new Set(top.map((n) => n.parent || ""));
  if (parents.size === 1 && [...parents][0]) g.parent = [...parents][0]; // keep the new container where they were
  top.forEach((n) => { n.parent = g.id; });
  store.doc.nodes.push(g);
  layoutGroups(store.doc.nodes);
  emit("doc");
  select([g.id]);
  emit("created", g); // name it right away
}

/** Removes a container but keeps its members (they move up one level). */
export function ungroup(groupId) {
  const g = nodeById(groupId);
  if (!isGroup(g)) return;
  history.record();
  store.doc.nodes.forEach((n) => { if (n.parent === g.id) { if (g.parent) n.parent = g.parent; else delete n.parent; } });
  store.doc.nodes = store.doc.nodes.filter((n) => n.id !== g.id);
  store.doc.edges = store.doc.edges.filter((e) => e.a !== g.id && e.b !== g.id);
  emit("doc");
  select([]);
}

export function setCollapsed(groupIds, collapsed) {
  const groups = groupIds.map(nodeById).filter((g) => isGroup(g) && !!g.collapsed !== collapsed);
  if (!groups.length) return;
  history.record();
  groups.forEach((g) => { g.collapsed = collapsed; });
  emit("doc");
}

export const toggleCollapsed = (g) => setCollapsed([g.id], !g.collapsed);

/** Overview: collapse every container. Detail: expand them all. */
export function setAllCollapsed(collapsed) {
  setCollapsed(store.doc.nodes.filter(isGroup).map((g) => g.id), collapsed);
}

/** Replaces the whole diagram (load, sample, starter). Undoable. */
export function replaceDiagram({ problem, nodes = [], edges = [] }, { record = true } = {}) {
  if (record) history.record();
  store.doc.nodes = nodes;
  store.doc.edges = edges;
  if (typeof problem === "string") store.doc.problem = problem;
  emit("replaced"); // tells live checks not to pop callouts for a freshly loaded diagram
  emit("doc");
  select([]);
}

// ---- specs: the compact format used by samples and the AI starter ----------------------
// { problem?, classes: [{ name, type?, attrs, methods, x?, y? }], edges: [{ type, from, to, label, multA, multB }] }

/**
 * Positions for classes without coordinates (AI or keyword starter): the most-connected class in the
 * center, the rest on an ellipse around it, so links fan out instead of running behind other boxes.
 */
function radialLayout(classes, edges) {
  const degree = new Map(classes.map((c) => [c.name, 0]));
  for (const e of edges) for (const end of [e.from, e.to]) if (degree.has(end)) degree.set(end, degree.get(end) + 1);
  const hub = [...degree.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const others = classes.filter((c) => c.name !== hub);
  const r = Math.max(300, (others.length * 270) / (2 * Math.PI));
  const pos = new Map([[hub, { x: 0, y: 0 }]]);
  others.forEach((c, i) => {
    const a = -Math.PI / 2 + (i / others.length) * 2 * Math.PI; // start at the top, go clockwise
    pos.set(c.name, { x: Math.round(Math.cos(a) * r * 1.3), y: Math.round(Math.sin(a) * r * 0.85) });
  });
  return pos;
}

export function diagramFromSpec(spec) {
  const classes = spec.classes || [];
  const layout = classes.some((c) => c.x == null) ? radialLayout(classes, spec.edges || []) : new Map();
  const byName = new Map();
  const nodes = classes.map((c) => {
    const cx = c.x ?? layout.get(c.name).x;
    const cy = c.y ?? layout.get(c.name).y;
    const n = createNode(c.type || "class", cx, cy, { name: c.name, attrs: c.attrs || [], methods: c.methods || [], w: 200 });
    byName.set(c.name, n);
    return n;
  });
  const edges = (spec.edges || [])
    .filter((e) => byName.has(e.from) && byName.has(e.to) && e.from !== e.to)
    .map((e) => ({
      id: uid("e"), type: e.type || "association", a: byName.get(e.from).id, b: byName.get(e.to).id,
      label: e.label || "", multA: e.multA || "", multB: e.multB || "", color: "slate",
    }));
  return { problem: spec.problem, nodes, edges };
}
