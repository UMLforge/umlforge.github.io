// Node-type registry. Everything that varies by shape lives in one definition:
//
// registerNodeType("myshape", {
//   label: "My shape",          toolbar text
//   group: "uml" | "sketch",    toolbar group
//   key: "m",                   optional keyboard shortcut
//   icon: "<path .../>",        inner SVG for the 20x20 toolbar icon
//   hint: "...",                status-bar hint while the tool is active
//   size: [w, h],               default size
//   namePrefix: "Thing",        default name is Thing1, Thing2...  (or set defaults.name)
//   defaults: { attrs: [], ...} default field values
//   fields: ["name", "text", "attrs", "methods"],  inspector fields
//   classLike: true,            counts as a class for stats and analysis
//   anchor: "rect" | "ellipse" | "diamond",        where links attach
//   autoHeight(n) -> number,    optional minimum height from content
//   create: "box" | "linear" | "freedraw",          how the tool draws it (default "box": click or drag)
//   stayActive: true,           keep the tool selected after drawing (brush)
//   noFill: true,               no background color / fill style in the inspector
//   styleProps: ["color", ...], controls in the floating style panel (color, bg, fillStyle, strokeWidth,
//                               strokeStyle, fontSize); palette: [...ink keys] limits the color choices
//   hit(n, worldPt, tol) -> bool, optional precise hit test (default: inside the box)
//   editRegions(n) -> [{ field, y0, y1, font, bold, align, rowH, placeholder }]
//                               parts editable in place on double-click (default: the whole shape edits fields[0])
//   editOnCreate: true,         open in-place editing right after the shape is dropped
//   draw(pen, n, style),        local coordinates; style = { ink, bg }. See canvas/pen.js.
// });
//
// The toolbar, inspector, keyboard shortcuts and renderer all read from here.

const TYPES = new Map();

export function registerNodeType(type, def) {
  TYPES.set(type, { anchor: "rect", size: [180, 120], fields: ["name"], defaults: {}, create: "box", ...def, type });
}

export const nodeType = (type) => TYPES.get(type) || TYPES.get("rect");
export const nodeTypes = () => [...TYPES.values()];
export const isClassLike = (n) => !!nodeType(n.type).classLike;
