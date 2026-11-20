// Backend client. Every network call in the frontend goes through this file.
// Failures throw ApiError: title/message/hint for end users, `details` for developers (collapsed in the popup).
import { API_BASE } from "./config.js";

export class ApiError extends Error {
  constructor({ title, message = "", hint = "", details = "", status = 0 }) {
    super(message || title);
    Object.assign(this, { title, hint, details, status });
  }
}

// When the response is not our JSON error shape (e.g. nginx itself answered).
const FALLBACKS = {
  502: { title: "UMLforge is temporarily unavailable", message: "The server isn't responding right now.", hint: "Wait a moment and try again. Your drawing is saved in this browser.",
    details: "nginx could not reach the backend (502). Check `docker compose ps` and `docker compose logs backend`." },
  503: { title: "UMLforge is starting up", message: "The server is busy or still starting.", hint: "Wait a few seconds and try again.", details: "HTTP 503 from the gateway." },
  504: { title: "That took too long", message: "The server didn't answer in time.", hint: "Please try again.", details: "Gateway timeout (504); nginx proxy_read_timeout is 300s." },
  413: { title: "This diagram is too large to send", message: "It has more drawing data than the server accepts.", hint: "Erase some large pen drawings or split the diagram.", details: "HTTP 413: client_max_body_size in nginx.conf." },
};

async function toApiError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (body?.error?.title) return new ApiError({ ...body.error, status: res.status });
  const fallback = FALLBACKS[res.status] || { title: "That didn't work", message: "The server couldn't complete the request.", hint: "Please try again.",
    details: `HTTP ${res.status} ${res.statusText}${typeof body?.detail === "string" ? `: ${body.detail}` : ""}` };
  return new ApiError({ ...fallback, status: res.status });
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({
      title: "Can't connect to UMLforge",
      message: "Your internet connection or the server may be down.",
      hint: "Check your connection and try again. Your drawing is saved in this browser.",
      details: `fetch ${method} ${API_BASE || location.origin}${path} failed (network error). Is the stack running? \`docker compose up -d\``,
    });
  }
  if (!res.ok) throw await toApiError(res);
  return res.status === 204 ? null : res.json();
}

export const api = {
  analyze: (doc) => request("POST", "/api/analyze", doc),

  samples: () => request("GET", "/api/samples"),
  sample: (id) => request("GET", `/api/samples/${encodeURIComponent(id)}`),

  aiStatus: () => request("GET", "/api/ai/status"),
  starter: (problem) => request("POST", "/api/ai/starter", { problem }),
  /** Short structured review: { grade, score, verdict, fixes[], missing[], strengths[] } */
  review: (doc) => request("POST", "/api/ai/review", doc),

  publish: (title, diagram, ttlHours) => request("POST", "/api/shares", { title, diagram, ttl_hours: ttlHours }),
  share: (id) => request("GET", `/api/shares/${encodeURIComponent(id)}`),

  getDiagram: (id) => request("GET", `/api/diagrams/${id}`),
  createDiagram: (title, diagram) => request("POST", "/api/diagrams", { title, diagram }),
  updateDiagram: (id, title, diagram) => request("PUT", `/api/diagrams/${id}`, { title, diagram }),
  deleteDiagram: (id) => request("DELETE", `/api/diagrams/${id}`),
};
