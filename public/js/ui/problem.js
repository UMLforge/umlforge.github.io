// Problem pane: problem statement, starter generator, samples and live stats.
import { api } from "../api.js";
import { fitView } from "../canvas/camera.js";
import { diagramFromSpec, replaceDiagram } from "../model/diagram.js";
import { isClassLike } from "../shapes/registry.js";
import { emit, on, store } from "../store.js";
import { $, esc } from "./dom.js";
import { notify, showError } from "./notify.js";

export async function loadSample(id, { record = true } = {}) {
  const spec = await api.sample(id);
  replaceDiagram(diagramFromSpec(spec), { record });
  $("problemInput").value = store.doc.problem;
  fitView();
}

async function generateStarter() {
  const btn = $("starterBtn"), note = $("starterNote");
  btn.disabled = true; btn.textContent = "Generating…";
  try {
    const { source, spec, reason } = await api.starter(store.doc.problem);
    replaceDiagram({ ...diagramFromSpec(spec), problem: undefined }); // keep the user's problem text
    fitView();
    if (source === "ai") {
      note.textContent = "Drafted by AI.";
      notify({ type: "success", title: "Starter diagram generated" });
    } else {
      note.textContent = "Drafted from keywords.";
      notify({
        type: "warning", title: "Starter made without AI",
        message: `${reason.title}. We built a starter from the key words in your problem instead.`,
        details: reason.details,
      });
    }
  } catch (err) {
    showError(err, "Starter failed");
  } finally {
    btn.disabled = false; btn.textContent = "Generate starter diagram";
  }
}

async function buildSampleButtons() {
  const row = $("sampleRow");
  try {
    const samples = await api.samples();
    row.innerHTML = samples.map((s) => `<button class="chip" data-sample="${esc(s.id)}">${esc(s.title)}</button>`).join("");
    row.addEventListener("click", (e) => {
      const id = e.target.closest("[data-sample]")?.dataset.sample;
      if (id) loadSample(id).catch((err) => showError(err, "Could not load the sample"));
    });
  } catch {
    row.innerHTML = '<span class="muted">Backend unreachable. Samples are unavailable.</span>';
  }
}

// Local counts update instantly; keyword coverage comes from the live analysis (ui/liveCheck.js).
function initStats() {
  const counts = () => {
    let classes = 0, actors = 0, notes = 0;
    for (const n of store.doc.nodes) {
      if (isClassLike(n)) classes++;
      else if (n.type === "actor" || n.type === "usecase") actors++;
      else if (n.type === "note") notes++;
    }
    $("statClass").textContent = classes;
    $("statActor").textContent = actors;
    $("statEdge").textContent = store.doc.edges.length;
    $("statNote").textContent = notes;
  };
  on("doc", counts);
  on("analysis", ({ coverage: c }) => {
    $("statCover").textContent = c.pct == null ? "—" : `${c.matched}/${c.total} (${c.pct}%)`;
  });
  counts();
}

export function initProblemPane() {
  const input = $("problemInput");
  input.value = store.doc.problem;
  input.addEventListener("input", () => { store.doc.problem = input.value; emit("doc"); });
  $("starterBtn").addEventListener("click", generateStarter);
  buildSampleButtons();
  initStats();
}
