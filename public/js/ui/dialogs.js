// Top-bar file actions (new, projects, save to server, import, export, clear) and the help modal.
import { api } from "../api.js";
import { exportJson, exportPng, readJsonFile } from "../io/files.js";
import { createProject } from "../io/projects.js";
import { replaceDiagram } from "../model/diagram.js";
import { emit, on, store } from "../store.js";
import { $ } from "./dom.js";
import { notify, showError } from "./notify.js";

function setFile(id, title) {
  store.file = { id, title: title || "Untitled" };
  emit("file");
}

function showModal(id) { $(id).hidden = false; }


export async function saveToServer() {
  const title = store.file.title || "Untitled";
  try {
    const saved = store.file.id
      ? await api.updateDiagram(store.file.id, title, store.doc)
      : await api.createDiagram(title, store.doc);
    setFile(saved.id, saved.title);
    notify({ type: "success", title: `Saved “${saved.title}”` });
  } catch (err) {
    // If the diagram was deleted on the server, save it as a new one.
    if (store.file.id && err.status === 404) { store.file.id = null; return saveToServer(); }
    showError(err, "Save failed");
  }
}

export function initDialogs() {
  // Close buttons and backdrop clicks close any modal.
  document.querySelectorAll(".modal").forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m || e.target.hasAttribute("data-close")) m.hidden = true; });
  });

  const title = $("titleInput");
  title.value = store.file.title;
  title.addEventListener("change", () => { store.file.title = title.value.trim() || "Untitled"; emit("file"); });
  on("file", () => { title.value = store.file.title; });

  $("helpBtn").addEventListener("click", () => showModal("helpModal"));
  // Your work is autosaved as a project in this browser; New starts another, Projects lists them all.
  $("newBtn").addEventListener("click", () => { location.href = "editor.html?project=new"; });
  $("openBtn").addEventListener("click", () => { location.href = "projects.html"; });
  on("storageFull", () => notify({ type: "error", title: "Browser storage is full",
    message: "Your latest changes couldn't be saved in this browser.", hint: "Open Projects and delete or export old ones." }));
  $("saveBtn").addEventListener("click", saveToServer);

  $("importBtn").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const doc = await readJsonFile(file);
      const project = createProject(doc.title || file.name.replace(/\.json$/i, ""), { problem: doc.problem, nodes: doc.nodes, edges: doc.edges });
      location.href = `editor.html?project=${project.id}`; // imported files become a new project
    } catch (err) {
      notify({ type: "error", title: "That file couldn't be opened", message: "It isn't a UMLforge diagram, or it's damaged.",
        hint: "Choose a .json file saved with the JSON button.", details: `${file.name}: ${err.message}` });
    }
  });
  $("exportBtn").addEventListener("click", exportJson);
  $("pngBtn").addEventListener("click", () => { if (!exportPng()) notify({ type: "info", title: "Nothing to export yet", message: "Draw something first." }); });
  $("clearBtn").addEventListener("click", () => {
    if (store.doc.nodes.length && confirm("Clear the whole canvas?")) replaceDiagram({ nodes: [], edges: [] });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
  });
}
