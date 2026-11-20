// Organizing containers: package, module, component, container, plugin.
// They group other shapes (see model/groups.js) and can be collapsed into a compact box for an overview.
// Expanded: drawn behind their members; only the title band and border are clickable, so clicks inside
// reach the members. Collapsed: the whole box is clickable and shows how many items it holds.
import { THEME } from "../config.js";
import { hashStr, styleKey } from "../canvas/pen.js";
import { COLLAPSED, HEADER, countOf, toggleRect } from "../model/groups.js";
import { registerNodeType } from "./registry.js";

const BORDER_HIT = 7;

function hit(n, p, tol) {
  const x = p.x - n.x, y = p.y - n.y;
  if (x < -tol || y < -tol || x > n.w + tol || y > n.h + tol) return false;
  if (n.collapsed) return true;
  return y <= HEADER || x <= BORDER_HIT + tol || y >= n.h - BORDER_HIT - tol || x >= n.w - BORDER_HIT - tol;
}

function drawToggle(ctx, n, ink) {
  const t = toggleRect(n);
  ctx.save();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(t.x, t.y, t.w, t.h, 4) : ctx.rect(t.x, t.y, t.w, t.h);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(t.x + 5, t.y + t.h / 2); ctx.lineTo(t.x + t.w - 5, t.y + t.h / 2);
  if (n.collapsed) { ctx.moveTo(t.x + t.w / 2, t.y + 5); ctx.lineTo(t.x + t.w / 2, t.y + t.h - 5); }
  ctx.stroke();
  ctx.restore();
}

/** Shared drawing: outline (per kind), title, stereotype, collapse button, and the collapsed summary. */
function drawContainer(kind, { stereotype, outline, icon }) {
  return (pen, n, s) => {
    const { ctx } = pen, o = pen.style(n, { stroke: s.ink, fill: s.bg }), seed = hashStr(n.id);
    pen.shapes(`${kind}|${styleKey(n)}|${n.collapsed ? 1 : 0}`, (g) => outline(g, n, o, seed));
    const nameX = kind === "package" ? 10 : 12, nameY = kind === "package" ? 17 : 22;
    if (n.collapsed) {
      pen.text(n.name || kind, n.w / 2, 34, { font: pen.font(16, "bold"), color: s.ink, align: "center" });
      const count = countOf(n);
      pen.text(`${stereotype} · ${count} item${count === 1 ? "" : "s"}`, n.w / 2, 56, { font: pen.font(12), color: THEME.muted, align: "center" });
    } else {
      pen.text(n.name || kind, nameX, nameY, { font: pen.font(15, "bold"), color: s.ink });
      ctx.font = pen.font(15, "bold");
      const after = nameX + ctx.measureText(n.name || kind).width + 10;
      if (kind !== "package") pen.text(stereotype, after, nameY, { font: pen.font(11), color: THEME.muted });
    }
    icon?.(ctx, n, s.ink);
    drawToggle(ctx, n, s.ink);
  };
}

// small UML component symbol (box with two tabs), drawn next to the collapse button
function componentIcon(ctx, n, ink) {
  const x = n.w - 56, y = 9;
  ctx.save(); ctx.strokeStyle = ink; ctx.fillStyle = "#fff"; ctx.lineWidth = 1.3;
  ctx.strokeRect(x + 4, y, 16, 16);
  ctx.fillRect(x, y + 3, 8, 4); ctx.strokeRect(x, y + 3, 8, 4);
  ctx.fillRect(x, y + 9, 8, 4); ctx.strokeRect(x, y + 9, 8, 4);
  ctx.restore();
}

function plugIcon(ctx, n, ink) {
  const x = n.w - 54, y = 9;
  ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 11, y); ctx.lineTo(x + 11, y + 5);
  ctx.rect(x + 1, y + 5, 14, 6); ctx.moveTo(x + 8, y + 11); ctx.lineTo(x + 8, y + 16);
  ctx.stroke(); ctx.restore();
}

const box = (g, n, o) => [g.rectangle(0, 0, n.w, n.h, o())];
const titled = (g, n, o, seed) => n.collapsed ? box(g, n, o)
  : [g.rectangle(0, 0, n.w, n.h, o()), g.line(0, HEADER, n.w, HEADER, o({ fill: undefined, seed: seed + 1 }))];

const KINDS = {
  package: {
    label: "Package", key: "g", stereotype: "«package»",
    hint: "Package: a named namespace. Select shapes and use Group into, or drop one and drag shapes into it.",
    icon: '<path d="M2.5 6V4.5A1.5 1.5 0 0 1 4 3h3.5L9 4.8h7.5A1.5 1.5 0 0 1 18 6.3v9.2a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 2.5 15.5z"/>',
    // UML package: a folder with a name tab on top
    outline: (g, n, o, seed) => {
      const tabW = Math.min(150, Math.max(90, n.w * 0.4));
      return [g.rectangle(0, 0, tabW, 26, o({ w: tabW, h: 26 })), g.rectangle(0, 26, n.w, n.h - 26, o({ seed: seed + 1 }))];
    },
  },
  module: {
    label: "Module", stereotype: "«module»", outline: titled,
    hint: "Module: a unit of code with a clear boundary. Group classes into it and collapse it for an overview.",
    icon: '<rect x="3" y="3" width="14" height="14" rx="1.5"/><path d="M3 7.5h14"/>',
  },
  component: {
    label: "Component", stereotype: "«component»", outline: titled, drawIcon: componentIcon,
    hint: "Component: a replaceable part with interfaces (UML component).",
    icon: '<rect x="5" y="3" width="12" height="14" rx="1"/><rect x="2.5" y="6" width="5" height="2.5"/><rect x="2.5" y="11" width="5" height="2.5"/>',
  },
  container: {
    label: "Container", stereotype: "«container»",
    hint: "Container: a deployable unit such as an app, a service or a database (C4 style).",
    icon: '<rect x="2.5" y="3.5" width="15" height="13" rx="3" stroke-dasharray="3 2"/>',
    // C4 container boundary: dashed rounded box
    outline: (g, n, o) => [g.path(roundedPath(n.w, n.h, 14), o({ strokeStyle: "dashed" }))],
  },
  plugin: {
    label: "Plugin", stereotype: "«plugin»", outline: titled, drawIcon: plugIcon,
    hint: "Plugin: an optional extension that plugs into the core.",
    icon: '<path d="M7 2.5v4M13 2.5v4"/><rect x="4" y="6.5" width="12" height="6" rx="1.5"/><path d="M10 12.5v5"/>',
  },
};

function roundedPath(w, h, r) {
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}

for (const [type, k] of Object.entries(KINDS)) {
  registerNodeType(type, {
    label: k.label, group: "organize", key: k.key, icon: k.icon, hint: k.hint,
    isGroup: true, editOnCreate: true, size: [340, 240], namePrefix: k.label, fields: ["name"],
    defaults: { bg: "transparent" }, styleProps: ["color", "bg", "strokeStyle"],
    hit,
    editRegions: (n) => [{ field: "name", y0: 0, y1: n.collapsed ? COLLAPSED[1] : HEADER, font: 15, bold: true,
      align: n.collapsed ? "center" : "left" }],
    draw: drawContainer(type, { stereotype: k.stereotype, outline: k.outline, icon: k.drawIcon }),
  });
}
