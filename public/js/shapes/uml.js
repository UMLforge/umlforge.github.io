// UML shapes: class, interface, abstract, enum, actor, use case, note. (Package and other containers: groups.js)
// Draw functions work in element-local coordinates: (0,0) is the top-left of the shape.
import { THEME } from "../config.js";
import { hashStr, styleKey } from "../canvas/pen.js";
import { registerNodeType } from "./registry.js";

const ROW = 20;
const MAX_ROWS = 8;
const PAD_TOP = 6, STEREO_H = 16, NAME_H = 28;

const clip = (list, max) => (list.length > max ? [...list.slice(0, max), `… +${list.length - max} more`] : list);

// ---- class-like boxes ----------------------------------------------------------

function classAutoHeight(stereotype) {
  return (n) => {
    const rows = Math.min(n.attrs.length, MAX_ROWS + 1) + Math.min(n.methods.length, MAX_ROWS + 1);
    return Math.min(440, PAD_TOP + (stereotype ? STEREO_H : 0) + NAME_H + 8 + rows * ROW + 12);
  };
}

function drawClassBox(stereotype, { italic = false, isEnum = false } = {}) {
  return (pen, n, s) => {
    const o = pen.style(n, { stroke: s.ink, fill: s.bg }), seed = hashStr(n.id);
    const nameTop = PAD_TOP + (stereotype ? STEREO_H : 0);
    const div1 = nameTop + NAME_H;
    const attrs = isEnum ? n.attrs.slice(0, 14) : clip(n.attrs, MAX_ROWS);
    const methods = isEnum ? [] : clip(n.methods, MAX_ROWS);
    const div2 = methods.length ? div1 + 6 + attrs.length * ROW + 4 : null;

    pen.shapes(`${styleKey(n)}|${div1}|${div2}`, (g) => [
      g.rectangle(0, 0, n.w, n.h, o()),
      g.line(0, div1, n.w, div1, o({ fill: undefined, seed: seed + 1 })),
      ...(div2 !== null ? [g.line(0, div2, n.w, div2, o({ fill: undefined, seed: seed + 2 }))] : []),
    ]);

    const cx = n.w / 2;
    if (stereotype) pen.text(stereotype, cx, PAD_TOP + 12, { font: pen.font(12), color: THEME.muted, align: "center" });
    pen.text(n.name || "", cx, nameTop + 20, { font: pen.font(16, italic ? "italic bold" : "bold"), color: s.ink, align: "center" });

    const font = pen.font(14);
    attrs.forEach((t, i) => pen.text(t, 10, div1 + 6 + 15 + i * ROW, { font, color: s.ink }));
    methods.forEach((t, i) => pen.text(t, 10, div2 + 4 + 15 + i * ROW, { font, color: s.ink }));
    if (!attrs.length && !methods.length) {
      pen.text(n.type === "interface" ? "no operations" : "add members", cx, div1 + 24,
        { font, color: THEME.faint, align: "center" });
    }
  };
}

/**
 * Editable parts of a class box, in local coordinates, for in-place editing (ui/inlineEditor.js).
 * Mirrors the layout in drawClassBox: name | attributes | methods.
 */
function classRegions(stereotype, { isEnum = false } = {}) {
  return (n) => {
    const div1 = PAD_TOP + (stereotype ? STEREO_H : 0) + NAME_H;
    const name = { field: "name", y0: 0, y1: div1, font: 16, bold: true, align: "center" };
    if (isEnum) return [name, { field: "attrs", y0: div1, y1: n.h, font: 14, rowH: ROW, placeholder: "ACTIVE" }];
    const attrRows = clip(n.attrs, MAX_ROWS).length;
    // no members yet: split the empty space in half so both parts are easy to hit
    const split = attrRows || n.methods.length ? div1 + 6 + attrRows * ROW + 4 : div1 + (n.h - div1) / 2;
    return [
      name,
      { field: "attrs", y0: div1, y1: Math.max(split, div1 + ROW), font: 14, rowH: ROW, placeholder: "- name: Type" },
      { field: "methods", y0: split, y1: Math.max(n.h, split + ROW), font: 14, rowH: ROW, placeholder: "+ name(param: Type): Type" },
    ];
  };
}

const classFields = ["name", "attrs", "methods"];

registerNodeType("class", {
  label: "Class", group: "uml", key: "c", classLike: true, size: [200, 132], namePrefix: "Class",
  defaults: { attrs: ["- id: ID"], methods: ["+ save(): void"] }, fields: classFields,
  hint: "Class: click to drop one (or drag to size it), then edit members in the Inspector. Use - private, + public, # protected.",
  icon: '<rect x="3.5" y="3.5" width="13" height="13" rx="1"/><path d="M3.5 8h13M3.5 12.2h13"/>',
  autoHeight: classAutoHeight(null), draw: drawClassBox(null), editRegions: classRegions(null), editOnCreate: true,
});

