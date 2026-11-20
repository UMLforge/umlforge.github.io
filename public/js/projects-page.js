// "Your projects" page: the project library stored in this browser (io/projects.js).
import "./shapes/uml.js";        // needed to draw thumbnails for imported projects
import "./shapes/groups.js";
import "./shapes/sketch.js";
import "./shapes/annotate.js";
import { readJsonFile } from "./io/files.js";
import {
  createProject, deleteProject, duplicateProject, getProject, listProjects, loadProjectDoc, thumbnail, updateMeta,
} from "./io/projects.js";
import { notify } from "./ui/notify.js";
import { projectCard } from "./ui/projectCard.js";

const $ = (id) => document.getElementById(id);

function render() {
  const q = $("search").value.trim().toLowerCase();
  const all = listProjects();
  const shown = all.filter((p) => !q || (p.title || "").toLowerCase().includes(q));
  $("count").textContent = all.length ? `(${all.length})` : "";
  $("empty").hidden = all.length > 0;
  $("cards").innerHTML = shown.map((p) => projectCard(p)).join("")
    + (all.length && !q ? '<a class="newCard" href="editor.html?project=new"><div><span>+</span>New project</div></a>' : "")
    + (all.length && !shown.length ? '<p class="note">No project matches your search.</p>' : "");
}

function exportProject(id) {
  const p = getProject(id);
  const data = { app: "umlforge", version: 2, title: p.title, ...loadProjectDoc(id) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(p.title || "diagram").replace(/[^\w.-]+/g, "-").toLowerCase()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const ACTIONS = {
  rename(id) {
    const p = getProject(id);
    const title = prompt("Rename project", p.title || "Untitled");
    if (title && title.trim()) updateMeta(id, { title: title.trim().slice(0, 120) });
  },
  duplicate(id) { duplicateProject(id); notify({ type: "success", title: "Project copied" }); },
  export: exportProject,
  delete(id) {
    const p = getProject(id);
    if (!confirm(`Delete “${p.title || "Untitled"}”? This can't be undone. Export it first if you may need it.`)) return;
    deleteProject(id);
  },
};

$("cards").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  e.preventDefault();
  const id = btn.closest(".pcard").dataset.id;
  try { ACTIONS[btn.dataset.act](id); } catch {
    notify({ type: "error", title: "Browser storage is full", message: "Delete or export some projects, then try again." });
  }
  render();
});

$("search").addEventListener("input", render);
$("importBtn").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  for (const file of files) {
    try {
      const doc = await readJsonFile(file);
      const clean = { problem: doc.problem || "", nodes: doc.nodes, edges: doc.edges };
      const p = createProject(doc.title || file.name.replace(/\.json$/i, ""), clean);
      updateMeta(p.id, { thumb: thumbnail(clean) });
      notify({ type: "success", title: `Imported “${p.title}”` });
    } catch (err) {
      notify({ type: "error", title: `${file.name} couldn't be imported`,
        message: err.message === "Browser storage is full" ? "Browser storage is full." : "It isn't a UMLforge diagram file, or it's damaged." });
    }
  }
  render();
});
window.addEventListener("storage", render); // edits in another tab show up here
render();
