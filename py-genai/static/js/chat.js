import { api } from "./api.js";
import { applyMarkdown, appendToken } from "./markdown.js";
import { getCurrentModel } from "./models.js";
import {
    getCurrentSessionId,
    createAndSwitchSession,
    updateSessionSystemPrompt,
    renderSessionList,
} from "./sessions.js";

// ── State ─────────────────────────────────────────────────────────────────────
let _abort        = null;
let _systemPrompt = null;
let _lastUserMsg  = null;   // { content, msgId } for regenerate
let _llmSettings  = { temperature: null, max_tokens: null };
let _compare      = { enabled: false, model: null };   // side-by-side second model

export function getLLMSettings() { return { ..._llmSettings }; }

// ── Relative time util ────────────────────────────────────────────────────────
function _relTime(date = new Date()) {
    const secs = Math.round((Date.now() - date) / 1000);
    if (secs < 5)   return "just now";
    if (secs < 60)  return `${secs}s ago`;
    const mins = Math.round(secs / 60);
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function _absTime(date = new Date()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Welcome screen ────────────────────────────────────────────────────────────
function _buildWelcome() {
    const div = document.createElement("div");
    div.id = "welcome";
    div.innerHTML = `
        <div class="welcome-icon"><i class="fas fa-robot"></i></div>
        <div class="welcome-title">Hello-GenAI</div>
        <div class="welcome-sub">Your local AI assistant, powered by an OpenAI-compatible backend. Ask anything.</div>
        <div class="suggestions">
            <button class="suggestion">What can you do?</button>
            <button class="suggestion">Tell me about Docker</button>
            <button class="suggestion">Explain containerisation</button>
            <button class="suggestion">Write a Python function</button>
        </div>`;
    div.querySelectorAll(".suggestion").forEach((btn) =>
        btn.addEventListener("click", () => {
            document.getElementById("message-input").value = btn.textContent;
            sendMessage();
        })
    );
    return div;
}

// ── User row ──────────────────────────────────────────────────────────────────
function _buildUserRow(content, msgId = null) {
    const now = new Date();
    const row = document.createElement("div");
    row.className = "message-row user-row";
    if (msgId) row.dataset.messageId = msgId;
    row.innerHTML = `
        <div class="msg-content">
            <div class="user-bubble"></div>
            <div class="msg-meta">
                <button class="edit-btn" title="Edit message"><i class="fas fa-pencil-alt"></i> Edit</button>
                <span class="msg-time" title="${_absTime(now)}">${_relTime(now)}</span>
            </div>
        </div>
        <div class="avatar user-avatar"><i class="fas fa-user"></i></div>`;
    row.querySelector(".user-bubble").textContent = content;
    row.querySelector(".edit-btn").addEventListener("click", () => _editMessage(row));
    return row;
}

// ── Bot row ───────────────────────────────────────────────────────────────────
function _buildBotRow(content = "", usage = null, msgId = null, timing = null) {
    const now = new Date();
    const row = document.createElement("div");
    row.className = "message-row bot-row";
    if (msgId) row.dataset.messageId = msgId;
    row.innerHTML = `
        <div class="avatar bot-avatar"><i class="fas fa-robot"></i></div>
        <div class="msg-content">
            <div class="bot-bubble"></div>
            <div class="msg-meta">
                <span class="token-badge" style="display:none"></span>
                <span class="timing-badge" style="display:none"></span>
                <div class="feedback-btns">
                    <button class="feedback-btn" data-val="up"   title="Good response"><i class="fas fa-thumbs-up"></i></button>
                    <button class="feedback-btn" data-val="down" title="Bad response"><i class="fas fa-thumbs-down"></i></button>
                </div>
                <button class="copy-msg-btn" title="Copy response"><i class="fas fa-copy"></i></button>
                <span class="msg-time" title="${_absTime(now)}">${_relTime(now)}</span>
            </div>
        </div>`;

    if (content) applyMarkdown(row.querySelector(".bot-bubble"), content);
    if (usage)   _setUsage(row, usage);
    if (timing)  _setTiming(row, timing);
    if (msgId)   _wireFeedback(row, msgId);
    _wireCopyMsg(row);
    return row;
}

function _wireFeedback(row, msgId) {
    row.querySelectorAll(".feedback-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const val = btn.dataset.val;
            const alreadyActive = btn.classList.contains(`active-${val}`);
            const newVal = alreadyActive ? null : val;
            try {
                await api.setFeedback(Number(msgId), newVal);
                row.querySelectorAll(".feedback-btn").forEach(b => {
                    b.classList.remove("active-up", "active-down");
                });
                if (newVal) btn.classList.add(`active-${newVal}`);
            } catch { /* silently ignore */ }
        });
    });
}

