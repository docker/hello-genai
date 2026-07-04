import { api } from "./api.js";
import { getCurrentSessionId, renderSessionList } from "./sessions.js";

function _download(format) {
    const id = getCurrentSessionId();
    if (!id) {
        window.__showToast?.("Start a conversation first before exporting.", "info");
        return;
    }
    try {
        const a = document.createElement("a");
        a.href = api.exportUrl(id, format);
        a.download = `chat-${id.slice(0, 8)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch {
        window.__showToast?.("Export failed. Please try again.", "error");
    }
}

export function initExport(exportBtn, importBtn, importFileInput) {
    // ── Export (dropdown: Markdown or re-importable JSON) ─────────────────────
    const menu = document.getElementById("export-menu");

    exportBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!menu) { _download("md"); return; }
        const open = menu.style.display !== "none";
        menu.style.display = open ? "none" : "flex";
        if (!open) {
            const rect = exportBtn.getBoundingClientRect();
            menu.style.top  = rect.bottom + 4 + "px";
            menu.style.left = rect.left + "px";
        }
    });

    document.addEventListener("click", () => { if (menu) menu.style.display = "none"; });

    document.getElementById("export-md-btn")?.addEventListener("click", () => _download("md"));
    document.getElementById("export-json-btn")?.addEventListener("click", () => _download("json"));
    document.getElementById("export-backup-btn")?.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = api.backupUrl();
        a.download = "hello-genai-backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.__showToast?.("Backing up all conversations…", "info");
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

            // Full backup (multiple sessions + presets)
            if (Array.isArray(data.sessions)) {
                const { imported_sessions } = await api.importBackup(data);
                await renderSessionList();
                window.__showToast?.(`Restored ${imported_sessions} conversation${imported_sessions === 1 ? "" : "s"}.`, "success");
                return;
            }

            // Single conversation
            if (!Array.isArray(data.messages)) {
                window.__showToast?.("Invalid file: expected { title, messages } or a backup with { sessions }", "error");
                return;
            }

            const { session_id } = await api.importSession({
                title:         data.title ?? file.name.replace(/\.json$/, ""),
                messages:      data.messages,
                system_prompt: data.system_prompt ?? null,
                model:         data.model ?? null,
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
