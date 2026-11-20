// Tiny DOM helpers shared by the UI modules.

export const $ = (id) => document.getElementById(id);

export const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const svgIcon = (inner) =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export function switchPane(id) {
  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.toggle("active", b.dataset.pane === id));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.id === id));
  $("side").classList.remove("hidden");
}
