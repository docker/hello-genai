import { api } from "./api.js";
import { getCurrentSessionId } from "./sessions.js";

export function initExport(btn) {
    btn.addEventListener("click", () => {
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
}