registerNodeType("interface", {
  label: "Interface", group: "uml", key: "i", classLike: true, size: [200, 140], namePrefix: "Iface",
  defaults: { methods: ["+ execute(): void"] }, fields: classFields,
  hint: "Interface: click to drop. Implementing classes connect with Realize.",
  icon: '<circle cx="10" cy="4.8" r="2.5"/><path d="M10 7.3V17"/>',
  autoHeight: classAutoHeight("«interface»"), draw: drawClassBox("«interface»"), editRegions: classRegions("«interface»"), editOnCreate: true,
});

registerNodeType("abstract", {
  label: "Abstract", group: "uml", classLike: true, size: [200, 132], namePrefix: "Base",
  defaults: { attrs: ["# id: ID"], methods: ["+ run(): void"] }, fields: classFields,
  hint: "Abstract class: click to drop a base class. Subclasses connect with Inherit.",
  icon: '<rect x="3.5" y="3.5" width="13" height="13" rx="1"/><path d="M3.5 8h13" stroke-dasharray="2.5 2"/>',
  autoHeight: classAutoHeight("«abstract»"), draw: drawClassBox("«abstract»", { italic: true }),
  editRegions: classRegions("«abstract»"), editOnCreate: true,
});

registerNodeType("enum", {
  label: "Enum", group: "uml", classLike: true, size: [180, 120], namePrefix: "Status",
  defaults: { attrs: ["ACTIVE", "ARCHIVED"] }, fields: ["name", "attrs"],
  hint: "Enum: click to drop an enumeration. One UPPER_CASE literal per line.",
  icon: '<rect x="4.5" y="3" width="11" height="14" rx="1"/><path d="M7.2 7h5.6M7.2 10.3h5.6M7.2 13.6h3.6"/>',
  autoHeight: classAutoHeight("«enumeration»"), draw: drawClassBox("«enumeration»", { isEnum: true }),
  editRegions: classRegions("«enumeration»", { isEnum: true }), editOnCreate: true,
});

// ---- use-case diagram shapes ----------------------------------------------------

registerNodeType("actor", {
  label: "Actor", group: "uml", editOnCreate: true, size: [92, 124], defaults: { name: "User", bg: "white" },
  hint: "Actor: click to drop. Link it to use cases with Assoc.",
  icon: '<circle cx="10" cy="4.3" r="2.2"/><path d="M10 6.8v5.2M5.8 9.3l4.2-1 4.2 1M10 12l-2.8 5.5M10 12l2.8 5.5"/>',
  draw(pen, n, s) {
    const o = pen.style(n, { stroke: s.ink, fill: s.bg }), seed = hashStr(n.id), hx = n.w / 2, hy = 20, r = 13;
    const line = (i) => o({ fill: undefined, seed: seed + i, w: 40, h: 40 });
    pen.shapes(`${styleKey(n)}`, (g) => [
      g.circle(hx, hy, r * 2, o({ w: 26, h: 26 })),
      g.line(hx, hy + r, hx, hy + r + 30, line(1)),
      g.line(hx - 18, hy + r + 12, hx + 18, hy + r + 12, line(2)),
      g.line(hx, hy + r + 30, hx - 14, hy + r + 52, line(3)),
      g.line(hx, hy + r + 30, hx + 14, hy + r + 52, line(4)),
    ]);
    pen.text(n.name || "Actor", hx, n.h - 6, { font: pen.font(15), color: s.ink, align: "center" });
  },
});

registerNodeType("usecase", {
  label: "UseCase", group: "uml", editOnCreate: true, key: "u", size: [180, 92], anchor: "ellipse", defaults: { name: "Do something" },
  hint: "Use case: click to drop an oval goal, e.g. Borrow book.",
  icon: '<ellipse cx="10" cy="10" rx="6.5" ry="4.5"/>',
  draw(pen, n, s) {
    const o = pen.style(n, { stroke: s.ink, fill: s.bg });
    pen.shapes(styleKey(n), (g) => [g.ellipse(n.w / 2, n.h / 2, n.w, n.h, o({ curveFitting: 1 }))]);
    pen.wrap(n.name || "UseCase", n.w / 2, n.h / 2 - 20, n.w - 30, 20, n.h - 24, { font: pen.font(15), color: s.ink, align: "center" });
  },
});

registerNodeType("note", {
  label: "Note", group: "uml", editOnCreate: true, key: "n", styleProps: ["color", "bg"], size: [190, 120], fields: ["text"],
  defaults: { bg: "yellow", text: "Remember: multiplicities matter." },
  hint: "Note: click to drop a sticky note. Link it to the class it explains.",
  icon: '<path d="M4.5 2.5h7L15.5 6.5v11H4.5z"/><path d="M11.5 2.5v4h4"/>',
  draw(pen, n, s) {
    const o = pen.style(n, { stroke: s.ink, fill: s.bg }), f = 16, seed = hashStr(n.id);
    pen.shapes(styleKey(n), (g) => [
      g.path(`M 0 0 L ${n.w - f} 0 L ${n.w} ${f} L ${n.w} ${n.h} L 0 ${n.h} Z`, o()),
      g.linearPath([[n.w - f, 0], [n.w - f, f], [n.w, f]], o({ fill: undefined, seed: seed + 1 })),
    ]);
    pen.wrap(n.text || "note", 10, 8, n.w - 24, 20, n.h - 16, { font: pen.font(15), color: s.ink });
  },
});
