// Raised when the server returns HTTP 429 so callers can show a friendly message
export class RateLimitError extends Error {
    constructor() { super("Rate limit reached"); this.name = "RateLimitError"; }
}

async function _fetch(path, options = {}) {
    const resp = await fetch(path, options);
    if (resp.status === 429) throw new RateLimitError();
    if (resp.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    return resp;
}

async function _json(path, method, body) {
    const r = await _fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return r.json();
}

export const api = {
    // Sessions (getSessions defined below with optional project filter)
    createSession:     (data)        => _json("/api/sessions", "POST", data),
    deleteSession:     (id)          => _json(`/api/sessions/${id}`, "DELETE", {}),
    patchSession:      (id, data)    => _json(`/api/sessions/${id}`, "PATCH", data),
    pinSession:        (id, pinned)  => _json(`/api/sessions/${id}/pin`, "POST", { pinned }),
    getMessages:       (id)          => _fetch(`/api/sessions/${id}/messages`).then(r => r.json()),
    truncateMessages:  (sid, msgId)  => _json(`/api/sessions/${sid}/messages/from/${msgId}`, "DELETE", {}),
    generateTitle:     (id, message) => _json(`/api/sessions/${id}/generate-title`, "POST", { message }),
    exportUrl:         (id, format = "md") => `/api/sessions/${id}/export${format === "json" ? "?format=json" : ""}`,
    importSession:     (data)        => _json("/api/sessions/import", "POST", data),

    // Full-text search across all sessions
    search: (q) => _fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()),

    // System prompt presets
    getPresets:   ()           => _fetch("/api/presets").then(r => r.json()),
    createPreset: (name, text) => _json("/api/presets", "POST", { name, text }),
    deletePreset: (id)         => _json(`/api/presets/${id}`, "DELETE", {}),

    // Models — pass refresh=true to bypass the server's 30s cache
    getModels: (refresh = false) =>
        _fetch(`/api/models${refresh ? `?refresh=${Date.now()}` : ""}`).then(r => r.json()),

    // Feedback
    setFeedback: (msgId, feedback) => _json(`/api/messages/${msgId}/feedback`, "POST", { feedback }),

    // Stats & runtime config
    getStats:  () => _fetch("/api/stats").then(r => r.json()),
    getConfig: () => _fetch("/api/config").then(r => r.json()),

    // Persistent chat memory
    getMemories:   ()             => _fetch("/api/memories").then(r => r.json()),
    createMemory:  (content)      => _json("/api/memories", "POST", { content }),
    updateMemory:  (id, data)     => _json(`/api/memories/${id}`, "PATCH", data),
    deleteMemory:  (id)           => _json(`/api/memories/${id}`, "DELETE", {}),
    clearMemories: ()             => _json("/api/memories", "DELETE", {}),

    // Projects
    getProjects:   ()             => _fetch("/api/projects").then(r => r.json()),
    createProject: (data)         => _json("/api/projects", "POST", data),
    updateProject: (id, data)     => _json(`/api/projects/${id}`, "PATCH", data),
    deleteProject: (id)           => _json(`/api/projects/${id}`, "DELETE", {}),
    setSessionProject: (sid, pid) => _json(`/api/sessions/${sid}/project`, "POST", { project_id: pid }),
    getSessions:   (projectId)    => _fetch(`/api/sessions${projectId ? `?project_id=${projectId}` : ""}`).then(r => r.json()),

    // Knowledge base (RAG documents)
    getDocuments:  (projectId)    => _fetch(`/api/documents${projectId ? `?project_id=${projectId}` : ""}`).then(r => r.json()),
    deleteDocument:(id)           => _json(`/api/documents/${id}`, "DELETE", {}),
    async uploadDocument(file, projectId) {
        const fd = new FormData();
        fd.append("file", file);
        if (projectId) fd.append("project_id", projectId);
        const r = await _fetch("/api/documents", { method: "POST", body: fd });
        return r.json();
    },

    // Slash-command templates
    getTemplates:  ()             => _fetch("/api/templates").then(r => r.json()),
    createTemplate:(data)         => _json("/api/templates", "POST", data),
    deleteTemplate:(id)           => _json(`/api/templates/${id}`, "DELETE", {}),

    // Bookmarks & branching
    toggleBookmark:(msgId)        => _json(`/api/messages/${msgId}/bookmark`, "POST", {}),
    getBookmarks:  ()             => _fetch("/api/bookmarks").then(r => r.json()),
    cycleBranch:   (msgId, dir)   => _json(`/api/messages/${msgId}/branch`, "POST", { direction: dir }),

    // Full backup (all conversations + presets)
    backupUrl: () => "/api/backup",
    importBackup: (data) => _json("/api/backup", "POST", data),

    // PDF text extraction
    async extractPdf(file) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await _fetch("/api/extract", { method: "POST", body: fd });
        return r.json();
    },

    // Streaming
    async stream(body, { onStart, onToken, onDone, onError, onNotice, onTool, signal } = {}) {
        const resp = await _fetch("/api/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal,
        });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.start)  onStart?.(data.user_message_id, data.model);
                    if (data.notice) onNotice?.(data.notice);
                    if (data.tool)   onTool?.(data.tool);
                    if (data.error)  { onError?.(data.error); return; }
                    if (data.token)  onToken?.(data.token);
                    if (data.done)   onDone?.(data.usage ?? {}, data.message_id, data.is_first, data.model);
                } catch { /* malformed chunk */ }
            }
        }
    },
};
