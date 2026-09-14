const CACHE = "sperrkreis98-v7";
const FILES = [
  "./", "./index.html", "./style.css", "./manifest.webmanifest", "./assets/icon.svg",
  "./src/main.js", "./src/game.js", "./src/input.js", "./src/render.js", "./src/ui.js",
  "./src/world.js", "./src/config.js", "./src/data.js", "./src/util.js",
  "./src/navigation.js", "./src/perception.js", "./src/character.js", "./src/missions.js",
  "./src/inventory.js", "./src/ai.js", "./src/combat.js", "./src/stealth.js", "./src/save.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(hit => hit || caches.match("./index.html"))));
});
