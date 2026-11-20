// Keyboard shortcuts. Tool keys come from the shape registry (`key` field).
import { history } from "../history.js";
import { deleteSelection, duplicateSelection, groupSelection, select, selectedNodes, ungroup } from "../model/diagram.js";
import { isGroup } from "../model/groups.js";
import { nodeType, nodeTypes } from "../shapes/registry.js";
import { emit, store } from "../store.js";
import { setTool } from "../tools.js";
import { $ } from "./dom.js";
import { saveToServer } from "./dialogs.js";
import { editNode } from "./inlineEditor.js";

const CTRL_SHORTCUTS = {
  z: (e) => (e.shiftKey ? history.redo() : history.undo()),
  y: () => history.redo(),
  d: () => duplicateSelection(),
  s: () => saveToServer(),
  g: (e) => (e.shiftKey ? selectedNodes().filter(isGroup).forEach((g) => ungroup(g.id)) : groupSelection("package")),
};

function toolKeys() {
  const keys = { v: "select", h: "pan", e: "eraser", k: "laser" };
  for (const t of nodeTypes()) if (t.key) keys[t.key] = t.type;
  return keys;
}

function fillShortcutTable(keys) {
  const rows = [
    ...Object.entries(keys).map(([k, tool]) => [k.toUpperCase(), { select: "Select", pan: "Hand", eraser: "Eraser", laser: "Laser pointer" }[tool] || nodeType(tool).label]),
    ["Space + drag", "Pan from any tool"], ["Delete", "Delete selection"], ["Ctrl D", "Duplicate selection"],
    ["Ctrl Z / Ctrl Shift Z", "Undo / redo"], ["Ctrl G / Ctrl Shift G", "Group into a package / ungroup"], ["Ctrl S", "Save to server"], ["Double-click", "Edit in place (name, attributes, methods, link label)"], ["Enter", "Edit the selected shape"],
    ["Esc", "Clear selection, back to Select"],
  ];
  $("shortcutTable").innerHTML = rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join("");
}

export function initKeyboard() {
  const keys = toolKeys();
  fillShortcutTable(keys);

  window.addEventListener("keydown", (e) => {
    if (store.ui.readOnly) return; // shared link: no editing shortcuts
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && CTRL_SHORTCUTS[key]) {
      if (typing && key !== "s") return; // let inputs keep their own undo
      e.preventDefault();
      CTRL_SHORTCUTS[key](e);
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (key === "delete" || key === "backspace") deleteSelection();
    else if (key === "enter" && store.ui.selNodes.length === 1) {
      e.preventDefault();
      editNode(store.doc.nodes.find((n) => n.id === store.ui.selNodes[0]));
    }
    else if (key === "escape") {
      store.ui.overlay.draft = null;
      select([]);
      setTool("select");
      emit("view");
    } else if (keys[key]) setTool(keys[key]);
  });
}
