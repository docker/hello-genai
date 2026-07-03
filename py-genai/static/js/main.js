import { initModelSelector }                        from "./models.js";
import { renderSessionList, createAndSwitchSession, onSessionSwitch } from "./sessions.js";
import { initExport }                               from "./export.js";
import { initChat, renderMessages }                 from "./chat.js";
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

onSessionSwitch((_id, messages) => renderMessages(messages));

// Allow export.js to trigger a session switch after import
window.__importSwitch = (_id, messages) => renderMessages(messages);

await renderSessionList();

document.getElementById("new-chat-btn").addEventListener("click", async () => {
    await createAndSwitchSession();
    renderMessages([]);
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
