// App-wide constants. Colors and limits are here, so other modules never hard-code them.

// Empty = same origin (nginx proxies /api). For local dev, open the page with ?api=http://localhost:8000
// Static hosting (e.g. GitHub Pages) sets the backend URL in index.html: <meta name="umlforge-api" content="https://...">
const metaApi = typeof document !== "undefined" ? document.querySelector('meta[name="umlforge-api"]')?.content : "";
export const API_BASE = ((typeof location !== "undefined" && new URLSearchParams(location.search).get("api")) || metaApi || "")
  .replace(/\/$/, "");

// Developer mode: open the page with ?debug=1 to see technical error details in popups.
// End users never see them; they are always written to the browser console instead.
export const DEBUG = typeof location !== "undefined" && new URLSearchParams(location.search).has("debug");

// Excalidraw's default palette (open-color). Keys are kept stable so old diagrams keep their colors.
export const INKS = { slate: "#1e1e1e", red: "#e03131", green: "#2f9e44", blue: "#1971c2", orange: "#f08c00", purple: "#9c36b5", yellow: "#fcc419" };
export const FILLS = {
  white: "#ffffff", transparent: "transparent", pink: "#ffc9c9", mint: "#b2f2bb", sky: "#a5d8ff", yellow: "#ffec99", peach: "#ffd8a8",
};

// Excalidraw's property options.
export const STROKE_WIDTHS = { thin: 1, bold: 2, extra: 4 };
export const STROKE_STYLES = ["solid", "dashed", "dotted"];
export const FILL_STYLES = ["solid", "hachure", "cross-hatch"];
export const SLOPPINESS = { architect: 0, artist: 1, cartoonist: 2 };

export const DEFAULT_STYLE = { strokeWidth: 2, strokeStyle: "solid", fillStyle: "solid" };

export const THEME = {
  paper: "#ffffff",
  gridMinor: "#f1f0ee",
  gridMajor: "#e2e0dc",
  selection: "#6965db",   // Excalidraw's selection color
  accent: "#bf4d22",
  muted: "#6f6656",
  faint: "#a89e8c",
  labelInk: "#3a352c",
};

export const FONTS = {
  hand: '"Virgil", "Segoe Print", "Comic Sans MS", cursive',   // Excalidraw's hand-drawn font
  ui: "Inter, system-ui, sans-serif",
};

export const GRID_STEP = 20;
export const SNAP_STEP = 10;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export const HISTORY_LIMIT = 80;
export const AUTOSAVE_KEY = "umlforge-v2";
export const AUTOSAVE_DELAY_MS = 400;
