// Excalidraw-style drawing, built on rough.js and perfect-freehand (the same libraries Excalidraw uses).
//
// Ported from excalidraw/excalidraw (MIT), packages/excalidraw/scene/Shape.ts and renderElement.ts:
//   - generateRoughOptions / adjustRoughness  -> roughOptions()
//   - rounded rectangle and diamond paths      -> roundedRectPath(), diamondPath()
//   - getArrowheadPoints                       -> arrowheadPoints()
//   - getFreeDrawSvgPath / getSvgPathFromStroke -> freedrawPath()
//
// Shapes are drawn in element-local coordinates (the caller translates to n.x, n.y), and the generated
// rough drawables are cached per element, like Excalidraw's ShapeCache. Moving a shape costs no regeneration.
import rough from "../../vendor/rough.esm.js";
import { getStroke } from "../../vendor/perfect-freehand.js";
import { DEFAULT_STYLE, FONTS } from "../config.js";

export const generator = rough.generator();

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2 ** 31;
}

// ---- Excalidraw geometry and options ----------------------------------------------------

// Small shapes get less roughness, or they turn into scribbles.
function adjustRoughness(roughness, w, h, isLinear) {
  const max = Math.max(w, h), min = Math.min(w, h);
  if ((min >= 20 && max >= 50) || min >= 15 || isLinear) return roughness;
  return Math.min(roughness / (max < 10 ? 3 : 2), 2.5);
}

/** rough.js options for a style; same rules as Excalidraw's generateRoughOptions. */
export function roughOptions({ seed, roughness, stroke, fill, w = 100, h = 100, linear = false, curveFitting, ...style }) {
  const { strokeWidth, strokeStyle, fillStyle } = { ...DEFAULT_STYLE, ...style };
  const opts = {
    seed,
    roughness: adjustRoughness(roughness, w, h, linear),
    stroke,
    strokeWidth: strokeStyle === "solid" ? strokeWidth : strokeWidth + 0.5,
    strokeLineDash: strokeStyle === "dashed" ? [8, 8 + strokeWidth] : strokeStyle === "dotted" ? [1.5, 6 + strokeWidth] : undefined,
    disableMultiStroke: strokeStyle !== "solid",
    fillWeight: strokeWidth / 2,
    hachureGap: strokeWidth * 4,
    preserveVertices: roughness < 2,
  };
  if (fill && fill !== "transparent") { opts.fill = fill; opts.fillStyle = fillStyle; }
  if (curveFitting) opts.curveFitting = curveFitting; // Excalidraw uses 1 for smooth ellipses
  return opts;
}

// Adaptive corner radius: 25% of the side, capped at 32px.
const cornerRadius = (size) => (size <= 128 ? size * 0.25 : 32);

