// Camera: converts between screen and world coordinates, handles zoom, fit and centering.
import { ZOOM_MAX, ZOOM_MIN } from "../config.js";
import { emit, store } from "../store.js";
import { bounds, clamp } from "./geometry.js";

let canvas = null;
export const initCamera = (el) => { canvas = el; };

const rect = () => canvas.getBoundingClientRect();

export function screenToWorld(sx, sy) {
  const r = rect(), { x, y, zoom } = store.cam;
  return { x: (sx - r.left) / zoom + x, y: (sy - r.top) / zoom + y };
}

export function zoomAt(sx, sy, factor) {
  const before = screenToWorld(sx, sy), r = rect(), cam = store.cam;
  cam.zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  cam.x = before.x - (sx - r.left) / cam.zoom;
  cam.y = before.y - (sy - r.top) / cam.zoom;
  emit("view");
}

export function zoomCenter(factor) {
  const r = rect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}

export function centerOn(x, y) {
  const r = rect(), cam = store.cam;
  cam.x = x - r.width / 2 / cam.zoom;
  cam.y = y - r.height / 2 / cam.zoom;
  emit("view");
}

export function fitView(pad = 70) {
  const b = bounds(store.doc.nodes), cam = store.cam;
  if (!b) { Object.assign(cam, { x: 0, y: 0, zoom: 1 }); emit("view"); return; }
  const r = rect(), w = b.maxX - b.minX || 1, h = b.maxY - b.minY || 1;
  cam.zoom = clamp(Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h), ZOOM_MIN, 2);
  cam.x = b.minX - (r.width / cam.zoom - w) / 2;
  cam.y = b.minY - (r.height / cam.zoom - h) / 2;
  emit("view");
}

/** World point -> pixel position inside the canvas element (for DOM overlays like callouts). */
export function worldToCanvas(x, y) {
  const { x: cx, y: cy, zoom } = store.cam;
  return { x: (x - cx) * zoom, y: (y - cy) * zoom };
}
