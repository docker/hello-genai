// Same-origin by default: nginx proxies /api, /v1, /ws and /docs to the backend,
// so the app works from any device on the network (phone, tablet, another
// laptop) with no hostname baked in at build time and no CORS. Set
// VITE_API_URL only to point the SPA at a backend on a different origin.
const API = (import.meta as any).env?.VITE_API_URL || "";
/** Absolute base for things users copy/paste (e.g. the OpenAI SDK base_url). */
export const API_BASE = API || (typeof location !== "undefined" ? location.origin : "");
export const DOCS_URL = `${API}/docs`;

export function token(): string | null {
  return localStorage.getItem("token");
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

// Lightweight signal so open "live" panels refetch the instant a reply finishes.
export function emitActivity() { window.dispatchEvent(new Event("genai:activity")); }
export function onActivity(fn: () => void) {
  window.addEventListener("genai:activity", fn);
  return () => window.removeEventListener("genai:activity", fn);
}

// In-progress generation state, updated live from the chat stream so panels can
// show numbers climbing *while* a reply is being delivered (not just after).
export type LiveStream = { active: boolean; tokens: number; model: string; tps?: number };
let _live: LiveStream = { active: false, tokens: 0, model: "", tps: 0 };
export function getLive(): LiveStream { return _live; }
export function setLive(p: Partial<LiveStream>) {
  _live = { ..._live, ...p };
  window.dispatchEvent(new Event("genai:live"));
}
export function onLive(fn: () => void) {
  window.addEventListener("genai:live", fn);
  return () => window.removeEventListener("genai:live", fn);
}

// App-wide notifications (toasts + notification center).
export type Notif = { title: string; body?: string; kind?: "info" | "memory" | "success" | "error" };
export function notify(n: Notif) { window.dispatchEvent(new CustomEvent("genai:notify", { detail: n })); }
export function onNotify(fn: (n: Notif) => void) {
  const h = (e: Event) => fn((e as CustomEvent).detail as Notif);
  window.addEventListener("genai:notify", h);
  return () => window.removeEventListener("genai:notify", h);
}

async function req(path: string, opts: RequestInit = {}) {
  const headers: any = { ...(opts.headers || {}) };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  // Never serve API reads from the browser cache — polling modals must see fresh data.
  const res = await fetch(`${API}${path}`, { cache: "no-store", ...opts, headers });
  if (res.status === 401) {
    setToken(null);
    location.reload();
  }
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// Fetch a protected file endpoint and trigger a browser download (JWT is in a
// header, so a plain <a href> won't work for authenticated downloads).
async function downloadFile(path: string, fallbackName: string) {
  const t = token();
  const res = await fetch(`${API}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="([^"]+)"/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = m ? m[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  register: (b: any) => req("/api/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: any) => req("/api/auth/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => req("/api/auth/me"),
  updateProfile: (b: any) => req("/api/auth/me", { method: "PATCH", body: JSON.stringify(b) }),
  changePassword: (current_password: string, new_password: string) =>
    req("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),

  // Personal access tokens
  tokens: () => req("/api/user/tokens"),
  createToken: (b: { name: string; expires_in_days?: number | null }) =>
    req("/api/user/tokens", { method: "POST", body: JSON.stringify(b) }),
  renameToken: (id: number, name: string) =>
    req(`/api/user/tokens/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  revokeToken: (id: number) => req(`/api/user/tokens/${id}/revoke`, { method: "POST", body: "{}" }),
  deleteToken: (id: number) => req(`/api/user/tokens/${id}`, { method: "DELETE" }),
  deleteAllTokens: () => req("/api/user/tokens", { method: "DELETE" }),

  // Sharing
  shareSession: (id: string) => req(`/api/sessions/${id}/share`, { method: "POST", body: "{}" }),
  unshareSession: (id: string) => req(`/api/sessions/${id}/share`, { method: "DELETE" }),
  sharedView: (tokenId: string) => req(`/api/shared/${tokenId}`),

  // Edit & suggestions
  editMessage: (id: number, content: string) => req(`/api/messages/${id}`, { method: "PATCH", body: JSON.stringify({ content }) }),
  suggestions: (sessionId: string) => req(`/api/sessions/${sessionId}/suggestions`, { method: "POST", body: "{}" }),

  // Scheduled prompts
  schedules: () => req("/api/schedules"),
  createSchedule: (b: any) => req("/api/schedules", { method: "POST", body: JSON.stringify(b) }),
  patchSchedule: (id: number, b: any) => req(`/api/schedules/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteSchedule: (id: number) => req(`/api/schedules/${id}`, { method: "DELETE" }),
  runSchedule: (id: number) => req(`/api/schedules/${id}/run`, { method: "POST", body: "{}" }),

  // Admin
  adminOverview: () => req("/api/admin/overview"),
  adminUsers: () => req("/api/admin/users"),
  adminSetAdmin: (id: string, is_admin: boolean) => req(`/api/admin/users/${id}/admin`, { method: "POST", body: JSON.stringify({ is_admin }) }),
  adminSetActive: (id: string, is_active: boolean) => req(`/api/admin/users/${id}/active`, { method: "POST", body: JSON.stringify({ is_active }) }),

  // Time-series
  timeseries: (days = 30) => req(`/api/stats/timeseries?days=${days}`),

  // B10 — blind model arena
  arenaVote: (b: { winner: string; loser: string; tie?: boolean; prompt?: string }) =>
    req("/api/arena/vote", { method: "POST", body: JSON.stringify(b) }),
  arenaLeaderboard: () => req("/api/arena/leaderboard"),
  config: () => req("/api/config"),

  // Non-streaming chat — used by compare mode (save:false → no history pollution).
  chat: (payload: any) => req("/api/chat", { method: "POST", body: JSON.stringify(payload) }),

  sessions: (projectId?: number) => req(`/api/sessions${projectId ? `?project_id=${projectId}` : ""}`),
  createSession: () => req("/api/sessions", { method: "POST", body: "{}" }),
  patchSession: (id: string, b: any) => req(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteSession: (id: string) => req(`/api/sessions/${id}`, { method: "DELETE" }),
  messages: (id: string) => req(`/api/sessions/${id}/messages`),

  projects: () => req("/api/projects"),
  createProject: (b: any) => req("/api/projects", { method: "POST", body: JSON.stringify(b) }),
  patchProject: (id: number, b: any) => req(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteProject: (id: number, deleteChats = true) =>
    req(`/api/projects/${id}?delete_chats=${deleteChats}`, { method: "DELETE" }),
  assignSessionProject: (id: string, projectId: number | null) =>
    req(`/api/sessions/${id}/project`, { method: "POST", body: JSON.stringify({ project_id: projectId }) }),

  models: (refresh = false) => req(`/api/models${refresh ? `?refresh=${Date.now()}` : ""}`),
  modelInfo: () => req("/api/models/info"),

  memories: () => req("/api/memories"),
  createMemory: (content: string) => req("/api/memories", { method: "POST", body: JSON.stringify({ content }) }),
  remember: (content: string) => req("/api/memories/remember", { method: "POST", body: JSON.stringify({ content }) }),
  deleteMemory: (id: number) => req(`/api/memories/${id}`, { method: "DELETE" }),

  stats: () => req("/api/stats"),
  liveMetrics: () => req("/api/metrics/live"),
  deleteTurn: (sessionId: string, messageId: number) =>
    req(`/api/sessions/${sessionId}/messages/${messageId}`, { method: "DELETE" }),
  search: (q: string, semantic = false) =>
    req(`/api/search?q=${encodeURIComponent(q)}${semantic ? "&semantic=true" : ""}`),
  relatedSessions: (id: string) => req(`/api/sessions/${id}/related`),
  bookmarks: () => req("/api/bookmarks"),
  bookmark: (id: number) => req(`/api/messages/${id}/bookmark`, { method: "POST", body: "{}" }),
  branch: (id: number, direction: "prev" | "next") =>
    req(`/api/messages/${id}/branch`, { method: "POST", body: JSON.stringify({ direction }) }),
  feedback: (id: number, feedback: string | null) =>
    req(`/api/messages/${id}/feedback`, { method: "POST", body: JSON.stringify({ feedback }) }),

  presets: () => req("/api/presets"),
  createPreset: (b: { name: string; text: string }) => req("/api/presets", { method: "POST", body: JSON.stringify(b) }),
  deletePreset: (id: number) => req(`/api/presets/${id}`, { method: "DELETE" }),
  templates: () => req("/api/templates"),
  createTemplate: (b: { trigger: string; title?: string; content: string }) =>
    req("/api/templates", { method: "POST", body: JSON.stringify(b) }),
  deleteTemplate: (id: number) => req(`/api/templates/${id}`, { method: "DELETE" }),

  // Data: export / import / backup / clear
  exportSession: (id: string, format: "json" | "md" | "html") =>
    downloadFile(`/api/sessions/${id}/export?format=${format}`, `chat.${format}`),
  downloadBackup: () => downloadFile("/api/backup", "hello-genai-backup.json"),
  importBackup: (data: any) => req("/api/backup", { method: "POST", body: JSON.stringify(data) }),
  importSession: (data: any) => req("/api/sessions/import", { method: "POST", body: JSON.stringify(data) }),
  clearAllSessions: () => req("/api/sessions", { method: "DELETE" }),

  documents: (projectId?: number) => req(`/api/documents${projectId ? `?project_id=${projectId}` : ""}`),
  deleteDocument: (id: number) => req(`/api/documents/${id}`, { method: "DELETE" }),
  async uploadDoc(file: File, projectId?: number) {
    const fd = new FormData();
    fd.append("file", file);
    if (projectId) fd.append("project_id", String(projectId));
    return req("/api/documents", { method: "POST", body: fd });
  },
};

export type ChatEvent = {
  start?: boolean;
  token?: string;
  tool?: { name: string; arguments: any; result: string };
  notice?: string;
  error?: string;
  done?: boolean;
  usage?: any;
  message_id?: number;
  user_message_id?: number;
  session_id?: string;
  model?: string;
  is_first?: boolean;
};

/** Stream a chat over WebSocket. Returns a cancel function. */
export function streamChat(payload: any, on: (e: ChatEvent) => void, onClose?: () => void) {
  // Same-origin: derive from the page (ws:// or wss://) so it follows whatever
  // host the app is being viewed on. Absolute API only when VITE_API_URL is set.
  const origin = API
    ? API.replace(/^http/, "ws")
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const wsUrl = `${origin}/ws/chat?token=${encodeURIComponent(token() || "")}`;
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => ws.send(JSON.stringify(payload));
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      on(data);
      if (data.done || data.error) ws.close();
    } catch {}
  };
  ws.onclose = () => onClose?.();
  ws.onerror = () => on({ error: "Connection error" });
  return () => ws.close();
}
