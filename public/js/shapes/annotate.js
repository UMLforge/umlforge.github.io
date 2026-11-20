// Annotation tools that create shapes: pen and highlighter.
// (Eraser and laser pointer are tools without shapes; see canvas/interaction.js.)
import { freedrawPath, styleKey } from "../canvas/pen.js";
import { registerNodeType } from "./registry.js";
import { polylineHit, scaledPoints } from "./sketch.js";

// type stays "freedraw" so diagrams saved with the earlier Brush tool still load.
registerNodeType("freedraw", {
  label: "Pen", group: "annotate", styleProps: ["color", "strokeWidth"], key: "p", size: [0, 0], fields: [], noFill: true,
  create: "freedraw", stayActive: true, hit: polylineHit(2),
  hint: "Pen: draw freehand (a tablet's pressure sets the thickness). Press V or Esc to go back to Select.",
  icon: '<path d="M13.5 3.5l3 3L7 16l-4 1 1-4z"/><path d="M11.5 5.5l3 3"/>',
  draw(pen, n, s) {
    const pts = scaledPoints(n);
    pen.fillPath(`${styleKey(n)}|${n.points?.length}`,
      () => freedrawPath(pts, n.pressures, n.strokeWidth || 2, n.simulatePressure !== false), s.ink);
  },
});

registerNodeType("highlighter", {
  label: "Highlight", group: "annotate", styleProps: ["color", "strokeWidth"],
  palette: ["yellow", "green", "blue", "red", "orange", "purple"], // marker colors
  key: "m", size: [0, 0], fields: [], noFill: true,
  create: "freedraw", stayActive: true, hit: polylineHit(4),
  defaults: { color: "yellow", strokeWidth: 4 },
  hint: "Highlighter: mark up the diagram with a translucent marker. Press V or Esc to go back to Select.",
  icon: '<path d="M12 3l5 5-7 7H5v-5z"/><path d="M3 17h7" stroke-width="3" opacity=".5"/>',
  draw(pen, n, s) {
    const pts = scaledPoints(n), { ctx } = pen;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.globalCompositeOperation = "multiply"; // like a real marker: text underneath stays readable
    pen.fillPath(`hl|${styleKey(n)}|${n.points?.length}`,
      () => freedrawPath(pts, null, (n.strokeWidth || 4) * 1.6, true, { thinning: 0 }), s.ink);
    ctx.restore();
  },
});
