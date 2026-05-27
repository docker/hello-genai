import { api } from "./api.js";
import { getCurrentSessionId, renderSessionList, onSessionSwitch } from "./sessions.js";

let _onSwitch = null;

export function initExport(exportBtn, importBtn, importFileInput) {
    // ── Export ────────────────────────────────────────────────────────────────
    exportBtn?.addEventListener("click", () => {
        const id = getCurrentSessionId();
        if (!id) {
            window.__showToast?.("Start a conversation first before exporting.", "info");
            return;
        }
        try {
            const a = document.createElement("a");
            a.href = api.exportUrl(id);
            a.download = `chat-${id.slice(0, 8)}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch {
            window.__showToast?.("Export failed. Please try again.", "error");
        }
    });

    // ── Import ────────────────────────────────────────────────────────────────
    importBtn?.addEventListener("click", () => {
        importFileInput?.click();
    });

    importFileInput?.addEventListener("change", async () => {
        const file = importFileInput.files?.[0];
        if (!file) return;
        importFileInput.value = "";

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!Array.isArray(data.messages)) {
                window.__showToast?.("Invalid file: expected { title, messages: [...] }", "error");
                return;
            }

            const { session_id } = await api.importSession({
                title:         data.title ?? file.name.replace(/\.json$/, ""),
                messages:      data.messages,
                system_prompt: data.system_prompt ?? null,
            });

            await renderSessionList();

            // Switch to newly imported session
            const msgs = await api.getMessages(session_id);
            // Reuse the existing session-switch mechanism via a custom event
            window.__importSwitch?.(session_id, msgs);
            window.__showToast?.("Conversation imported.", "success");
        } catch (err) {
            console.error("Import failed:", err);
            window.__showToast?.("Import failed — make sure the file is valid JSON.", "error");
        }
    });
}
