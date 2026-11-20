// Publish: a read-only link that expires (1 hour, 1 day or 7 days). No accounts; the server rate-limits it.
// Opening <app>?view=<id> shows the shared diagram read-only, with an "Edit a copy" button.
import { api } from "../api.js";
import { fitView } from "../canvas/camera.js";
import { history } from "../history.js";
import { saveAsNewProject } from "../io/storage.js";
import { replaceDiagram } from "../model/diagram.js";
import { emit, store } from "../store.js";
import { setTool } from "../tools.js";
import { $ } from "./dom.js";
import { notify, showError } from "./notify.js";

const shareUrl = (id) => `${location.origin}${location.pathname}?view=${encodeURIComponent(id)}`;

function untilText(expiresAt) {
  const s = expiresAt - Date.now() / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} minutes`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
}

async function publish() {
  const btn = $("publishGo");
  btn.disabled = true;
  try {
    const share = await api.publish(store.file.title || "Untitled", store.doc, Number($("publishTtl").value));
    const url = shareUrl(share.id);
    $("publishResult").hidden = false;
    $("publishLink").value = url;
    $("publishExpiry").textContent = `Expires in ${untilText(share.expires_at)} (${new Date(share.expires_at * 1000).toLocaleString()}).`;
    $("publishLink").select();
  } catch (err) {
    showError(err, "Couldn't publish");
  } finally {
    btn.disabled = false;
  }
}

// ---- read-only view of a shared link -------------------------------------------------------

function setReadOnly(on) {
  store.ui.readOnly = on;
  document.body.classList.toggle("readonly", on);
  $("viewBanner").hidden = !on;
  if (on) setTool("pan");
  emit("tool");
  emit("selection");
}

/** Loads ?view=<id>. Returns false when the link can't be opened (caller falls back to normal mode). */
export async function openSharedView(id) {
  try {
    const share = await api.share(id);
    setReadOnly(true);
    replaceDiagram(share.diagram, { record: false });
    $("problemInput").value = store.doc.problem || "";
    store.file = { id: null, title: share.title || "Shared diagram" };
    emit("file");
    $("viewExpiry").textContent = `expires in ${untilText(share.expires_at)}`;
    fitView();
    return true;
  } catch (err) {
    showError(err, "Couldn't open the shared diagram");
    window.history.replaceState(null, "", location.pathname);
    return false;
  }
}

function editCopy() {

  setReadOnly(false);
  saveAsNewProject(`Copy of ${store.file.title}`); // a new project in your library
  history.clear();
  setTool("select");
  notify({ type: "success", title: "Editable copy created", message: "It's in your projects in this browser." });
}

export function initPublish() {
  $("publishBtn").addEventListener("click", () => {
    if (!store.doc.nodes.length) {
      notify({ type: "info", title: "Nothing to publish yet", message: "Draw something first." });
      return;
    }
    $("publishResult").hidden = true;
    $("publishModal").hidden = false;
  });
  $("publishGo").addEventListener("click", publish);
  $("publishCopy").addEventListener("click", () => {
    navigator.clipboard?.writeText($("publishLink").value).then(
      () => notify({ type: "success", title: "Link copied" }),
      () => { $("publishLink").select(); document.execCommand?.("copy"); },
    );
  });
  $("editCopyBtn").addEventListener("click", editCopy);
}
