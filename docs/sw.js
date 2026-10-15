// Source template. Build ID and complete asset list are generated automatically.
const BUILD_ID = "109cccad6329397af271";
const FILES = [
  "./assets/icon.svg",
  "./assets/reference-scale.json",
  "./assets/scale-reference/README.md",
  "./assets/scale-reference/front.png",
  "./assets/scale-reference/index.html",
  "./assets/scale-reference/isometric.png",
  "./assets/zombies/0-alert-c1618ea0ce.png",
  "./assets/zombies/0-attack_left-559502c9f8.png",
  "./assets/zombies/0-attack_right-ebfcb6b458.png",
  "./assets/zombies/0-rest-ae9524392f.png",
  "./assets/zombies/0-shuffle-8bc195f6b0.png",
  "./assets/zombies/0-walk-cbb4811e97.png",
  "./assets/zombies/1-alert-20b829214f.png",
  "./assets/zombies/1-attack_left-8f8d8121fd.png",
  "./assets/zombies/1-attack_right-a1cf54f7a4.png",
  "./assets/zombies/1-rest-55e1c854db.png",
  "./assets/zombies/1-shuffle-1f53c1442d.png",
  "./assets/zombies/1-walk-8112604bdf.png",
  "./assets/zombies/2-alert-7e172de3ff.png",
  "./assets/zombies/2-attack_left-cf0b51fe1f.png",
  "./assets/zombies/2-attack_right-81fed63ec9.png",
  "./assets/zombies/2-rest-dc6c1b9277.png",
  "./assets/zombies/2-shuffle-6769e56481.png",
  "./assets/zombies/2-walk-6a9a167cbd.png",
  "./assets/zombies/3-alert-a9c3d36200.png",
  "./assets/zombies/3-attack_left-cd33716a74.png",
  "./assets/zombies/3-attack_right-bd6701da3f.png",
  "./assets/zombies/3-rest-c8718661c7.png",
  "./assets/zombies/3-shuffle-f930908369.png",
  "./assets/zombies/3-walk-f853f6459d.png",
  "./assets/zombies/4-alert-7e6e55fc30.png",
  "./assets/zombies/4-attack_left-82f6eb82fe.png",
  "./assets/zombies/4-attack_right-688d56db0e.png",
  "./assets/zombies/4-rest-eac2cbd576.png",
  "./assets/zombies/4-shuffle-e35ab39e15.png",
  "./assets/zombies/4-walk-f423dfb999.png",
  "./assets/zombies/5-alert-2b2bb4addb.png",
  "./assets/zombies/5-attack_left-3454b4711b.png",
  "./assets/zombies/5-attack_right-fd4c2ef7d4.png",
  "./assets/zombies/5-rest-7c8f037384.png",
  "./assets/zombies/5-shuffle-b175a61ca8.png",
  "./assets/zombies/5-walk-45c05f0ce8.png",
  "./assets/zombies/6-alert-1cca13fbf4.png",
  "./assets/zombies/6-attack_left-4a25ea2193.png",
  "./assets/zombies/6-attack_right-4abe49daec.png",
  "./assets/zombies/6-rest-e0063f002e.png",
  "./assets/zombies/6-shuffle-bf86763500.png",
  "./assets/zombies/6-walk-48a18c3f40.png",
  "./assets/zombies/7-alert-bf3d6b8d80.png",
  "./assets/zombies/7-attack_left-6b5d8ff668.png",
  "./assets/zombies/7-attack_right-cbb69d8c42.png",
  "./assets/zombies/7-rest-6c128962f1.png",
  "./assets/zombies/7-shuffle-7d69a654a7.png",
  "./assets/zombies/7-walk-b762db2ac3.png",
  "./assets/zombies/8-alert-c088648705.png",
  "./assets/zombies/8-attack_left-6906abb8c7.png",
  "./assets/zombies/8-attack_right-688cb5ed01.png",
  "./assets/zombies/8-rest-59446aee1e.png",
  "./assets/zombies/8-shuffle-7526713446.png",
  "./assets/zombies/8-walk-f6fc83e7c6.png",
  "./assets/zombies/9-alert-46811fcf26.png",
  "./assets/zombies/9-attack_left-8b067b325c.png",
  "./assets/zombies/9-attack_right-797411de6e.png",
  "./assets/zombies/9-rest-2952f3ffb3.png",
  "./assets/zombies/9-shuffle-5b2263c6b2.png",
  "./assets/zombies/9-walk-7fc76aa3ac.png",
  "./assets/zombies/README.md",
  "./assets/zombies/atlas.json",
  "./assets/zombies3d/0-b158a3405843.glb.gz",
  "./assets/zombies3d/1-ce2c8af9b00e.glb.gz",
  "./assets/zombies3d/2-9846cce658dd.glb.gz",
  "./assets/zombies3d/3-f1388b86c014.glb.gz",
  "./assets/zombies3d/4-60fbfb8161b5.glb.gz",
  "./assets/zombies3d/5-f85a870d3c92.glb.gz",
  "./assets/zombies3d/6-050a62669016.glb.gz",
  "./assets/zombies3d/7-f328f1706032.glb.gz",
  "./assets/zombies3d/8-d67b22687f25.glb.gz",
  "./assets/zombies3d/9-16ba30b95daf.glb.gz",
  "./assets/zombies3d/README.md",
  "./assets/zombies3d/THREE-LICENSE.txt",
  "./assets/zombies3d/models.json",
  "./build/main-QQ6UTFEZ.js",
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
