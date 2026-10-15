// Source template. Build ID and complete asset list are generated automatically.
const BUILD_ID = "bb3d870243e51590340e";
const FILES = [
  "./assets/icon.svg",
  "./assets/zombies/0-alert.png",
  "./assets/zombies/0-attack_left.png",
  "./assets/zombies/0-attack_right.png",
  "./assets/zombies/0-rest.png",
  "./assets/zombies/0-run.png",
  "./assets/zombies/0-shuffle.png",
  "./assets/zombies/0-walk.png",
  "./assets/zombies/1-alert.png",
  "./assets/zombies/1-attack_left.png",
  "./assets/zombies/1-attack_right.png",
  "./assets/zombies/1-rest.png",
  "./assets/zombies/1-run.png",
  "./assets/zombies/1-shuffle.png",
  "./assets/zombies/1-walk.png",
  "./assets/zombies/2-alert.png",
  "./assets/zombies/2-attack_left.png",
  "./assets/zombies/2-attack_right.png",
  "./assets/zombies/2-rest.png",
  "./assets/zombies/2-run.png",
  "./assets/zombies/2-shuffle.png",
  "./assets/zombies/2-walk.png",
  "./assets/zombies/3-alert.png",
  "./assets/zombies/3-attack_left.png",
  "./assets/zombies/3-attack_right.png",
  "./assets/zombies/3-rest.png",
  "./assets/zombies/3-run.png",
  "./assets/zombies/3-shuffle.png",
  "./assets/zombies/3-walk.png",
  "./assets/zombies/4-alert.png",
  "./assets/zombies/4-attack_left.png",
  "./assets/zombies/4-attack_right.png",
  "./assets/zombies/4-rest.png",
  "./assets/zombies/4-run.png",
  "./assets/zombies/4-shuffle.png",
  "./assets/zombies/4-walk.png",
  "./assets/zombies/5-alert.png",
  "./assets/zombies/5-attack_left.png",
  "./assets/zombies/5-attack_right.png",
  "./assets/zombies/5-rest.png",
  "./assets/zombies/5-run.png",
  "./assets/zombies/5-shuffle.png",
  "./assets/zombies/5-walk.png",
  "./assets/zombies/6-alert.png",
  "./assets/zombies/6-attack_left.png",
  "./assets/zombies/6-attack_right.png",
  "./assets/zombies/6-rest.png",
  "./assets/zombies/6-run.png",
  "./assets/zombies/6-shuffle.png",
  "./assets/zombies/6-walk.png",
  "./assets/zombies/7-alert.png",
  "./assets/zombies/7-attack_left.png",
  "./assets/zombies/7-attack_right.png",
  "./assets/zombies/7-rest.png",
  "./assets/zombies/7-run.png",
  "./assets/zombies/7-shuffle.png",
  "./assets/zombies/7-walk.png",
  "./assets/zombies/8-alert.png",
  "./assets/zombies/8-attack_left.png",
  "./assets/zombies/8-attack_right.png",
  "./assets/zombies/8-rest.png",
  "./assets/zombies/8-run.png",
  "./assets/zombies/8-shuffle.png",
  "./assets/zombies/8-walk.png",
  "./assets/zombies/9-alert.png",
  "./assets/zombies/9-attack_left.png",
  "./assets/zombies/9-attack_right.png",
  "./assets/zombies/9-rest.png",
  "./assets/zombies/9-run.png",
  "./assets/zombies/9-shuffle.png",
  "./assets/zombies/9-walk.png",
  "./assets/zombies/README.md",
  "./assets/zombies/atlas.json",
  "./build/main-HVMMF7NC.js",
  "./build/style-KUDVED4H.css",
  "./index.html",
  "./manifest.webmanifest"
];
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
