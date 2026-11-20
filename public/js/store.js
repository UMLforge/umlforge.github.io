// Holds all app state, plus a small event bus.
//
// Events:
//   "doc"        diagram content changed  -> autosave, stats, redraw
//   "view"       only the picture changed (camera, drag preview, toggles) -> redraw
//   "selection"  selected shapes/link changed -> inspector, redraw
//   "tool"       active tool changed -> toolbar, cursor, hint
//   "history"    undo/redo availability changed
//   "file"       open server diagram (id/title) changed
//   "replaced"   whole diagram replaced (load, sample, starter)
//   "analysis"   fresh analysis result (live checks)  -> stats, badges
//   "hover"      pointer over a shape {id, clientX, clientY} or null -> rule tooltip
//   "created"    a shape was just drawn with a tool -> in-place name editing

export const store = {
  doc: { problem: "", nodes: [], edges: [] },
  ui: {
    tool: "select",
    selNodes: [],   // node ids
    selEdge: null,  // edge id
    grid: true,
    roughness: 1,   // Excalidraw sloppiness: 0 architect, 1 artist, 2 cartoonist
    snap: true,
    overlay: { draft: null, marquee: null, erasing: null, laser: [] }, // in-progress gestures drawn by the renderer
    liveCheck: true,        // show rule badges, tooltips and callouts on the canvas
    issuesByNode: new Map(), // node id -> analysis issues (filled by ui/liveCheck.js)
    toolStyle: {},
    readOnly: false,         // viewing a published link (ui/publish.js)           // per-tool style for the next shape, set in the style panel (ui/stylePanel.js)
  },
  cam: { x: 0, y: 0, zoom: 1 },
  file: { id: null, title: "Untitled" },   // id = copy saved on the server (optional)
  project: null,                          // this browser's project being edited (io/projects.js)
};

const listeners = {};

export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
}

export function emit(event, data) {
  for (const fn of listeners[event] || []) fn(data);
}
