/* B8 — offline shell service worker.
 *
 * Deliberately conservative:
 *  - /api, /ws and /v1 are NEVER cached (auth'd, live data).
 *  - navigations are network-first so a fresh deploy always wins while online,
 *    falling back to the cached shell only when offline. This matters because
 *    index.html names hashed bundles — serving a stale shell would pin the
 *    device to a deleted build.
 *  - /assets/* is content-addressed, so cache-first is safe and instant.
 */
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|ws|v1|docs|openapi\.json)/.test(url.pathname)) return;   // never cache live/auth'd data

  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => { caches.open(SHELL).then((c) => c.put("/", res.clone())); return res; })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(request).then((hit) =>
        hit || fetch(request).then((res) => {
          if (res.ok) caches.open(ASSETS).then((c) => c.put(request, res.clone()));
          return res;
        })
      )
    );
  }
});
