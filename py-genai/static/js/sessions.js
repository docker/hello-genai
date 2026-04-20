import { api } from "./api.js";

let _currentId = null;
const _switchListeners = [];

export function getCurrentSessionId() { return _currentId; }
export function onSessionSwitch(cb)   { _switchListeners.push(cb); }

export async function createAndSwitchSession(systemPrompt = null) {
    const { session_id } = await api.createSession({ system_prompt: systemPrompt });
    _currentId = session_id;
    await renderSessionList();
    return session_id;
}

export async function updateSessionSystemPrompt(sessionId, systemPrompt) {
    await api.patchSession(sessionId, { system_prompt: systemPrompt });
}

export async function renderSessionList() {
    const list = document.getElementById("session-list");
    if (!list) return;

    const sessions = await api.getSessions();
    list.innerHTML = "";

    if (!sessions.length) {
        list.innerHTML = '<p class="no-sessions">No conversations yet</p>';
        return;
    }

    sessions.forEach((s) => {
        const item = document.createElement("div");
        item.className = "session-item" +
            (s.id === _currentId ? " active" : "") +
            (s.pinned           ? " pinned-item" : "");
        item.dataset.id = s.id;

        item.innerHTML = `
            <button class="session-pin-btn ${s.pinned ? "pinned" : ""}" title="${s.pinned ? "Unpin" : "Pin"}">
                <i class="fas fa-thumbtack"></i>
            </button>
            <span class="session-title" title="${_escAttr(s.title)}">${_esc(s.title)}</span>
            <button class="session-delete-btn" title="Delete chat"><i class="fas fa-trash"></i></button>
        `;

        item.querySelector(".session-title").addEventListener("click", () => _switch(s.id));

        item.querySelector(".session-pin-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            await api.pinSession(s.id, !s.pinned);
            renderSessionList();
        });

        item.querySelector(".session-delete-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            await api.deleteSession(s.id);
            if (_currentId === s.id) {
                _currentId = null;
                _switchListeners.forEach((cb) => cb(null, []));
            }
            renderSessionList();
        });

        list.appendChild(item);
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
