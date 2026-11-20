// Editor entry point: registers shapes, wires every module, opens your project (or a shared link).
import "./shapes/uml.js";      // shape definitions register themselves on import
import "./shapes/groups.js";
import "./shapes/sketch.js";
import "./shapes/annotate.js";

import { fitView, initCamera } from "./canvas/camera.js";
import { initInteraction } from "./canvas/interaction.js";
import { initRenderer } from "./canvas/renderer.js";
import { history } from "./history.js";
import { listProjects } from "./io/projects.js";
import { initAutosave, openInitialProject } from "./io/storage.js";
import { emit, store } from "./store.js";
import { setTool } from "./tools.js";
import { initAnalysisPane } from "./ui/analysis.js";
import { initDialogs } from "./ui/dialogs.js";
import { $, switchPane } from "./ui/dom.js";
import { initGroupBar } from "./ui/groupBar.js";
import { editAt, initInlineEditor } from "./ui/inlineEditor.js";
import { initInspector } from "./ui/inspector.js";
import { initKeyboard } from "./ui/keyboard.js";
import { initLiveCheck } from "./ui/liveCheck.js";
import { showError } from "./ui/notify.js";
import { initOutline } from "./ui/outline.js";
import { initProblemPane, loadSample } from "./ui/problem.js";
import { initPublish, openSharedView } from "./ui/publish.js";
import { initStylePanel } from "./ui/stylePanel.js";
import { initToolbar } from "./ui/toolbar.js";

// Last line of defence: no error should fail silently.
window.addEventListener("unhandledrejection", (e) => showError(e.reason, "Unexpected error"));
window.addEventListener("error", (e) => showError(e.error || e.message, "Unexpected error"));

async function boot() {
  const params = new URLSearchParams(location.search);
  const viewId = params.get("view");                 // a published, read-only link
  const wantsBlank = params.get("project") === "new"; // "New" means an empty canvas
  const firstEver = !listProjects().length;           // only the very first project starts from an example
  const hasContent = !viewId && openInitialProject(); // your project, from this browser's library
  const canvas = $("board");

  initCamera(canvas);
  initRenderer(canvas);
  initInteraction(canvas, { onEdit: editAt });
  initToolbar();
  initInspector();
  initProblemPane();
  initAnalysisPane();
  initDialogs();
  initKeyboard();
  initAutosave();
  initLiveCheck();
  initStylePanel();
  initInlineEditor();
  initGroupBar();
  initOutline();
  initPublish();

  document.querySelectorAll(".tabBtn").forEach((b) => b.addEventListener("click", () => switchPane(b.dataset.pane)));

  if (viewId && await openSharedView(viewId)) {
    history.clear();
    emit("doc");
    return;
  }
  if (viewId && openInitialProject()) { // link expired: fall back to your own latest project
    $("problemInput").value = store.doc.problem;
  } else if (!hasContent && firstEver && !wantsBlank) { // first visit: start from the Library example
    try { await loadSample("library", { record: false }); }
    catch (err) { showError(err, "Could not load the starter sample"); }
  }
  history.clear();
  setTool("select");
  emit("doc");
  emit("file");
  requestAnimationFrame(() => fitView());
}

boot();
