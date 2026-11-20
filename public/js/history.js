// Snapshot-based undo/redo of nodes and edges.
//
//   history.record()           call just before a one-shot change (add, delete, color...)
//   history.begin() / commit() wrap a continuous change (drag, typing); stores one undo step,
//                              and none if nothing actually changed.
import { HISTORY_LIMIT } from "./config.js";
import { emit, store } from "./store.js";

const undoStack = [];
const redoStack = [];
let pending = null;

const snapshot = () => JSON.stringify({ nodes: store.doc.nodes, edges: store.doc.edges });

function push(snap) {
  undoStack.push(snap);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  emit("history");
}

function restore(snap) {
  const { nodes, edges } = JSON.parse(snap);
  store.doc.nodes = nodes;
  store.doc.edges = edges;
  store.ui.selNodes = [];
  store.ui.selEdge = null;
  emit("doc");
  emit("selection");
}

export const history = {
  record() { push(snapshot()); },
  begin() { pending = snapshot(); },
  commit() {
    if (pending !== null && pending !== snapshot()) push(pending);
    pending = null;
  },
  undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    emit("history");
  },
  redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    emit("history");
  },
  clear() { undoStack.length = 0; redoStack.length = 0; emit("history"); },
  get canUndo() { return undoStack.length > 0; },
  get canRedo() { return redoStack.length > 0; },
};
