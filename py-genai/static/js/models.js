import { api } from "./api.js";

let _current = null;
const _listeners = [];

export function getCurrentModel() {
    return _current ?? localStorage.getItem("selectedModel") ?? null;
}

export function onModelChange(cb) {
    _listeners.push(cb);
}

export async function initModelSelector(selectEl) {
    try {
        const { models, current } = await api.getModels();
        _current = localStorage.getItem("selectedModel") ?? current;

        selectEl.innerHTML = "";
        models.forEach((id) => {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = id.split("/").pop();
            opt.title = id;
            if (id === _current) opt.selected = true;
            selectEl.appendChild(opt);
        });

        if (!selectEl.value && models.length) {
            _current = models[0];
            selectEl.value = _current;
        }

        selectEl.addEventListener("change", () => {
            _current = selectEl.value;
            localStorage.setItem("selectedModel", _current);
            _listeners.forEach((cb) => cb(_current));
        });
    } catch {
        selectEl.innerHTML = "<option>Default model</option>";
    }
}
