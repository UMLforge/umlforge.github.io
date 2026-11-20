// Link (edge) types and how they are drawn, in Excalidraw style (rough lines, Excalidraw arrowheads).
// To add a type, add an entry to EDGE_TYPES:
//   dashed: dashed line?   head: decoration at the target ("triangle" | "arrow" | null)
//   tail: decoration at the source ("diamond" | "diamond-filled" | null)
//   toolbar: show a tool button?   multiplicity: takes multiplicities (used by analysis)
import { INKS, THEME } from "../config.js";
import { arrowheadPoints, hashStr } from "../canvas/pen.js";

export const EDGE_TYPES = {
  association: {
    label: "Assoc", toolbar: true, multiplicity: true,
    hint: "Association: press on a source shape, drag to the target, release. Add a verb label and multiplicities.",
    icon: '<path d="M2.5 10h15"/>',
  },
  inheritance: {
    label: "Inherit", toolbar: true, head: "triangle",
    hint: "Inheritance: drag from the child subclass to the parent superclass.",
    icon: '<path d="M2.5 10h8"/><path d="M10.5 6.5 17 10l-6.5 3.5z" fill="#fff"/>',
  },
  composition: {
    label: "Compos", toolbar: true, tail: "diamond-filled", multiplicity: true,
    hint: "Composition: drag from the whole to the part. The filled diamond lands on the whole.",
    icon: '<path d="M2.5 10h7"/><path d="M9.5 10l4-2.8 4 2.8-4 2.8z" fill="currentColor" stroke="none"/>',
  },
  aggregation: {
    label: "Aggreg", toolbar: true, tail: "diamond", multiplicity: true,
    hint: "Aggregation: drag from the whole to the part. The hollow diamond lands on the whole.",
    icon: '<path d="M2.5 10h7"/><path d="M9.5 10l4-2.8 4 2.8-4 2.8z" fill="#fff"/>',
  },
  dependency: {
    label: "Depend", toolbar: true, dashed: true, head: "arrow",
    hint: "Dependency: dashed arrow, drag from the client to the supplier. Label it «use», «create», «include» or «extend».",
    icon: '<path d="M2.5 10h9.5" stroke-dasharray="2.5 2.2"/><path d="M12 6.2l5 3.8-5 3.8"/>',
  },
  realization: {
    label: "Realize", toolbar: true, dashed: true, head: "triangle",
    hint: "Realization: dashed line with a hollow triangle, drag from a class to the interface it implements.",
    icon: '<path d="M2.5 10h7" stroke-dasharray="2.5 2.2"/><path d="M9.5 6.5 16 10l-6.5 3.5z" fill="#fff"/>',
  },
  directed: { label: "Directed", head: "arrow", multiplicity: true },
};

export const edgeType = (type) => EDGE_TYPES[type] || EDGE_TYPES.association;

// UML notation needs its symbols to stay recognizable, so they are larger than Excalidraw's arrowheads,
// drawn with much less wobble than the line, and the line stops at the symbol instead of running through it.
const HEADS = {
  triangle: { size: 22, angle: 30 },  // generalization / realization: big hollow triangle
  arrow: { size: 18, angle: 30 },     // dependency / navigability: open arrow
  diamond: { size: 14, angle: 38 },   // aggregation (hollow) / composition (filled): 28px long
};

/** How far the line must stop short of the end so it meets the symbol's base. */
function inset(kind) {
  if (kind === "triangle") return HEADS.triangle.size * Math.cos((HEADS.triangle.angle * Math.PI) / 180);
  if (kind === "diamond" || kind === "diamond-filled") return HEADS.diamond.size * 2;
  return 0;
}

function decoration(g, kind, from, to, opts, ink) {
  if (!kind) return null;
  const crisp = { ...opts, roughness: Math.min(opts.roughness, 0.6) * 0.5, strokeLineDash: undefined, disableMultiStroke: true, fillStyle: "solid" };
  const shape = kind.startsWith("diamond") ? "diamond" : kind;
  const pts = arrowheadPoints(shape, from.x, from.y, to.x, to.y, HEADS[shape]);
  if (kind === "arrow") return g.linearPath(pts, crisp);
  return g.polygon(pts, { ...crisp, fill: kind === "diamond-filled" ? ink : "#fff" });
}

export function drawEdge(pen, e, p1, p2) {
  const def = edgeType(e.type), ink = INKS[e.color] || INKS.slate;
  const o = pen.style(e, { stroke: ink });
  const opts = o({ linear: true, strokeStyle: def.dashed ? "dashed" : "solid" });
  const key = [e.id, e.type, e.color, e.strokeWidth, p1.x, p1.y, p2.x, p2.y].map((v) => (typeof v === "number" ? Math.round(v) : v)).join("|");

  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, ux = (p2.x - p1.x) / len, uy = (p2.y - p1.y) / len;
  const a = inset(def.tail), b = inset(def.head);
  const start = { x: p1.x + ux * a, y: p1.y + uy * a }, end = { x: p2.x - ux * b, y: p2.y - uy * b };

  pen.shapes(key, (g) => [
    g.linearPath([[start.x, start.y], [end.x, end.y]], opts),
    decoration(g, def.head, p1, p2, opts, ink),
    decoration(g, def.tail, p2, p1, { ...opts, seed: hashStr(e.id) + 1 }, ink),
  ].filter(Boolean));
}

// Label in the middle, multiplicities beside each end. On short links the label moves off the line
// and the multiplicities are anchored to their own end, so nothing overlaps the arrowheads or each other.
export function drawEdgeLabels(pen, e, p1, p2) {
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  const dx = (p2.x - p1.x) / len, dy = (p2.y - p1.y) / len;
  let nx = -dy, ny = dx;                       // unit normal...
  if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; } // ...pointing down / right
  const font = pen.font(13), horizontal = Math.abs(dx) >= Math.abs(dy);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  if (len < 160) pen.label(e.label, mid.x - nx * 18, mid.y - ny * 18, { color: THEME.labelInk, font, plain: true });
  else pen.label(e.label, mid.x, mid.y, { color: THEME.labelInk, font });

  const gap = Math.min(34, len * 0.2), side = 16;
  const at = (p, dir) => ({ x: p.x + dx * gap * dir + nx * side, y: p.y + dy * gap * dir + ny * side });
  // Horizontal-ish: each multiplicity grows away from its end toward the middle. Vertical-ish: beside the line.
  const alignA = horizontal ? (dx > 0 ? "left" : "right") : (nx > 0 ? "left" : "right");
  const alignB = horizontal ? (dx > 0 ? "right" : "left") : alignA;
  const a = at(p1, 1), b = at(p2, -1);
  // Too short for both side by side? Stack the target's multiplicity one line lower.
  pen.ctx.font = font;
  const widths = pen.ctx.measureText(e.multA || "").width + pen.ctx.measureText(e.multB || "").width + 16;
  if (horizontal && e.multA && e.multB && widths > len - 2 * gap) { b.x += nx * 18; b.y += ny * 18; } // stack below
  pen.label(e.multA, a.x, a.y, { color: THEME.accent, font, align: alignA, plain: true });
  pen.label(e.multB, b.x, b.y, { color: THEME.accent, font, align: alignB, plain: true });
}
