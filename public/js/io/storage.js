// Editor <-> project library (io/projects.js). The open project autosaves as you work, so a reload
// or a crash never loses it, even with the backend down.
//
//   editor.html?project=<id>   open that project
//   editor.html?project=new    start a new one
//   editor.html                reopen the most recent project (or start one)
import { AUTOSAVE_DELAY_MS } from "../config.js";
import { emit, on, store } from "../store.js";
import { createProject, getProject, listProjects, loadProjectDoc, saveProject, thumbnail, updateMeta } from "./projects.js";

const THUMB_EVERY_MS = 4000;

function showProjectInUrl(id) {
  const url = new URL(location.href);
  url.searchParams.set("project", id);
  url.searchParams.delete("view");
  history.replaceState(null, "", url);
}

/**
 * Opens the project named in the URL (or the latest). Returns true when it already had content,
 * false for a brand-new/empty project (the caller may load a sample into it).
 */
export function openInitialProject() {
  const wanted = new URLSearchParams(location.search).get("project");
  let meta = wanted && wanted !== "new" ? getProject(wanted) : null;
  if (!meta && wanted !== "new") meta = listProjects()[0] || null;
  if (!meta) meta = createProject("Untitled");
  store.project = meta;
  store.doc = loadProjectDoc(meta.id);
  store.file = { id: meta.serverId || null, title: meta.title };
  showProjectInUrl(meta.id);
  return store.doc.nodes.length > 0;
}

/** Turns what is on screen (e.g. a shared link) into a new project of your own. */
export function saveAsNewProject(title) {
  store.project = createProject(title, store.doc);
  store.file = { id: null, title };
  showProjectInUrl(store.project.id);
  emit("file");
  emit("doc");
}

export function initAutosave() {
  let timer = null, lastThumb = 0, warned = false;
  const save = () => {
    const meta = store.project;
    if (store.ui.readOnly || !meta) return; // a shared link being viewed never overwrites your projects
    meta.title = store.file.title || "Untitled";
    meta.serverId = store.file.id || null;
    if (Date.now() - lastThumb > THUMB_EVERY_MS) {
      lastThumb = Date.now();
      try { meta.thumb = thumbnail(store.doc, store.ui.roughness); } catch { /* preview is optional */ }
    }
    if (!saveProject(meta, store.doc) && !warned) {
      warned = true;
      emit("storageFull");
    }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(save, AUTOSAVE_DELAY_MS); };
  on("doc", later);
  on("file", later);
  window.addEventListener("beforeunload", () => { lastThumb = 0; save(); });
  window.addEventListener("pagehide", () => { lastThumb = 0; save(); });
}

export { updateMeta };
