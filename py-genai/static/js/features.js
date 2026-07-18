// Projects, Knowledge Base, Command Palette, and Bookmarks.
import { api } from "./api.js";
import { getCurrentProjectId, renderProjectBar, setCurrentProject, switchToSession } from "./sessions.js";

function _esc(str) {
    const d = document.createElement("div");
    d.textContent = str ?? "";
    return d.innerHTML;
}
const _toast = (m, t = "info") => window.__showToast?.(m, t);

// ── Projects ──────────────────────────────────────────────────────────────────
async function _renderProjects() {
    const list = document.getElementById("projects-list");
    if (!list) return;
    let projects = [];
    try { projects = await api.getProjects(); } catch { /* empty */ }
    if (!projects.length) {
        list.innerHTML = '<p class="no-presets">No projects yet. Create one to group chats and scope memory & documents.</p>';
        return;
    }
    list.innerHTML = "";
    projects.forEach((p) => {
        const row = document.createElement("div");
        row.className = "project-row";
        row.innerHTML = `
            <div class="project-row-main">
                <span class="project-row-name">${_esc(p.name)}</span>
                <span class="project-row-meta">${p.session_count} chat${p.session_count === 1 ? "" : "s"}</span>
            </div>
            <button class="project-open" title="View project chats"><i class="fas fa-arrow-right-to-bracket"></i></button>
            <button class="project-del" title="Delete project"><i class="fas fa-trash"></i></button>`;
        row.querySelector(".project-open").addEventListener("click", async () => {
            await setCurrentProject(p.id);
            document.getElementById("projects-modal")?.classList.remove("open");
        });
        row.querySelector(".project-del").addEventListener("click", async () => {
            if (!confirm(`Delete project "${p.name}"? Its chats become unfiled; its documents and scoped memories are removed.`)) return;
            try { await api.deleteProject(p.id); } catch { /* ignore */ }
            _renderProjects();
            renderProjectBar();
        });
        list.appendChild(row);
    });
}

function _initProjects() {
    const modal = document.getElementById("projects-modal");
    const nameInput = document.getElementById("project-name-input");
    const promptInput = document.getElementById("project-prompt-input");
    const addBtn = document.getElementById("project-add-btn");
    window.__openProjects = () => { _renderProjects(); modal?.classList.add("open"); };
    document.getElementById("projects-close")?.addEventListener("click", () => modal?.classList.remove("open"));
    modal?.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

    addBtn?.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        try {
            await api.createProject({ name, system_prompt: promptInput.value.trim() || null });
            nameInput.value = ""; promptInput.value = "";
            _renderProjects();
            renderProjectBar();
            _toast(`Project "${name}" created.`, "success");
        } catch { _toast("Could not create project.", "error"); }
    });
}

// ── Knowledge base (RAG documents) ────────────────────────────────────────────
async function _renderDocuments() {
    const list = document.getElementById("kb-list");
    const note = document.getElementById("kb-note");
    if (!list) return;
    let data = { documents: [], embeddings_available: false };
    try { data = await api.getDocuments(getCurrentProjectId()); } catch { /* empty */ }
    if (note) {
        note.style.display = data.embeddings_available ? "none" : "block";
    }
    if (!data.documents.length) {
        list.innerHTML = '<p class="no-presets">No documents yet. Upload a PDF or text file to let the assistant cite it.</p>';
        return;
    }
    list.innerHTML = "";
    data.documents.forEach((d) => {
        const row = document.createElement("div");
        row.className = "kb-row";
        row.innerHTML = `
            <i class="fas fa-file-lines"></i>
            <div class="kb-row-main">
                <span class="kb-row-name">${_esc(d.filename)}</span>
                <span class="kb-row-meta">${d.chunk_count} chunk${d.chunk_count === 1 ? "" : "s"} · ${(d.chars / 1000).toFixed(1)}k chars</span>
            </div>
            <button class="kb-del" title="Remove"><i class="fas fa-trash"></i></button>`;
        row.querySelector(".kb-del").addEventListener("click", async () => {
            try { await api.deleteDocument(d.id); } catch { /* ignore */ }
            _renderDocuments();
        });
        list.appendChild(row);
    });
}

