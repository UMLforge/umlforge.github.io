// Floating "Group into" bar (top-center of the canvas) shown while shapes are selected.
//   Group into: Package · Module · Component · Container · Plugin      (Ctrl+G = Package)
//   With a container selected also: Collapse / Expand · Ungroup          (Ctrl+Shift+G = Ungroup)
import { groupSelection, selectedNodes, setCollapsed, ungroup } from "../model/diagram.js";
import { isGroup } from "../model/groups.js";
import { nodeTypes } from "../shapes/registry.js";
import { on, store } from "../store.js";
import { $, esc, svgIcon } from "./dom.js";

function render() {
  const bar = $("groupBar"), nodes = selectedNodes();
  const show = !store.ui.readOnly && store.ui.tool === "select" && nodes.length > 0;
  bar.hidden = !show;
  if (!show) return;
  const containers = nodeTypes().filter((t) => t.isGroup);
  const groups = nodes.filter(isGroup);
  const allCollapsed = groups.length && groups.every((g) => g.collapsed);
  bar.innerHTML = `<span class="gbLabel">Group into</span>`
    + containers.map((t) => `<button class="gbBtn" data-group="${t.type}" title="Group the selection into a ${esc(t.label.toLowerCase())}">${svgIcon(t.icon)}<span>${esc(t.label)}</span></button>`).join("")
    + (groups.length ? `<span class="gbSep"></span>
      <button class="gbBtn" data-act="${allCollapsed ? "expand" : "collapse"}">${allCollapsed ? "Expand" : "Collapse"}</button>
      <button class="gbBtn" data-act="ungroup" title="Remove the container, keep its contents">Ungroup</button>` : "");
}

export function initGroupBar() {
  const bar = document.createElement("div");
  bar.id = "groupBar";
  bar.hidden = true;
  $("canvasWrap").appendChild(bar);
  bar.addEventListener("pointerdown", (e) => e.stopPropagation());
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const groups = selectedNodes().filter(isGroup);
    if (btn.dataset.group) groupSelection(btn.dataset.group);
    else if (btn.dataset.act === "ungroup") groups.forEach((g) => ungroup(g.id));
    else setCollapsed(groups.map((g) => g.id), btn.dataset.act === "collapse");
    render();
  });
  on("selection", render);
  on("tool", render);
  on("doc", () => { if (!bar.hidden) render(); });
}
