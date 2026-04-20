function _highlight(code, lang) {
    if (typeof hljs === "undefined") return code;
    const language = hljs.getLanguage(lang) ? lang : "plaintext";
    return hljs.highlight(code, { language }).value;
}

function _buildRenderer() {
    if (typeof marked === "undefined") return null;
    const renderer = new marked.Renderer();
    renderer.code = (code, lang) => {
        const highlighted = _highlight(code, lang || "plaintext");
        return `<pre><code class="hljs language-${lang || "plaintext"}">${highlighted}</code></pre>`;
    };
    return renderer;
}

export function renderMarkdown(text) {
    if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
        const div = document.createElement("div");
        div.textContent = text;
        return `<pre>${div.innerHTML}</pre>`;
    }
    const renderer = _buildRenderer();
    const html = marked.parse(text, { renderer, breaks: true, gfm: true });
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ["target", "rel"] });
}

function _addCopyButtons(container) {
    container.querySelectorAll("pre").forEach((pre) => {
        if (pre.querySelector(".copy-btn")) return;
        const btn = document.createElement("button");
        btn.className = "copy-btn";
        btn.title = "Copy";
        btn.innerHTML = '<i class="fas fa-copy"></i>';
        btn.addEventListener("click", () => {
            const code = pre.querySelector("code");
            navigator.clipboard.writeText(code?.innerText ?? "").then(() => {
                btn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
            });
        });
        pre.appendChild(btn);
    });
}

function _fixLinks(container) {
    container.querySelectorAll("a[href]").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
    });
}

export function applyMarkdown(element, text) {
    element.innerHTML = renderMarkdown(text);
    _fixLinks(element);
    _addCopyButtons(element);
}

export function appendToken(element, token) {
    element._raw = (element._raw ?? "") + token;
    element.innerHTML = renderMarkdown(element._raw);
    _fixLinks(element);
    _addCopyButtons(element);
}
