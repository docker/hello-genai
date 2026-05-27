function _highlight(code, lang) {
    if (typeof hljs === "undefined") return code;
    const language = hljs.getLanguage(lang) ? lang : "plaintext";
    return hljs.highlight(code, { language }).value;
}

function _buildRenderer() {
    if (typeof marked === "undefined") return null;
    const renderer = new marked.Renderer();
    renderer.code = (code, lang) => {
        const safeLang    = lang || "plaintext";
        const highlighted = _highlight(code, safeLang);
        const label       = safeLang !== "plaintext" ? `<span class="code-lang">${safeLang}</span>` : "";
        return `
<pre>
  <div class="code-header">
    ${label}
    <button class="copy-btn" title="Copy"><i class="fas fa-copy"></i></button>
  </div>
  <code class="hljs language-${safeLang}">${highlighted}</code>
</pre>`.trim();
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

function _wireCopyButtons(container) {
    container.querySelectorAll("pre .copy-btn").forEach((btn) => {
        if (btn.dataset.wired) return;
        btn.dataset.wired = "1";
        btn.addEventListener("click", () => {
            const code = btn.closest("pre")?.querySelector("code");
            navigator.clipboard.writeText(code?.innerText ?? "").then(() => {
                btn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
            });
        });
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
    _wireCopyButtons(element);
}

export function appendToken(element, token) {
    element._raw = (element._raw ?? "") + token;
    element.innerHTML = renderMarkdown(element._raw);
    _fixLinks(element);
    _wireCopyButtons(element);
}
