// Source template. Build ID and complete asset list are generated automatically.
const BUILD_ID = "{{BUILD_ID}}";
const FILES = /* PRECACHE_FILES */ [];
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `sperrkreis98-${encodeURIComponent(new URL(SCOPE).pathname)}-`;
const CACHE = `${CACHE_PREFIX}${BUILD_ID}`;
const INDEX = new URL("./index.html", SCOPE).href;
const ASSETS = new Set(FILES.map(file => new URL(file, SCOPE).href));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES.map(file => new Request(new URL(file, SCOPE), { cache: "reload" })));
      const index = await cache.match(INDEX);
      if (!(await index.text()).includes(`name="sperrkreis-build" content="${BUILD_ID}"`)) {
        throw new Error("Deployment changed while installing the offline game");
      }
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    // Allow an existing game session to finish with its complete previous cache.
    // The new worker activates normally after those pages are closed.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE &&
      (name.startsWith(CACHE_PREFIX) || /^sperrkreis98-v\d/.test(name)))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== new URL(SCOPE).origin || !url.href.startsWith(SCOPE)) return;
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch (_) { /* Use the complete installed release when offline. */ }
      return (await caches.open(CACHE)).match(INDEX);
    })());
  } else if (ASSETS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(event.request) || fetch(event.request);
    })());
  }
  // Unknown scripts, APIs and third-party resources keep their normal fetch behavior.
  // In particular, never return the HTML shell for a missing JS/image request.
});