function _wireCopyMsg(row) {
    const btn    = row.querySelector(".copy-msg-btn");
    const bubble = row.querySelector(".bot-bubble");
    if (!btn || !bubble) return;
    btn.addEventListener("click", () => {
        const text = bubble._raw ?? bubble.innerText;
        navigator.clipboard.writeText(text).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
        });
    });
}

function _setUsage(row, usage) {
    if (!usage || !usage.total_tokens) return;
    const badge = row.querySelector(".token-badge");
    badge.style.display = "inline-flex";
    badge.innerHTML = `<i class="fas fa-coins"></i>&nbsp;${usage.prompt_tokens ?? "?"}↑ ${usage.completion_tokens ?? "?"}↓ ${usage.total_tokens} total`;
}

function _setTiming(row, { ttft, elapsed, tokensPerSec }) {
    const badge = row.querySelector(".timing-badge");
    if (!badge) return;
    const parts = [];
    if (ttft    != null) parts.push(`⚡ ${ttft}ms`);
    if (tokensPerSec != null) parts.push(`${tokensPerSec} tok/s`);
    if (!parts.length) return;
    badge.style.display = "inline-flex";
    badge.innerHTML = `<i class="fas fa-bolt"></i>&nbsp;${parts.join(" · ")}`;
}

function _setInterrupted(row) {
    const meta = row.querySelector(".msg-meta");
    if (!meta || meta.querySelector(".interrupted-badge")) return;
    const badge = document.createElement("span");
    badge.className = "interrupted-badge";
    badge.title = "This response was stopped before it finished. Use regenerate to retry.";
    badge.innerHTML = '<i class="fas fa-hand"></i>&nbsp;stopped';
    meta.prepend(badge);
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function _buildTypingIndicator() {
    const row = document.createElement("div");
    row.id = "typing-indicator";
    row.className = "message-row bot-row typing-row";
    row.innerHTML = `
        <div class="avatar bot-avatar"><i class="fas fa-robot"></i></div>
        <div class="typing-dots"><span></span><span></span><span></span></div>`;
    return row;
}

// ── Regenerate ────────────────────────────────────────────────────────────────
function _updateRegenerateBtn() {
    document.querySelectorAll(".regen-btn").forEach(b => b.remove());
    const botRows = document.querySelectorAll(".bot-row:not(.typing-row)");
    const last = botRows[botRows.length - 1];
    if (!last || !_lastUserMsg) return;
    const meta = last.querySelector(".msg-meta");
    if (!meta) return;
    const btn = document.createElement("button");
    btn.className = "regen-btn";
    btn.title = "Regenerate response";
    btn.innerHTML = '<i class="fas fa-redo"></i>';
    btn.addEventListener("click", _regenerate);
    meta.appendChild(btn);
}

async function _regenerate() {
    if (!_lastUserMsg || _abort) return;
    const box = document.getElementById("chat-box");
    const botRows = box.querySelectorAll(".bot-row:not(.typing-row)");
    botRows[botRows.length - 1]?.remove();
    document.getElementById("message-input").value = _lastUserMsg.content;
    await sendMessage();
}

// ── Message editing ───────────────────────────────────────────────────────────
async function _editMessage(userRow) {
    const content   = userRow.querySelector(".user-bubble").textContent;
    const msgId     = userRow.dataset.messageId;
    const sessionId = getCurrentSessionId();

    if (sessionId && msgId) {
        try { await api.truncateMessages(sessionId, Number(msgId)); } catch { /* ignore */ }
    }

    const box  = document.getElementById("chat-box");
    const rows = Array.from(box.querySelectorAll(".message-row"));
    rows.slice(rows.indexOf(userRow)).forEach(r => r.remove());

    const input = document.getElementById("message-input");
    input.value = content;
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
    document.getElementById("send-button").disabled = false;
    input.focus();
    _updateContextBadge();
}

// ── Search ────────────────────────────────────────────────────────────────────
export function toggleSearch() {
    const bar   = document.getElementById("search-bar");
    const input = document.getElementById("search-input");
    if (!bar) return;
    const visible = bar.style.display !== "none";
    bar.style.display = visible ? "none" : "flex";
    if (!visible) input.focus();
    else { input.value = ""; _filterMessages(""); }
}

function _filterMessages(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll(".message-row").forEach(row => {
        row.classList.toggle("hidden", q ? !row.textContent.toLowerCase().includes(q) : false);
    });
}

// ── Context badge ─────────────────────────────────────────────────────────────
function _updateContextBadge() {
    let chars = 0;
    document.querySelectorAll(".user-bubble, .bot-bubble").forEach(el => {
        chars += el.textContent.length;
    });
    const tokens = Math.round(chars / 4);
    const badge = document.getElementById("context-badge");
    const span  = document.getElementById("context-tokens");
    if (badge && span) {
        span.textContent = tokens.toLocaleString();
        badge.style.display = tokens > 0 ? "inline-flex" : "none";
    }
}

// ── Scroll FAB ────────────────────────────────────────────────────────────────
function _initScrollFab() {
    const box = document.getElementById("chat-box");
    const fab = document.getElementById("scroll-fab");
    if (!box || !fab) return;
    box.addEventListener("scroll", () => {
        const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 80;
        fab.style.display = atBottom ? "none" : "flex";
    });
    fab.addEventListener("click", () => {
        box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    });
}

// ── Stats dashboard ───────────────────────────────────────────────────────────
export async function showStats() {
    const modal = document.getElementById("stats-modal");
    if (!modal) return;
    modal.classList.add("open");
    try {
        const s = await api.getStats();
        document.getElementById("stat-sessions").textContent   = (s.total_sessions   ?? 0).toLocaleString();
        document.getElementById("stat-messages").textContent   = (s.total_messages   ?? 0).toLocaleString();
        document.getElementById("stat-tokens").textContent     = (s.total_tokens     ?? 0).toLocaleString();
        document.getElementById("stat-prompt").textContent     = (s.prompt_tokens    ?? 0).toLocaleString();
        document.getElementById("stat-completion").textContent = (s.completion_tokens ?? 0).toLocaleString();
    } catch (err) {
        console.error("Stats fetch failed:", err);
    }
}

// ── Presets (stored server-side in SQLite) ────────────────────────────────────
async function _migrateLocalPresets() {
    // One-time migration of presets saved in localStorage by older versions
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem("promptPresets") ?? "[]"); }
    catch { /* corrupt — discard */ }
    if (!legacy.length) { localStorage.removeItem("promptPresets"); return; }
    try {
        for (const p of legacy) {
            if (p?.name && p?.text) await api.createPreset(p.name, p.text);
        }
        localStorage.removeItem("promptPresets");
    } catch { /* keep localStorage copy; retry next open */ }
}

