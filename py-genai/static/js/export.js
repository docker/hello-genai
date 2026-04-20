import { api } from "./api.js";
import { getCurrentSessionId } from "./sessions.js";

export function initExport(btn) {
    btn.addEventListener("click", () => {
        const id = getCurrentSessionId();
        if (!id) {
            alert("Start a conversation first before exporting.");
            return;
        }
        const a = document.createElement("a");
        a.href = api.exportUrl(id);
        a.download = `chat-${id.slice(0, 8)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
}
