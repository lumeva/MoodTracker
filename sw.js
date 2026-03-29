const CACHE_NAME = "mood-tracker-cache-v3";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];

const NETWORK_FIRST_ASSET_SUFFIXES = [
  "/index.html",
  "/styles.css",
  "/data.js",
  "/app.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key)))
    ))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (shouldUseNetworkFirst(event.request, url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

function shouldUseNetworkFirst(request, url) {
  if (request.mode === "navigate") return true;

  if (url.pathname === "/" || /\/MoodTracker\/?$/.test(url.pathname)) {
    return true;
  }

  return NETWORK_FIRST_ASSET_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix));
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));

        if (request.mode === "navigate") {
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", response.clone()));
        }
      }

      return response;
    })
    .catch(() => {
      return caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return Promise.reject(new Error("No cached response available"));
      });
    });
}
