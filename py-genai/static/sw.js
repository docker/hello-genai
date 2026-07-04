// Hello-GenAI service worker — caches the app shell for offline/instant loads.
// Bump CACHE when shipping changed static assets to invalidate old copies.
const CACHE = "hello-genai-v1";

const SHELL = [
    "/",
    "/static/css/style.css",
    "/static/js/main.js",
    "/static/js/api.js",
    "/static/js/chat.js",
    "/static/js/sessions.js",
    "/static/js/models.js",
    "/static/js/markdown.js",
    "/static/js/export.js",
    "/static/js/toast.js",
    "/static/vendor/marked.min.js",
    "/static/vendor/purify.min.js",
    "/static/vendor/highlight/highlight.min.js",
    "/static/vendor/highlight/styles/github.min.css",
    "/static/vendor/highlight/styles/github-dark.min.css",
    "/static/vendor/fontawesome/css/all.min.css",
    "/static/icon.svg",
    "/static/favicon.ico",
    "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    // Never cache dynamic API/health/auth responses — always hit the network.
    if (url.pathname.startsWith("/api/") || url.pathname === "/health" ||
        url.pathname === "/login" || url.pathname === "/logout") {
        return;
    }

    // Cache-first for the static shell; fall back to network and populate cache.
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((resp) => {
                    if (resp.ok && (url.pathname.startsWith("/static/") || url.pathname === "/")) {
                        const copy = resp.clone();
                        caches.open(CACHE).then((cache) => cache.put(request, copy));
                    }
                    return resp;
                })
                .catch(() => cached);
        })
    );
});
