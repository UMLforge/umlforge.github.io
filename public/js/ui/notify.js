// Popup notifications (top-right). Errors stay until closed, or 12s; others fade sooner.
//
//   notify({ type: "error" | "warning" | "success" | "info", title, message, hint, details })
//   title/message/hint are for end users. `details` (developer text) is logged to the console, and shown
//   in the popup only in developer mode (?debug=1).
//   showError(err, fallbackTitle)   for any thrown error (ApiError from api.js, or a plain Error)

import { DEBUG } from "../config.js";

const ICONS = { error: "!", warning: "!", success: "✓", info: "i" };
const DURATION = { error: 12000, warning: 9000, success: 3500, info: 4000 };
const MAX_VISIBLE = 4;
const recent = new Map(); // title -> timestamp, to swallow duplicate bursts

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// `code` spans in hints render as monospace.
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

function container() {
  let el = document.getElementById("notices");
  if (!el) {
    el = document.createElement("div");
    el.id = "notices";
    el.setAttribute("aria-live", "assertive");
    document.body.appendChild(el);
  }
  return el;
}

export function notify({ type = "info", title, message = "", hint = "", details = "" }) {
  if (details) console.warn(`[UMLforge] ${title}: ${details}`);
  if (!DEBUG) details = "";
  const now = Date.now();
  if (now - (recent.get(title) || 0) < 1500) return;
  recent.set(title, now);

  const box = container();
  while (box.children.length >= MAX_VISIBLE) box.firstChild.remove();

  const el = document.createElement("div");
  el.className = `notice ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `<div class="nIcon">${ICONS[type]}</div>
    <div class="nBody"><div class="nTitle">${esc(title)}</div>
      ${message ? `<div class="nMsg">${rich(message)}</div>` : ""}
      ${hint ? `<div class="nHint">${rich(hint)}</div>` : ""}
      ${details ? `<details class="nDetails"><summary>Technical details (debug mode)</summary><pre>${esc(details)}</pre>
        <button class="nCopy">Copy</button></details>` : ""}</div>
    <button class="nClose" aria-label="Dismiss">×</button>`;
  const close = () => { el.classList.add("leaving"); setTimeout(() => el.remove(), 200); };
  el.querySelector(".nClose").addEventListener("click", close);
  el.querySelector(".nCopy")?.addEventListener("click", (e) => {
    navigator.clipboard?.writeText(`${title}\n${message}\n${details}`).then(() => { e.target.textContent = "Copied"; }, () => {});
  });
  let timer = setTimeout(close, DURATION[type]);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => { timer = setTimeout(close, 3000); });
  box.appendChild(el);
}

export function showError(err, fallbackTitle = "Something went wrong") {
  if (err?.title) {
    return notify({ type: "error", title: err.title, message: err.message === err.title ? "" : err.message, hint: err.hint, details: err.details });
  }
  notify({
    type: "error", title: fallbackTitle, message: "The page hit an unexpected problem.",
    hint: "Try that again. If it keeps happening, reload the page; your drawing is saved in this browser.",
    details: err?.stack || err?.message || String(err ?? ""),
  });
}