function _initKnowledgeBase() {
    const modal = document.getElementById("kb-modal");
    const fileInput = document.getElementById("kb-file-input");
    const uploadBtn = document.getElementById("kb-upload-btn");
    window.__openKnowledgeBase = () => { _renderDocuments(); modal?.classList.add("open"); };
    document.getElementById("kb-close")?.addEventListener("click", () => modal?.classList.remove("open"));
    modal?.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

    uploadBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
        for (const file of fileInput.files) {
            _toast(`Ingesting ${file.name}…`, "info");
            try {
                const res = await api.uploadDocument(file, getCurrentProjectId());
                _toast(`Added ${file.name} (${res.chunks} chunks${res.embedded ? ", embedded" : ""}).`, "success");
            } catch {
                _toast(`Could not add ${file.name}.`, "error");
            }
        }
        fileInput.value = "";
        _renderDocuments();
    });
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────
async function _renderBookmarks() {
    const list = document.getElementById("bookmarks-list");
    if (!list) return;
    let bms = [];
    try { bms = await api.getBookmarks(); } catch { /* empty */ }
    if (!bms.length) {
        list.innerHTML = '<p class="no-presets">No bookmarks yet. Hover a message and click the ★ to save it.</p>';
        return;
    }
    list.innerHTML = "";
    bms.forEach((b) => {
        const row = document.createElement("div");
        row.className = "bookmark-row";
        const preview = b.content.replace(/<think>[\s\S]*?<\/think>/g, "").slice(0, 140);
        row.innerHTML = `
            <div class="bookmark-main">
                <span class="bookmark-title">${_esc(b.session_title)}</span>
                <span class="bookmark-preview">${_esc(preview)}</span>
            </div>
            <i class="fas fa-arrow-right"></i>`;
        row.addEventListener("click", async () => {
            document.getElementById("bookmarks-modal")?.classList.remove("open");
            await switchToSession(b.session_id, b.id);
        });
        list.appendChild(row);
    });
}

function _initBookmarks() {
    const modal = document.getElementById("bookmarks-modal");
    window.__openBookmarks = () => { _renderBookmarks(); modal?.classList.add("open"); };
    document.getElementById("bookmarks-close")?.addEventListener("click", () => modal?.classList.remove("open"));
    modal?.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
}

// ── Command palette (⌘K) ──────────────────────────────────────────────────────
function _commands() {
    return [
        { icon: "fa-plus", label: "New chat", run: () => window.__newChat?.() },
        { icon: "fa-brain", label: "Open memory", run: () => document.getElementById("memory-btn")?.click() },
        { icon: "fa-book", label: "Open knowledge base", run: () => window.__openKnowledgeBase?.() },
        { icon: "fa-layer-group", label: "Manage projects", run: () => window.__openProjects?.() },
        { icon: "fa-bookmark", label: "View bookmarks", run: () => window.__openBookmarks?.() },
        { icon: "fa-chart-bar", label: "Usage & analytics", run: () => document.getElementById("stats-btn")?.click() },
        { icon: "fa-sliders", label: "Edit system prompt", run: () => document.getElementById("prompt-btn")?.click() },
        { icon: "fa-cog", label: "Model settings", run: () => document.getElementById("settings-btn")?.click() },
        { icon: "fa-moon", label: "Toggle dark mode", run: () => document.getElementById("theme-toggle")?.click() },
        { icon: "fa-download", label: "Export conversation", run: () => document.getElementById("export-btn")?.click() },
    ];
}

function _initPalette() {
    const overlay = document.getElementById("palette-overlay");
    const input = document.getElementById("palette-input");
    const list = document.getElementById("palette-list");
    if (!overlay) return;

    let items = [];       // flattened {type,label,icon,run}
    let active = 0;

    const open = async () => {
        overlay.classList.add("open");
        input.value = "";
        active = 0;
        await _rebuild("");
        input.focus();
    };
    const close = () => overlay.classList.remove("open");
    window.__openPalette = open;

    async function _rebuild(query) {
        const q = query.toLowerCase().trim();
        const cmds = _commands().map((c) => ({ ...c, type: "command" }));
        let sessions = [];
        try {
            sessions = (await api.getSessions()).slice(0, 20).map((s) => ({
                type: "session", icon: "fa-comment", label: s.title,
                run: () => switchToSession(s.id),
            }));
        } catch { /* ignore */ }
        items = [...cmds, ...sessions].filter((it) => !q || it.label.toLowerCase().includes(q));
        active = 0;
        _paint();
    }

    function _paint() {
        list.innerHTML = "";
        items.forEach((it, i) => {
            const el = document.createElement("div");
            el.className = "palette-item" + (i === active ? " active" : "");
            el.innerHTML = `<i class="fas ${it.icon}"></i><span>${_esc(it.label)}</span><span class="palette-kind">${it.type}</span>`;
            el.addEventListener("click", () => { it.run(); close(); });
            list.appendChild(el);
        });
    }

    let t = null;
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => _rebuild(input.value), 120); });
    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, items.length - 1); _paint(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); _paint(); }
        else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); close(); }
        else if (e.key === "Escape") { close(); }
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

export function initFeatures() {
    _initProjects();
    _initKnowledgeBase();
    _initBookmarks();
    _initPalette();
    renderProjectBar();
}
