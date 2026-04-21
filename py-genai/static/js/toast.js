export function showToast(message, type = "error", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast-visible"));

    const remove = () => {
        toast.classList.remove("toast-visible");
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    };

    const timer = setTimeout(remove, duration);
    toast.addEventListener("click", () => { clearTimeout(timer); remove(); });
}
