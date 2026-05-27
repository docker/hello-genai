async function _fetch(path, options = {}) {
    const resp = await fetch(path, options);
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
    // Sessions
    getSessions:       ()            => _fetch("/api/sessions").then(r => r.json()),
    createSession:     (data)        => _json("/api/sessions", "POST", data),
    deleteSession:     (id)          => _json(`/api/sessions/${id}`, "DELETE", {}),
    patchSession:      (id, data)    => _json(`/api/sessions/${id}`, "PATCH", data),
    pinSession:        (id, pinned)  => _json(`/api/sessions/${id}/pin`, "POST", { pinned }),
    getMessages:       (id)          => _fetch(`/api/sessions/${id}/messages`).then(r => r.json()),
    truncateMessages:  (sid, msgId)  => _json(`/api/sessions/${sid}/messages/from/${msgId}`, "DELETE", {}),
    generateTitle:     (id, message) => _json(`/api/sessions/${id}/generate-title`, "POST", { message }),
    exportUrl:         (id)          => `/api/sessions/${id}/export`,
    importSession:     (data)        => _json("/api/sessions/import", "POST", data),

    // Models
    getModels: () => _fetch("/api/models").then(r => r.json()),

    // Feedback
    setFeedback: (msgId, feedback) => _json(`/api/messages/${msgId}/feedback`, "POST", { feedback }),

    // Stats
    getStats: () => _fetch("/api/stats").then(r => r.json()),

    // Streaming
    async stream(body, { onStart, onToken, onDone, onError, signal } = {}) {
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
                    if (data.start)  onStart?.(data.user_message_id);
                    if (data.error)  { onError?.(data.error); return; }
                    if (data.token)  onToken?.(data.token);
                    if (data.done)   onDone?.(data.usage ?? {}, data.message_id, data.is_first);
                } catch { /* malformed chunk */ }
            }
        }
    },
};