async function _renderPresets(promptTA) {
    const list = document.getElementById("preset-list");
    if (!list) return;
    let presets = [];
    try {
        await _migrateLocalPresets();
        presets = await api.getPresets();
    } catch {
        list.innerHTML = '<p class="no-presets">Could not load presets.</p>';
        return;
    }
    if (!presets.length) {
        list.innerHTML = '<p class="no-presets">No saved presets. Type a prompt above and click Save.</p>';
        return;
    }
    list.innerHTML = "";
    presets.forEach((p) => {
        const chip = document.createElement("div");
        chip.className = "preset-chip";
        chip.title = p.text;
        chip.innerHTML = `<span>${_esc(p.name)}</span><span class="preset-chip-del" title="Delete preset">×</span>`;
        chip.querySelector("span:first-child").addEventListener("click", () => {
            promptTA.value = p.text;
        });
        chip.querySelector(".preset-chip-del").addEventListener("click", async (e) => {
            e.stopPropagation();
            try { await api.deletePreset(p.id); } catch { /* re-render regardless */ }
            _renderPresets(promptTA);
        });
        list.appendChild(chip);
    });
}

function _esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
}

// ── Render messages (from history) ────────────────────────────────────────────
export function renderMessages(messages) {
    const box = document.getElementById("chat-box");
    box.innerHTML = "";
    _lastUserMsg = null;

    if (!messages?.length) {
        box.appendChild(_buildWelcome());
        _updateContextBadge();
        return;
    }

    messages.forEach(({ role, content, token_usage, id, feedback, complete }) => {
        const row = role === "user"
            ? _buildUserRow(content, id)
            : _buildBotRow(content, token_usage, id);

        if (role === "assistant" && complete === 0) _setInterrupted(row);

        if (role === "assistant" && feedback) {
            const btn = row.querySelector(`.feedback-btn[data-val="${feedback}"]`);
            btn?.classList.add(`active-${feedback}`);
        }

        if (role === "user") _lastUserMsg = { content, msgId: id };
        box.appendChild(row);
    });

    _updateRegenerateBtn();
    _updateContextBadge();
    box.scrollTop = box.scrollHeight;
}

