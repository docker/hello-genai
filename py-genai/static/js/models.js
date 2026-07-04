import { api } from "./api.js";

let _current   = null;
let _selectEl  = null;
const _listeners = [];

export function getCurrentModel() {
    return _current ?? localStorage.getItem("selectedModel") ?? null;
}

export function onModelChange(cb) {
    _listeners.push(cb);
}

function _populate(selectEl, models, serverDefault) {
    const stored = localStorage.getItem("selectedModel");
    // Prefer the stored selection if it's still available, then the server's
    // default, then the first model. A previously selected model that has since
    // disappeared from the backend falls through gracefully.
    _current = models.includes(stored)
        ? stored
        : (models.includes(serverDefault) ? serverDefault : (models[0] ?? null));

    selectEl.innerHTML = "";
    models.forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id.split("/").pop();
        opt.title = id;
        if (id === _current) opt.selected = true;
        selectEl.appendChild(opt);
    });

    if (_current) localStorage.setItem("selectedModel", _current);
}

// Re-fetch the live model list and repopulate, keeping the current selection
// when possible. Bypasses the server cache so it reflects the backend right now.
export async function refreshModels({ notify = false } = {}) {
    if (!_selectEl) return;
    try {
        const { models, current, source } = await api.getModels(true);
        if (!models?.length) throw new Error("no models");
        const prev = _current;
        _populate(_selectEl, models, current);
        if (notify) {
            const msg = source === "live"
                ? `${models.length} model${models.length === 1 ? "" : "s"} available`
                : "Backend unreachable — using configured models";
            window.__showToast?.(msg, source === "live" ? "success" : "info");
        }
        if (prev !== _current) _listeners.forEach((cb) => cb(_current));
    } catch {
        if (notify) window.__showToast?.("Could not refresh models.", "error");
    }
}

export async function initModelSelector(selectEl) {
    _selectEl = selectEl;
    try {
        const { models, current } = await api.getModels();
        if (!models?.length) throw new Error("no models");
        _populate(selectEl, models, current);

        selectEl.addEventListener("change", () => {
            _current = selectEl.value;
            localStorage.setItem("selectedModel", _current);
            _listeners.forEach((cb) => cb(_current));
        });
    } catch {
        selectEl.innerHTML = "<option>Default model</option>";
    }
}
