// Minimal service worker — mainly here to satisfy PWA installability
// requirements (Chrome/Android require a registered SW with a fetch handler
// before showing an install prompt). Caches the app shell so it also opens
// offline; everything else (your food/avoid/body data) lives in
// localStorage/IndexedDB via the sync flow already in app.js, not here.

const CACHE_NAME = "nutriwise-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./sync.js",
  "./manifest.json",
  "./icon192.png",
  "./icon512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {}) // don't block install if an icon path etc. is missing
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for everything, so updated app.js / index.html / sync.js always
// arrive when you're online; the cache is only a fallback for offline use.
// Supabase (sync) requests are never cached.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).hostname.endsWith("supabase.co")) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || (event.request.mode === "navigate" ? caches.match("./index.html") : undefined)
        )
      )
  );
});
