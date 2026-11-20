// Free drawing tools, Excalidraw-style: text, rectangle, ellipse, diamond, line, arrow.
// (Pen and highlighter live in annotate.js.)
// Draw functions work in element-local coordinates: (0,0) is the top-left of the shape.
import { arrowheadPoints, diamondPath, roundedRectPath, styleKey } from "../canvas/pen.js";
import { registerNodeType } from "./registry.js";

function centeredName(pen, n, s) {
  if (n.name) pen.wrap(n.name, n.w / 2, n.h / 2 - 12, n.w - 24, 20, n.h - 10, { font: pen.font(16), color: s.ink, align: "center" });
}

// ---- point-based shapes (line, arrow, and the pen/highlighter in annotate.js) -------------------------------------------
// They store `points` relative to (x, y) plus the size they were drawn at (pw, ph),
// so resizing the box just scales the points.

export function scaledPoints(n) {
  const sx = n.pw ? n.w / n.pw : 1, sy = n.ph ? n.h / n.ph : 1;
  return (n.points || []).map(([x, y]) => [x * sx, y * sy]);
}

function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return pts.length === 1 ? Math.hypot(px - pts[0][0], py - pts[0][1]) : best;
}

export const polylineHit = (extra) => (n, p, tol) =>
  distToPolyline(p.x - n.x, p.y - n.y, scaledPoints(n)) <= tol + (n.strokeWidth || 2) * extra;

function drawLinear(withArrow) {
  return (pen, n, s) => {
    const pts = scaledPoints(n);
    if (pts.length < 2) return;
    const o = pen.style(n, { stroke: s.ink });
    const opts = o({ fill: undefined, linear: true });
    pen.shapes(`${styleKey(n)}|${pts.flat().map(Math.round).join(",")}`, (g) => {
      const out = [g.linearPath(pts, opts)];
      if (withArrow) {
        const [x1, y1] = pts[pts.length - 2], [x2, y2] = pts[pts.length - 1];
        out.push(g.linearPath(arrowheadPoints("arrow", x1, y1, x2, y2), { ...opts, strokeLineDash: undefined }));
      }
      return out;
    });
  };
}

// ---- registrations -------------------------------------------------------------------------

registerNodeType("rect", {
  label: "Rect", group: "sketch", styleProps: ["color", "bg", "fillStyle", "strokeWidth", "strokeStyle"],  key: "r", size: [170, 104], defaults: { bg: "transparent" },
  hint: "Rectangle: drag to draw, or click to drop one.",
  icon: '<rect x="3.5" y="5.5" width="13" height="9" rx="2"/>',
  draw(pen, n, s) {
    const o = pen.style(n, { stroke: s.ink, fill: s.bg });
    pen.shapes(`rect|${styleKey(n)}`, (g) => [g.path(roundedRectPath(n.w, n.h), o())]);
    centeredName(pen, n, s);
  },
});

registerNodeType("diamond", {
  label: "Diamond", group: "sketch", styleProps: ["color", "bg", "fillStyle", "strokeWidth", "strokeStyle"],  key: "d", size: [176, 132], anchor: "diamond", defaults: { bg: "transparent" },
  hint: "Diamond: drag to draw, or click to drop one.",
  icon: '<path d="M10 3l6.5 7L10 17 3.5 10z"/>',
  draw(pen, n, s) {
    const o = pen.style(n, { stroke: s.ink, fill: s.bg });
    pen.shapes(`diamond|${styleKey(n)}`, (g) => [g.path(diamondPath(n.w, n.h), o())]);
    centeredName(pen, n, s);
  },
});

registerNodeType("ellipse", {
  label: "Ellipse", group: "sketch", styleProps: ["color", "bg", "fillStyle", "strokeWidth", "strokeStyle"],  key: "o", size: [180, 112], anchor: "ellipse", defaults: { bg: "transparent" },
  hint: "Ellipse: drag to draw, or click to drop one.",
  icon: '<ellipse cx="10" cy="10" rx="6.5" ry="4.5"/>',
  draw(pen, n, s) {
    const o = pen.style(n, { stroke: s.ink, fill: s.bg });
    pen.shapes(`ellipse|${styleKey(n)}`, (g) => [g.ellipse(n.w / 2, n.h / 2, n.w, n.h, o({ curveFitting: 1 }))]);
    centeredName(pen, n, s);
  },
});

registerNodeType("arrow", {
  label: "Arrow", noFill: true, group: "sketch", styleProps: ["color", "strokeWidth", "strokeStyle"],  key: "a", size: [160, 0], fields: [], create: "linear", hit: polylineHit(1.5),
  hint: "Arrow: drag to draw a free arrow. To connect UML shapes, use the Links tools instead.",
  icon: '<path d="M3 16 16 4"/><path d="M9.5 4H16v6.5"/>',
  draw: drawLinear(true),
});

registerNodeType("line", {
  label: "Line", noFill: true, group: "sketch", styleProps: ["color", "strokeWidth", "strokeStyle"],  key: "l", size: [160, 0], fields: [], create: "linear", hit: polylineHit(1.5),
  hint: "Line: drag to draw a straight line.",
  icon: '<path d="M3 16 17 4"/>',
  draw: drawLinear(false),
});

registerNodeType("text", {
  label: "Text", noFill: true, group: "sketch", editOnCreate: true, styleProps: ["color", "fontSize"], key: "t", size: [210, 60], fields: ["text"], defaults: { text: "Label" },
  hint: "Text: click to drop a free label.",
  icon: '<path d="M4.5 5.5h11M10 5.5V17"/>',
  draw(pen, n, s) {
    const size = n.fontSize || 20;
    pen.wrap(n.text || "Label", 0, 0, n.w, size * 1.3, Math.max(n.h, size * 2), { font: pen.font(size), color: s.ink });
  },
});