// ── Send / Stream ─────────────────────────────────────────────────────────────
function _requestBody(message, sessionId, model) {
    return {
        message,
        session_id:  sessionId,
        model,
        system_prompt: _systemPrompt,
        ..._llmSettings.temperature != null && { temperature: _llmSettings.temperature },
        ..._llmSettings.max_tokens  != null && { max_tokens:  _llmSettings.max_tokens  },
    };
}

export async function sendMessage() {
    const input   = document.getElementById("message-input");
    const message = input.value.trim();
    if (!message || _abort) return;

    let sessionId = getCurrentSessionId();
    if (!sessionId) sessionId = await createAndSwitchSession(_systemPrompt);

    document.getElementById("welcome")?.remove();

    const box     = document.getElementById("chat-box");
    const userRow = _buildUserRow(message);
    box.appendChild(userRow);
    input.value = "";
    input.style.height = "50px";
    _setSending(true);

    const typingRow = _buildTypingIndicator();
    box.appendChild(typingRow);
    box.scrollTop = box.scrollHeight;

    _abort = new AbortController();
    try {
        const primaryModel = getCurrentModel();
        if (_compare.enabled && _compare.model && _compare.model !== primaryModel) {
            await _streamCompare(message, sessionId, box, typingRow, userRow, primaryModel);
        } else {
            await _streamSingle(message, sessionId, box, typingRow, userRow, primaryModel);
        }
    } finally {
        _abort = null;
        _setSending(false);
        box.scrollTop = box.scrollHeight;
    }
}

