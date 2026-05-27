import { api } from "./api.js";

let _currentId = null;
const _switchListeners = [];

export function getCurrentSessionId() { return _currentId; }
export function onSessionSwitch(cb)   { _switchListeners.push(cb); }

function _toast(msg, type = "error") {
    window.__showToast?.(msg, type);
}

export async function createAndSwitchSession(systemPrompt = null) {
    const { session_id } = await api.createSession({ system_prompt: systemPrompt });
    _currentId = session_id;
    await renderSessionList();
    return session_id;
}

export async function updateSessionSystemPrompt(sessionId, systemPrompt) {
    await api.patchSession(sessionId, { system_prompt: systemPrompt });
}

// ── Date grouping ─────────────────────────────────────────────────────────────
function _groupLabel(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7)  return "Last 7 Days";
    return "Older";
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function _showSkeleton(list) {
    list.innerHTML = "";
    for (let i = 0; i < 4; i++) {
        const el = document.createElement("div");
        el.className = "skeleton skeleton-item";
        list.appendChild(el);
    }
}

// ── Inline rename ─────────────────────────────────────────────────────────────
function _startRename(item, session) {
    const infoEl  = item.querySelector(".session-info");
    const titleEl = item.querySelector(".session-title");
    if (!titleEl) return;

    const original = titleEl.textContent;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "session-rename-input";
    input.value = original;
    input.maxLength = 80;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
        const newTitle = input.value.trim() || original;
        const span = document.createElement("span");
        span.className = "session-title";
        span.title = newTitle;
        span.textContent = newTitle;
        input.replaceWith(span);
        _wireTitle(span, item, session);
        if (newTitle !== original) {
            try {
                await api.patchSession(session.id, { title: newTitle });
            } catch {
                _toast("Could not rename conversation.");
            }
        }
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter")  { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") { input.value = original; input.blur(); }
        e.stopPropagation();
    });
}

function _wireTitle(span, item, session) {
    let clickTimer = null;
    span.addEventListener("click", (e) => {
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            _startRename(item, session);
        } else {
            clickTimer = setTimeout(() => {
                clickTimer = null;
                _switch(session.id);
            }, 220);
        }
    });
}

// ── Build a single session item ───────────────────────────────────────────────
function _buildItem(s) {
    const item = document.createElement("div");
    item.className = "session-item" +
        (s.id === _currentId ? " active"       : "") +
        (s.pinned            ? " pinned-item"  : "");
    item.dataset.id = s.id;

    const modelSnippet = s.model
        ? `<span class="session-model-badge">${_esc(s.model.split("/").pop())}</span>`
        : "";

    item.innerHTML = `
        <button class="session-pin-btn ${s.pinned ? "pinned" : ""}" title="${s.pinned ? "Unpin" : "Pin"}">
            <i class="fas fa-thumbtack"></i>
        </button>
        <div class="session-info">
            <span class="session-title" title="${_escAttr(s.title)}">${_esc(s.title)}</span>
            ${modelSnippet}
        </div>
        <button class="session-delete-btn" title="Delete chat"><i class="fas fa-trash"></i></button>
    `;

    const titleSpan = item.querySelector(".session-title");
    _wireTitle(titleSpan, item, s);

    item.querySelector(".session-pin-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
            await api.pinSession(s.id, !s.pinned);
            renderSessionList();
        } catch {
            _toast("Could not update pin. Please try again.");
        }
    });

    item.querySelector(".session-delete-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
            await api.deleteSession(s.id);
            if (_currentId === s.id) {
                _currentId = null;
                _switchListeners.forEach((cb) => cb(null, []));
            }
            renderSessionList();
        } catch {
            _toast("Could not delete conversation. Please try again.");
        }
    });

    return item;
}

// ── Render session list with optional search filter ───────────────────────────
export async function renderSessionList(filterQuery = "") {
    const list = document.getElementById("session-list");
    if (!list) return;

    const isFirstLoad = list.dataset.loaded !== "true";
    if (isFirstLoad) _showSkeleton(list);

    const sessions = await api.getSessions();
    list.dataset.loaded = "true";
    list.innerHTML = "";

    const q = filterQuery.toLowerCase().trim();
    const filtered = q ? sessions.filter(s => s.title.toLowerCase().includes(q)) : sessions;

    if (!filtered.length) {
        list.innerHTML = `<p class="no-sessions">${q ? "No matching chats" : "No conversations yet"}</p>`;
        return;
    }

    const GROUP_ORDER = ["Today", "Yesterday", "Last 7 Days", "Older"];
    const groups = {};
    filtered.forEach(s => {
        const label = _groupLabel(s.updated_at);
        (groups[label] = groups[label] ?? []).push(s);
    });

    GROUP_ORDER.forEach(label => {
        const members = groups[label];
        if (!members?.length) return;

        const header = document.createElement("div");
        header.className = "session-group-header";
        header.textContent = label;
        list.appendChild(header);

        members.forEach(s => list.appendChild(_buildItem(s)));
    });
}

async function _switch(sessionId) {
    _currentId = sessionId;
    document.querySelectorAll(".session-item").forEach((el) =>
        el.classList.toggle("active", el.dataset.id === sessionId)
    );
    const messages = await api.getMessages(sessionId);
    _switchListeners.forEach((cb) => cb(sessionId, messages));
}

function _esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
}

function _escAttr(str) {
    return String(str).replace(/"/g, "&quot;");
}
