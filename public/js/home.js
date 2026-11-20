// Homepage: draws a live example with the app's own renderer, and lists your recent projects.
import "./shapes/uml.js";
import "./shapes/groups.js";
import { bounds } from "./canvas/geometry.js";
import { drawDiagram } from "./canvas/renderer.js";
import { listProjects } from "./io/projects.js";
import { diagramFromSpec } from "./model/diagram.js";
import { layoutGroups } from "./model/groups.js";
import { projectCard } from "./ui/projectCard.js";

const EXAMPLE = {
  classes: [
    { name: "Book", x: 120, y: 120, attrs: ["- isbn: String", "- title: String"], methods: ["+ reserve(): bool"] },
    { name: "Copy", x: 420, y: 120, attrs: ["- barcode: String"], methods: ["+ isAvailable(): bool"] },
    { name: "Member", x: 120, y: 420, attrs: ["- name: String"], methods: ["+ borrow(c: Copy): Loan"] },
    { name: "Loan", x: 420, y: 420, attrs: ["- dueDate: Date"], methods: ["+ isOverdue(): bool"] },
  ],
  edges: [
    { type: "composition", from: "Book", to: "Copy", label: "has", multA: "1", multB: "1..*" },
    { type: "association", from: "Member", to: "Loan", label: "borrows", multA: "1", multB: "0..*" },
    { type: "association", from: "Loan", to: "Copy", label: "for", multA: "0..*", multB: "1" },
  ],
};

function exampleDoc() {
  const doc = diagramFromSpec(EXAMPLE);
  const [book, copy] = doc.nodes;
  const catalog = { id: "catalog", type: "module", name: "Catalog", x: 0, y: 0, w: 10, h: 10, attrs: [], methods: [], text: "", color: "slate", bg: "transparent" };
  book.parent = copy.parent = catalog.id;
  doc.nodes.unshift(catalog);
  layoutGroups(doc.nodes);
  return doc;
}

function drawHero() {
  const canvas = document.getElementById("heroCanvas");
  const doc = exampleDoc();
  const paint = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, r.width, r.height);
    const b = bounds(doc.nodes), pad = 30;
    const scale = Math.min(r.width / (b.maxX - b.minX + pad * 2), r.height / (b.maxY - b.minY + pad * 2));
    ctx.translate((r.width - (b.maxX - b.minX) * scale) / 2, (r.height - (b.maxY - b.minY) * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(-b.minX, -b.minY);
    drawDiagram(ctx, doc, { roughness: 1 });
  };
  paint();
  new ResizeObserver(paint).observe(canvas);
  document.fonts?.load('16px "Virgil"').then(paint, () => {});
}

function showRecent() {
  const recent = listProjects().slice(0, 4);
  if (!recent.length) return;
  document.getElementById("recentBlock").hidden = false;
  document.getElementById("recentCards").innerHTML = recent.map((p) => projectCard(p, { menu: false })).join("");
}

drawHero();
showRecent();
