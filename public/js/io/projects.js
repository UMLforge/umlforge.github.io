// "Your projects": a private project library stored in this browser (no accounts needed).
//
//   localStorage "umlforge-projects"          -> [{ id, title, created, updated, serverId, counts, thumb }]
//   localStorage "umlforge-project:<id>"      -> the diagram { problem, nodes, edges }
//
// The editor autosaves into the open project (io/storage.js); projects.html lists, opens, renames,
// duplicates, deletes and imports/exports them. Saving to the server is optional (serverId remembers it).
import { bounds } from "../canvas/geometry.js";
import { drawDiagram } from "../canvas/renderer.js";

const INDEX_KEY = "umlforge-projects";
const LEGACY_KEY = "umlforge-v2"; // single autosave used before the library existed
const docKey = (id) => `umlforge-project:${id}`;
const EMPTY = () => ({ problem: "", nodes: [], edges: [] });

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } // quota full / blocked
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function counts(doc) {
  const classes = doc.nodes.filter((n) => ["class", "interface", "abstract", "enum"].includes(n.type)).length;
  return { classes, links: doc.edges.length, shapes: doc.nodes.length };
}

/** Moves the old single autosave into the library, once. */
function migrate(index) {
  if (index.length) return index;
  const legacy = read(LEGACY_KEY, null);
  if (!legacy?.doc?.nodes?.length) return index;
  const meta = { id: newId(), title: legacy.file?.title || "My diagram", created: Date.now(), updated: Date.now(),
    serverId: legacy.file?.id || null, counts: counts(legacy.doc), thumb: "" };
  if (write(docKey(meta.id), legacy.doc) && write(INDEX_KEY, [meta])) {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    return [meta];
  }
  return index;
}

export function listProjects() {
  return migrate(read(INDEX_KEY, [])).sort((a, b) => b.updated - a.updated);
}

export const getProject = (id) => listProjects().find((p) => p.id === id) || null;

export function loadProjectDoc(id) {
  return { ...EMPTY(), ...read(docKey(id), EMPTY()) };
}

/** Saves the diagram and its card data. Returns false when browser storage is full. */
export function saveProject(meta, doc) {
  const index = listProjects().filter((p) => p.id !== meta.id);
  Object.assign(meta, { updated: Date.now(), counts: counts(doc) });
  return write(docKey(meta.id), doc) && write(INDEX_KEY, [meta, ...index]);
}

export function createProject(title = "Untitled", doc = EMPTY()) {
  const meta = { id: newId(), title, created: Date.now(), updated: Date.now(), serverId: null, counts: counts(doc), thumb: "" };
  if (!saveProject(meta, doc)) throw new Error("Browser storage is full");
  return meta;
}

export function updateMeta(id, patch) {
  const index = listProjects().map((p) => (p.id === id ? { ...p, ...patch } : p));
  write(INDEX_KEY, index);
}

export function deleteProject(id) {
  write(INDEX_KEY, listProjects().filter((p) => p.id !== id));
  try { localStorage.removeItem(docKey(id)); } catch { /* ignore */ }
}

export function duplicateProject(id) {
  const src = getProject(id);
  const copy = createProject(`Copy of ${src?.title || "project"}`, loadProjectDoc(id));
  updateMeta(copy.id, { thumb: src?.thumb || "" });
  return copy;
}

/** Small JPEG preview of a diagram for the project cards (keeps storage use low). */
export function thumbnail(doc, roughness = 1, w = 320, h = 200) {
  const b = bounds(doc.nodes);
  if (!b) return "";
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  const pad = 30, bw = b.maxX - b.minX + pad * 2, bh = b.maxY - b.minY + pad * 2;
  const scale = Math.min(w / bw, h / bh, 1);
  ctx.translate((w - bw * scale) / 2, (h - bh * scale) / 2);
  ctx.scale(scale, scale);
  ctx.translate(pad - b.minX, pad - b.minY);
  drawDiagram(ctx, structuredClone(doc), { roughness });
  return canvas.toDataURL("image/jpeg", 0.72);
}
