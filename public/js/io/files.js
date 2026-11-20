// Local file import/export: JSON diagram files and PNG images.
import { bounds } from "../canvas/geometry.js";
import { drawDiagram } from "../canvas/renderer.js";
import { store } from "../store.js";

function download(href, filename) {
  const a = document.createElement("a");
  a.href = href; a.download = filename; a.click();
}

const safeName = () => (store.file.title || "diagram").replace(/[^\w.-]+/g, "-").toLowerCase();

export function exportJson() {
  const data = { app: "umlforge", version: 2, title: store.file.title, ...store.doc };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  download(url, `${safeName()}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Reads a diagram file (version 1 and version 2 files both load). */
export async function readJsonFile(file) {
  const o = JSON.parse(await file.text());
  if (!Array.isArray(o.nodes)) throw new Error("not a UMLforge diagram");
  return { title: o.title, problem: o.problem ?? "", nodes: o.nodes, edges: o.edges || [] };
}

export function exportPng(scale = 2, pad = 40) {
  const b = bounds(store.doc.nodes);
  if (!b) return false;
  const w = Math.ceil(b.maxX - b.minX + pad * 2), h = Math.ceil(b.maxY - b.minY + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.translate(pad - b.minX, pad - b.minY);
  drawDiagram(ctx, store.doc, { roughness: store.ui.roughness });
  download(canvas.toDataURL("image/png"), `${safeName()}.png`);
  return true;
}