async function _streamSingle(message, sessionId, box, typingRow, userRow, model) {
    const botRow = _buildBotRow();
    const bubble = botRow.querySelector(".bot-bubble");

    let streamStart = null;
    let firstTokenAt = null;
    let tokenCount = 0;

    try {
        await api.stream(
            _requestBody(message, sessionId, model),
            {
                signal: _abort.signal,

                onStart(userMsgId) {
                    streamStart = Date.now();
                    typingRow.remove();
                    box.appendChild(botRow);
                    if (userMsgId) userRow.dataset.messageId = userMsgId;
                },

                onToken(token) {
                    if (!firstTokenAt) firstTokenAt = Date.now();
                    tokenCount++;
                    appendToken(bubble, token);
                    box.scrollTop = box.scrollHeight;
                },

                onDone(usage, msgId, isFirst) {
                    const elapsed = streamStart ? Date.now() - streamStart : null;
                    const ttft    = firstTokenAt && streamStart ? firstTokenAt - streamStart : null;
                    const tokensPerSec = elapsed && tokenCount
                        ? Math.round(tokenCount / (elapsed / 1000))
                        : null;

                    if (msgId) {
                        botRow.dataset.messageId = msgId;
                        _wireFeedback(botRow, msgId);
                    }
                    _setUsage(botRow, usage);
                    _setTiming(botRow, { ttft, elapsed, tokensPerSec });
                    _lastUserMsg = { content: message, msgId: userRow.dataset.messageId || null };
                    _updateRegenerateBtn();
                    _updateContextBadge();
                    if (isFirst) {
                        api.generateTitle(sessionId, message).catch(() => {});
                        setTimeout(() => renderSessionList(), 2500);
                    }
                },

                onError(err) {
                    typingRow.remove();
                    if (!box.contains(botRow)) box.appendChild(botRow);
                    bubble.textContent = `Error: ${err}`;
                },
            }
        );
    } catch (err) {
        typingRow.remove();
        if (!box.contains(botRow)) box.appendChild(botRow);
        if (err.name === "AbortError") _setInterrupted(botRow);
        else bubble.textContent = "Something went wrong. Please try again.";
    }
}

// ── Compare mode: same prompt, two models side by side ───────────────────────
function _buildCompareRow(primaryModel, compareModel) {
    const short = (m) => _esc((m ?? "default").split("/").pop());
    const row = document.createElement("div");
    row.className = "message-row bot-row compare-row";
    row.innerHTML = `
        <div class="avatar bot-avatar"><i class="fas fa-robot"></i></div>
        <div class="msg-content compare-wrap">
            <div class="compare-col" data-side="primary">
                <div class="compare-col-header">${short(primaryModel)} <span class="compare-tag">saved</span></div>
                <div class="bot-bubble"></div>
                <div class="msg-meta">
                    <span class="token-badge" style="display:none"></span>
                    <span class="timing-badge" style="display:none"></span>
                </div>
            </div>
            <div class="compare-col" data-side="secondary">
                <div class="compare-col-header">${short(compareModel)} <span class="compare-tag muted">not saved</span></div>
                <div class="bot-bubble"></div>
                <div class="msg-meta">
                    <span class="token-badge" style="display:none"></span>
                    <span class="timing-badge" style="display:none"></span>
                </div>
            </div>
        </div>`;
    return row;
}

async function _streamCompare(message, sessionId, box, typingRow, userRow, primaryModel) {
    const row = _buildCompareRow(primaryModel, _compare.model);
    let placed = false;
    const place = () => {
        if (placed) return;
        placed = true;
        typingRow.remove();
        box.appendChild(row);
    };

    const runSide = (side, body, onDoneExtra) => {
        const col    = row.querySelector(`.compare-col[data-side="${side}"]`);
        const bubble = col.querySelector(".bot-bubble");
        let start = null, firstTokenAt = null, tokenCount = 0;
        return api.stream(body, {
            signal: _abort.signal,
            onStart(userMsgId) {
                start = Date.now();
                place();
                if (side === "primary" && userMsgId) userRow.dataset.messageId = userMsgId;
            },
            onToken(token) {
                if (!firstTokenAt) firstTokenAt = Date.now();
                tokenCount++;
                appendToken(bubble, token);
                box.scrollTop = box.scrollHeight;
            },
            onDone(usage, msgId, isFirst) {
                const elapsed = start ? Date.now() - start : null;
                const ttft    = firstTokenAt && start ? firstTokenAt - start : null;
                const tokensPerSec = elapsed && tokenCount ? Math.round(tokenCount / (elapsed / 1000)) : null;
                _setUsage(col, usage);
                _setTiming(col, { ttft, elapsed, tokensPerSec });
                onDoneExtra?.(msgId, isFirst);
            },
            onError(err) {
                place();
                bubble.textContent = `Error: ${err}`;
            },
        });
    };

    // The primary request persists the exchange; the secondary runs with the
    // same session context but save:false, so history stays single-threaded.
    const primary = runSide("primary", _requestBody(message, sessionId, primaryModel), (msgId, isFirst) => {
        _lastUserMsg = { content: message, msgId: userRow.dataset.messageId || null };
        _updateRegenerateBtn();
        _updateContextBadge();
        if (isFirst) {
            api.generateTitle(sessionId, message).catch(() => {});
            setTimeout(() => renderSessionList(), 2500);
        }
    });
    const secondary = runSide("secondary", { ..._requestBody(message, sessionId, _compare.model), save: false });

    const results = await Promise.allSettled([primary, secondary]);
    typingRow.remove();
    const aborted = results.some(r => r.status === "rejected" && r.reason?.name === "AbortError");
    if (aborted && placed) _setInterrupted(row);
    if (!placed && results.every(r => r.status === "rejected")) {
        box.appendChild(row);
        row.querySelectorAll(".bot-bubble").forEach(b => { b.textContent = "Something went wrong. Please try again."; });
    }
}

