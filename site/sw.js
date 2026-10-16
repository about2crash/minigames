// Minigames service worker: makes the site installable and playable offline.
// Same-origin requests: network first (so updates show up), cache as fallback.
// Google Fonts: cache first. Bump VERSION to drop old caches.
const VERSION = "v1";
const CACHE = `minigames-${VERSION}`;
const CORE = [
  "./",
  "index.html",
  "games.json",
  "shared/theme.css",
  "shared/pwa.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // precache every game listed on the hub
    try {
      const games = await (await fetch("games.json", { cache: "no-store" })).json();
      await cache.addAll(games.flatMap((g) => [g.url, `${g.url}index.html`]));
    } catch {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === "navigate" ? await cache.match("index.html") : undefined)
        || Response.error();
    }
  })());
});