export function roundedRectPath(w, h) {
  const r = cornerRadius(Math.min(w, h));
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} `
    + `L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`;
}

export function diamondPath(w, h) {
  const [tx, ty, rx, ry, bx, by, lx, ly] = [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
  const vr = cornerRadius(Math.abs(tx - lx)), hr = cornerRadius(Math.abs(ry - ty));
  return `M ${tx + vr} ${ty + hr} L ${rx - vr} ${ry - hr} C ${rx} ${ry}, ${rx} ${ry}, ${rx - vr} ${ry + hr} `
    + `L ${bx + vr} ${by - hr} C ${bx} ${by}, ${bx} ${by}, ${bx - vr} ${by - hr} `
    + `L ${lx + vr} ${ly + hr} C ${lx} ${ly}, ${lx} ${ly}, ${lx + vr} ${ly - hr} `
    + `L ${tx - vr} ${ty + hr} C ${tx} ${ty}, ${tx} ${ty}, ${tx + vr} ${ty + hr}`;
}

const rotate = (x, y, cx, cy, a) => [
  (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a) + cx,
  (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a) + cy,
];

const ARROWHEAD = { arrow: { size: 22, angle: 20 }, triangle: { size: 18, angle: 25 }, diamond: { size: 13, angle: 25 } };

/** Arrowhead points at (x2, y2) for a segment coming from (x1, y1). `geom` overrides { size, angle }. */
export function arrowheadPoints(kind, x1, y1, x2, y2, geom = ARROWHEAD[kind]) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (x2 - x1) / len, ny = (y2 - y1) / len;
  const { size, angle } = geom;
  const s = Math.min(size, len * (kind === "diamond" ? 0.25 : 0.5));
  const xs = x2 - nx * s, ys = y2 - ny * s, a = (angle * Math.PI) / 180;
  const p3 = rotate(xs, ys, x2, y2, -a), p4 = rotate(xs, ys, x2, y2, a);
  if (kind === "diamond") {
    const back = [x2 - nx * s * 2, y2 - ny * s * 2];
    return [[x2, y2], p3, back, p4];
  }
  return [p3, [x2, y2], p4];
}

// Excalidraw's freedraw: perfect-freehand outline turned into a smooth SVG path.
const med = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function freedrawPath(points, pressures, strokeWidth, simulatePressure, { thinning = 0.6 } = {}) {
  const input = simulatePressure || !pressures?.length ? points : points.map(([x, y], i) => [x, y, pressures[i]]);
  const outline = getStroke(input.length ? input : [[0, 0, 0.5]], {
    simulatePressure, size: strokeWidth * 4.25, thinning, smoothing: 0.5, streamline: 0.5,
    easing: (t) => Math.sin((t * Math.PI) / 2), last: true,
  });
  if (!outline.length) return "";
  const max = outline.length - 1;
  return outline.reduce((acc, p, i, arr) => {
    if (i === max) acc.push(p, med(p, arr[0]), "L", arr[0], "Z");
    else acc.push(p, med(p, arr[i + 1]));
    return acc;
  }, ["M", outline[0], "Q"]).join(" ");
}

// ---- drawable cache -------------------------------------------------------------------

const cache = new Map();
function cached(key, build) {
  let hit = cache.get(key);
  if (!hit) {
    if (cache.size > 4000) cache.clear();
    hit = build();
    cache.set(key, hit);
  }
  return hit;
}

const roughCanvases = new WeakMap();
function roughCanvasFor(ctx) {
  let rc = roughCanvases.get(ctx);
  if (!rc) { rc = rough.canvas(ctx.canvas); roughCanvases.set(ctx, rc); }
  return rc;
}

// ---- the pen handed to shape and edge draw functions --------------------------------------

export function createPen(ctx, { roughness = 1 } = {}) {
  const rc = roughCanvasFor(ctx);
  const sketchy = roughness > 0;

  const pen = {
    ctx,
    roughness,

    /** Font string: Virgil when sketchy, Inter in "architect" mode. */
    font(px, weight = "") {
      return `${weight} ${sketchy ? px + 1 : px}px ${sketchy ? FONTS.hand : FONTS.ui}`.trim();
    },

    /** Style helper for a node or edge: options(extra) returns rough options. */
    style(el, { stroke, fill }) {
      const base = {
        seed: hashStr(el.id), roughness, stroke, fill, w: el.w ?? 100, h: el.h ?? 100,
        strokeWidth: el.strokeWidth, strokeStyle: el.strokeStyle, fillStyle: el.fillStyle,
      };
      return (extra = {}) => roughOptions({ ...base, ...extra });
    },

    /**
     * Draws rough shapes built by `build(generator)`, cached under `key`.
     * Put everything the shapes depend on (size, colors, style, sloppiness) into the key.
     */
    shapes(key, build) {
      for (const d of cached(`${roughness}|${key}`, () => build(generator))) rc.draw(d);
    },

    /** Filled freehand stroke (cached Path2D). */
    fillPath(key, buildPath, color) {
      const path = cached(`path|${key}`, () => new Path2D(buildPath()));
      ctx.fillStyle = color;
      ctx.fill(path);
    },

    text(str, x, y, { font, color, align = "left" } = {}) {
      if (font) ctx.font = font;
      if (color) ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(str, x, y);
    },

    /** Word-wrapped text. With align "center", x is the center line of the box. */
    wrap(text, x, y, maxW, lineH, maxH, { font, color, align = "left" } = {}) {
      if (font) ctx.font = font;
      if (color) ctx.fillStyle = color;
      ctx.textAlign = align;
      const maxLines = Math.max(1, Math.floor(maxH / lineH));
      const lines = [];
      for (const para of String(text).split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/)) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
        }
        lines.push(line);
      }
      if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1];
        while (ctx.measureText(last + "…").width > maxW && last.length > 1) last = last.slice(0, -1);
        lines[maxLines - 1] = last + "…";
      }
      lines.forEach((l, i) => ctx.fillText(l, x, y + lineH * (0.8 + i)));
    },

    /**
     * Excalidraw-style bound text on a line: text over a white cut-out, no border.
     * align "left"/"right" anchors the text at x; plain = lighter halo for text placed beside a line.
     */
    label(str, x, y, { color, font, align = "center", plain = false }) {
      if (!str) return;
      ctx.font = font;
      const tw = ctx.measureText(str).width, w = tw + 8;
      const left = align === "left" ? x - 4 : align === "right" ? x - tw - 4 : x - w / 2;
      ctx.fillStyle = plain ? "rgba(255,255,255,0.85)" : "#fff";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(left, y - 10, w, 20, 4) : ctx.rect(left, y - 10, w, 20);
      ctx.fill();
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
      ctx.fillText(str, x, y + 1);
      ctx.textBaseline = "alphabetic";
    },
  };
  return pen;
}

/** Cache key fragment for an element's visual style. */
export const styleKey = (el) =>
  [el.id, Math.round(el.w), Math.round(el.h), el.color, el.bg, el.strokeWidth, el.strokeStyle, el.fillStyle].join("|");
