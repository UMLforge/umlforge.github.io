// Tool ids: "select", "pan", a node type ("class", "note"...), or "edge:<type>".
import { EDGE_TYPES } from "./edges/registry.js";
import { nodeType } from "./shapes/registry.js";
import { emit, store } from "./store.js";

const BUILTIN_HINTS = {
  select: "Drag to move · double-click to edit · Ctrl+G to group · Space+drag to pan",
  pan: "Drag to pan · wheel to zoom",
  eraser: "Eraser: drag over anything to erase it. Release to delete; Ctrl+Z brings it back.",
  laser: "Laser pointer: point things out while presenting. The trail fades and is not saved.",
};

export const isEdgeTool = (tool) => tool.startsWith("edge:");
export const edgeToolType = (tool) => tool.slice(5);

export function hintFor(tool) {
  if (BUILTIN_HINTS[tool]) return BUILTIN_HINTS[tool];
  if (isEdgeTool(tool)) return `${EDGE_TYPES[edgeToolType(tool)]?.hint || ""} Select returns after each link.`;
  return nodeType(tool).hint || "";
}

export function setTool(tool) {
  store.ui.tool = tool;
  emit("tool");
}