function _setSending(on) {
    document.getElementById("send-button").style.display = on ? "none" : "flex";
    document.getElementById("stop-button").style.display = on ? "flex" : "none";
    document.getElementById("send-button").disabled = !document.getElementById("message-input").value.trim();
}

// ── Resizable sidebar ─────────────────────────────────────────────────────────
function _initSidebarResize() {
    const sidebar = document.getElementById("sidebar");
    const handle  = document.getElementById("sidebar-resize-handle");
    if (!sidebar || !handle) return;

    const saved = localStorage.getItem("sidebarWidth");
    if (saved) sidebar.style.width = saved;

    let startX, startW;
    handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        startX = e.clientX;
        startW = sidebar.offsetWidth;
        handle.classList.add("dragging");
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp, { once: true });
    });

    function onMove(e) {
        const w = Math.min(500, Math.max(180, startW + (e.clientX - startX)));
        sidebar.style.width = w + "px";
    }
    function onUp() {
        handle.classList.remove("dragging");
        localStorage.setItem("sidebarWidth", sidebar.style.width);
        document.removeEventListener("mousemove", onMove);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initChat() {
    const input       = document.getElementById("message-input");
    const sendBtn     = document.getElementById("send-button");
    const stopBtn     = document.getElementById("stop-button");
    const clearBtn    = document.getElementById("clear-chat");
    const themeBtn    = document.getElementById("theme-toggle");
    const promptBtn   = document.getElementById("prompt-btn");
    const modal       = document.getElementById("prompt-modal");
    const promptTA    = document.getElementById("system-prompt-input");
    const saveBtn     = document.getElementById("prompt-save");
    const closeBtn    = document.getElementById("prompt-close");
    const searchBtn   = document.getElementById("search-btn");
    const searchInput = document.getElementById("search-input");
    const searchClose = document.getElementById("search-close");
    const statsBtn    = document.getElementById("stats-btn");
    const statsClose  = document.getElementById("stats-close");
    const statsModal  = document.getElementById("stats-modal");
    const sidebarToggle  = document.getElementById("sidebar-toggle");
    const savePresetBtn  = document.getElementById("save-preset-btn");
    const settingsBtn    = document.getElementById("settings-btn");
    const settingsModal  = document.getElementById("settings-modal");
    const settingsClose  = document.getElementById("settings-close");
    const settingsSave   = document.getElementById("settings-save");
    const settingsReset  = document.getElementById("settings-reset");
    const tempInput      = document.getElementById("temperature-input");
    const tempDisplay    = document.getElementById("temp-display");
    const maxTokInput    = document.getElementById("max-tokens-input");

    // ── Dark mode ─────────────────────────────────────────────────────────────
    if (localStorage.getItem("darkMode") === "true") {
        document.body.classList.add("dark-mode");
        themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
    themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        const dark = document.body.classList.contains("dark-mode");
        localStorage.setItem("darkMode", dark);
        themeBtn.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });

    // ── Input auto-resize ─────────────────────────────────────────────────────
    input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
        sendBtn.disabled = !input.value.trim();
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    sendBtn.addEventListener("click", sendMessage);
    stopBtn.addEventListener("click", () => _abort?.abort());

    // ── Clear ─────────────────────────────────────────────────────────────────
    clearBtn.addEventListener("click", () => {
        const box = document.getElementById("chat-box");
        box.innerHTML = "";
        box.appendChild(_buildWelcome());
        _lastUserMsg = null;
        _updateContextBadge();
    });

    // ── System prompt modal ───────────────────────────────────────────────────
    promptBtn.addEventListener("click", () => {
        promptTA.value = _systemPrompt ?? "";
        _renderPresets(promptTA);
        modal.classList.add("open");
    });
    closeBtn.addEventListener("click",  () => modal.classList.remove("open"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
    saveBtn.addEventListener("click", async () => {
        _systemPrompt = promptTA.value.trim() || null;
        modal.classList.remove("open");
        const sid = getCurrentSessionId();
        if (sid) await updateSessionSystemPrompt(sid, _systemPrompt);
    });

    // ── Presets ───────────────────────────────────────────────────────────────
    savePresetBtn?.addEventListener("click", async () => {
        const text = promptTA.value.trim();
        if (!text) return;
        const name = prompt("Name this preset (shown as label):") || text.slice(0, 30);
        try {
            await api.createPreset(name, text);
        } catch {
            window.__showToast?.("Could not save preset.", "error");
        }
        _renderPresets(promptTA);
    });

    // ── Settings modal ────────────────────────────────────────────────────────
    const compareEnabled = document.getElementById("compare-enabled");
    const compareSelect  = document.getElementById("compare-model-select");

    const _restoreSettings = () => {
        const saved = JSON.parse(localStorage.getItem("llmSettings") || "{}");
        _llmSettings = { temperature: saved.temperature ?? null, max_tokens: saved.max_tokens ?? null };
        _compare = JSON.parse(localStorage.getItem("compareSettings") || '{"enabled":false,"model":null}');
        if (tempInput) tempInput.value = _llmSettings.temperature ?? 1.0;
        if (tempDisplay) tempDisplay.textContent = (tempInput?.value ?? "1.0");
        if (maxTokInput) maxTokInput.value = _llmSettings.max_tokens ?? "";
        if (compareEnabled) compareEnabled.checked = !!_compare.enabled;
        if (compareSelect)  compareSelect.disabled = !_compare.enabled;
    };
    _restoreSettings();

    const _populateCompareModels = async () => {
        if (!compareSelect) return;
        try {
            const { models } = await api.getModels();
            compareSelect.innerHTML = "";
            models.forEach((id) => {
                const opt = document.createElement("option");
                opt.value = id;
                opt.textContent = id.split("/").pop();
                opt.title = id;
                if (id === _compare.model) opt.selected = true;
                compareSelect.appendChild(opt);
            });
        } catch {
            compareSelect.innerHTML = "<option value=''>No models found</option>";
        }
    };

    compareEnabled?.addEventListener("change", () => {
        if (compareSelect) compareSelect.disabled = !compareEnabled.checked;
    });

    tempInput?.addEventListener("input", () => {
        if (tempDisplay) tempDisplay.textContent = tempInput.value;
    });

    settingsBtn?.addEventListener("click", () => {
        _populateCompareModels();
        settingsModal?.classList.add("open");
    });
    settingsClose?.addEventListener("click", () => settingsModal?.classList.remove("open"));
    settingsModal?.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.remove("open"); });
    settingsSave?.addEventListener("click", () => {
        const t = parseFloat(tempInput?.value);
        const m = parseInt(maxTokInput?.value, 10);
        _llmSettings = {
            temperature: isNaN(t) ? null : t,
            max_tokens:  isNaN(m) || !maxTokInput?.value ? null : m,
        };
        _compare = {
            enabled: !!compareEnabled?.checked && !!compareSelect?.value,
            model:   compareSelect?.value || null,
        };
        localStorage.setItem("llmSettings", JSON.stringify(_llmSettings));
        localStorage.setItem("compareSettings", JSON.stringify(_compare));
        settingsModal?.classList.remove("open");
        window.__showToast?.("Settings applied.", "success");
    });
    settingsReset?.addEventListener("click", () => {
        _llmSettings = { temperature: null, max_tokens: null };
        _compare = { enabled: false, model: null };
        localStorage.removeItem("llmSettings");
        localStorage.removeItem("compareSettings");
        if (tempInput)   tempInput.value = "1.0";
        if (tempDisplay) tempDisplay.textContent = "1.0";
        if (maxTokInput) maxTokInput.value = "";
        if (compareEnabled) compareEnabled.checked = false;
        if (compareSelect)  compareSelect.disabled = true;
        settingsModal?.classList.remove("open");
        window.__showToast?.("Settings reset to defaults.", "info");
    });

    // ── File attachments ──────────────────────────────────────────────────────
    const attachBtn   = document.getElementById("attach-button");
    const attachInput = document.getElementById("attach-file-input");
    attachBtn?.addEventListener("click", () => attachInput?.click());
    attachInput?.addEventListener("change", async () => {
        const file = attachInput.files?.[0];
        if (!file) return;
        attachInput.value = "";
        if (file.size > 512 * 1024) {
            window.__showToast?.("File too large (max 512 KB).", "error");
            return;
        }
        try {
            const text = await file.text();
            const ext = file.name.split(".").pop().toLowerCase();
            const block = `\n\n\`\`\`${ext}\n// ${file.name}\n${text}\n\`\`\`\n`;
            input.value = (input.value + block).trimStart();
            input.style.height = "auto";
            input.style.height = input.scrollHeight + "px";
            sendBtn.disabled = !input.value.trim();
            input.focus();
            window.__showToast?.(`Attached ${file.name}.`, "success");
        } catch {
            window.__showToast?.("Could not read that file.", "error");
        }
    });

    // ── Search ────────────────────────────────────────────────────────────────
    searchBtn?.addEventListener("click", toggleSearch);
    searchClose?.addEventListener("click", () => {
        document.getElementById("search-bar").style.display = "none";
        if (searchInput) { searchInput.value = ""; _filterMessages(""); }
    });
    searchInput?.addEventListener("input", (e) => _filterMessages(e.target.value));

    // ── Stats modal ───────────────────────────────────────────────────────────
    statsBtn?.addEventListener("click",  showStats);
    statsClose?.addEventListener("click", () => statsModal?.classList.remove("open"));
    statsModal?.addEventListener("click", (e) => { if (e.target === statsModal) statsModal.classList.remove("open"); });

    // ── Sidebar toggle (mobile) ───────────────────────────────────────────────
    sidebarToggle?.addEventListener("click", () => {
        document.querySelector(".sidebar")?.classList.toggle("open");
    });

    // ── Scroll-to-bottom FAB ──────────────────────────────────────────────────
    _initScrollFab();

    // ── Resizable sidebar ─────────────────────────────────────────────────────
    _initSidebarResize();

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key === "k") { e.preventDefault(); document.getElementById("new-chat-btn")?.click(); }
        if (mod && e.key === "l") { e.preventDefault(); clearBtn?.click(); }
        if (mod && e.key === "/") { e.preventDefault(); sidebarToggle?.click(); }
        if (mod && e.key === "f") { e.preventDefault(); toggleSearch(); }
        if (e.key === "Escape") {
            if (_abort) { _abort.abort(); return; }
            if (modal?.classList.contains("open"))         { modal.classList.remove("open"); return; }
            if (statsModal?.classList.contains("open"))    { statsModal.classList.remove("open"); return; }
            if (settingsModal?.classList.contains("open")) { settingsModal.classList.remove("open"); return; }
            const bar = document.getElementById("search-bar");
            if (bar?.style.display !== "none") {
                bar.style.display = "none";
                if (searchInput) { searchInput.value = ""; _filterMessages(""); }
            }
        }
    });

    // ── Initial welcome screen ────────────────────────────────────────────────
    renderMessages([]);
}
