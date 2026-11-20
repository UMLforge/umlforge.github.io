// One project card (thumbnail, title, when, size), shared by the homepage and the projects page.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return new Date(ms).toLocaleDateString();
}

export function projectCard(p, { menu = true } = {}) {
  const href = `editor.html?project=${encodeURIComponent(p.id)}`;
  const c = p.counts || {};
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : word.endsWith("s") ? "es" : "s"}`;
  const size = c.shapes ? `${plural(c.classes || 0, "class")} · ${plural(c.links || 0, "link")}` : "Empty";
  return `<article class="pcard" data-id="${esc(p.id)}">
    <a class="thumb" href="${href}" tabindex="-1" aria-hidden="true">${p.thumb ? `<img src="${p.thumb}" alt="">` : '<div class="blank">No preview yet</div>'}</a>
    <div class="info">
      <a class="title" href="${href}">${esc(p.title || "Untitled")}</a>
      <div class="meta">Edited ${timeAgo(p.updated)} · ${size}</div>
      ${p.serverId ? '<div class="tags"><span class="tagChip">Saved on server</span></div>' : ""}
    </div>
    ${menu ? `<div class="menu">
      <button data-act="rename" title="Rename">Rename</button>
      <button data-act="duplicate" title="Duplicate">Copy</button>
      <button data-act="export" title="Download as JSON">Export</button>
      <button data-act="delete" class="danger" title="Delete">Delete</button></div>` : ""}
  </article>`;
}
