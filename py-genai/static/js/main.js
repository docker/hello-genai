import { initModelSelector, refreshModels }         from "./models.js";
import { renderSessionList, createAndSwitchSession, onSessionSwitch, onProjectChange } from "./sessions.js";
import { initExport }                               from "./export.js";
import { initChat, renderMessages }                 from "./chat.js";
import { initFeatures }                             from "./features.js";
import { showToast }                                from "./toast.js";

window.__showToast = showToast;

marked.setOptions({ breaks: true, gfm: true });

initChat();
initModelSelector(document.getElementById("model-select"));
initExport(
    document.getElementById("export-btn"),
    document.getElementById("import-btn"),
    document.getElementById("import-file-input"),
);
initFeatures();

onSessionSwitch((_id, messages) => renderMessages(messages));
onProjectChange(() => renderMessages([]));  // filtering projects clears the open chat

// Allow export.js to trigger a session switch after import
window.__importSwitch = (_id, messages) => renderMessages(messages);

await renderSessionList();

async function _newChat() {
    await createAndSwitchSession();
    renderMessages([]);
}
window.__newChat = _newChat;
document.getElementById("new-chat-btn").addEventListener("click", _newChat);

// Toolbar shortcuts to feature panels
document.getElementById("kb-btn")?.addEventListener("click", () => window.__openKnowledgeBase?.());
document.getElementById("palette-btn")?.addEventListener("click", () => window.__openPalette?.());

// Manual model-list refresh (spins the icon while loading)
document.getElementById("model-refresh-btn")?.addEventListener("click", (e) => {
    const icon = e.currentTarget.querySelector("i");
    icon?.classList.add("fa-spin");
    refreshModels({ notify: true }).finally(() =>
        setTimeout(() => icon?.classList.remove("fa-spin"), 400)
    );
});

// Sidebar search: filters titles instantly and full-text searches message
// content on the server (debounced)
let _searchTimer = null;
document.getElementById("session-search").addEventListener("input", (e) => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => renderSessionList(e.target.value), 200);
});

// Keep highlight.js theme in sync with dark mode
const hljsTheme = document.getElementById("hljs-theme");
new MutationObserver(() => {
    const dark = document.body.classList.contains("dark-mode");
    hljsTheme.href = `/static/vendor/highlight/styles/${dark ? "github-dark" : "github"}.min.css`;
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });

// Register the service worker for an installable, offline-capable app shell
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) =>
            console.warn("Service worker registration failed:", err)
        );
    });
}
