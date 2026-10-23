import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {WEAPON_TYPES} from '../docs/src/animation-document.js';
import { ROOT, compileRelease, writeRelease, checkRelease } from "../scripts/build.mjs";

const release = await compileRelease();
const repeated = await compileRelease();
assert.equal(release.id, repeated.id, "builds are reproducible without timestamps or manual versions");
for (const [name, bytes] of release.outputs) assert.ok(bytes.equals(repeated.outputs.get(name)), name);
const html = release.outputs.get("index.html").toString();
assert.ok(html.includes(`src="${release.script}"`));
assert.ok(html.includes(`href="${release.style}"`));
assert.ok(!html.includes("?v="));
for (const scope of ["https://example.org/", "https://example.org/Game-Test/"]) {
  for (const name of release.precache) assert.ok(new URL(name, scope).href.startsWith(scope));
}
for (const name of release.precache) {
  assert.ok(release.outputs.has(name) || (await readFile(path.join(ROOT, "docs", name))).length > 0, name);
}

const temporary = await mkdtemp(path.join(os.tmpdir(), "sperrkreis-build-"));
try {
  await symlink(path.join(ROOT, "node_modules"), path.join(temporary, "node_modules"), "junction");
  await mkdir(path.join(temporary, "docs"));
  for (const name of ["src", "assets", "style.css", "manifest.webmanifest"]) {
    await cp(path.join(ROOT, "docs", name), path.join(temporary, "docs", name), { recursive: true });
  }
  await cp(path.join(ROOT, "web"), path.join(temporary, "web"), { recursive: true });
  const dataFile = path.join(temporary, "docs/src/data.js");
  const data = await readFile(dataFile, "utf8");
  await writeFile(dataFile, data.replace('melee("Küchenmesser"', 'melee("Testmesser"'));
  const changed = await compileRelease(temporary);
  assert.notEqual(changed.script, release.script, "a data change invalidates the game bundle");
  assert.equal(changed.style, release.style, "unchanged CSS keeps its URL");
  assert.notEqual(changed.id, release.id, "cache identity follows the actual build");
  assert.equal(await readFile(path.join(temporary, "docs/src/main.js"), "utf8"),
    await readFile(path.join(ROOT, "docs/src/main.js"), "utf8"), "entry source requires no version edit");
  await writeRelease(temporary, changed);
  assert.deepEqual(await checkRelease(temporary), []);
  // Exercise the emitted shared chunk's real HTTP loader, GLTF parser and
  // controller. Source mocks cannot detect asset paths broken by code splitting.
  const chunk=[...changed.outputs.keys()].find(name=>/^build\/chunks\/chunk-.*\.js$/.test(name));
  assert.ok(chunk,'the production graph contains shared code below build/chunks');
  const runtime=await import(pathToFileURL(path.join(temporary,'docs',chunk)).href);
  const exported=name=>{const value=Object.values(runtime).find(value=>value?.name===name);assert.ok(value,name);return value;};
  const Models=exported('PlayerModels'),loadAsset=exported('loadModelAsset'),createPlayer=exported('createPlayer');
  const createItem=exported('createItem'),addItem=exported('addItem'),equipItem=exported('equipItem');
  const requests=[];
  const server=createServer(async(request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;requests.push(pathname);
    const relative=pathname.replace(/^\/Game-Test\//,'/').slice(1);
    if(!changed.precache.includes(relative)){response.writeHead(404);response.end();return;}
    try{response.end(await readFile(path.join(temporary,'docs',relative)));}catch{response.writeHead(404);response.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const oldDocument=globalThis.document;
  try{
    for(const prefix of ['/','/Game-Test/']){
      globalThis.document={baseURI:`http://127.0.0.1:${server.address().port}${prefix}`};
      const assets=new QuaterniusAssets({loadAsset}),models=new Models({},assets);await models.ready;
      for(const sex of ['male','female'])for(const type of WEAPON_TYPES){
        const player=createPlayer({appearance:{sex}}),item=createItem(type,1,{loadedRounds:3,rounds:3});
        addItem(player,item);equipItem(player,item.id);await models.weapons.request(type);
        player.combat.enabled=true;player.combat.targetId='build-test';player.combat.aim=1;
        const entity=models.prepare(player,1);assert.ok(entity?.weapon,`${prefix} ${sex} ${type}: emitted build attaches the original weapon`);
        assert.equal(entity.animationOwners.right,'Waffenhaltung');
        const muzzle=models.shotMuzzle(player,1);assert.ok(muzzle&&[muzzle.x,muzzle.y,muzzle.height].every(Number.isFinite));
        models.release(entity);models.entities.delete(player);
      }
      for(const type of WEAPON_TYPES){
        const asset=models.weapons.entry(type).asset;assert.ok(asset);assert.ok(asset.scene.children.length);
      }
    }
    assert.ok(requests.some(path=>path.startsWith('/assets/weapons/')));
    assert.ok(requests.some(path=>path.startsWith('/Game-Test/assets/weapons/')));
    assert.ok(requests.every(path=>!path.includes('/build/assets/')),'runtime URLs match the precached public asset tree');
  }finally{globalThis.document=oldDocument;await new Promise(resolve=>server.close(resolve));}
  await writeFile(path.join(temporary, "docs/build/stale.js"), "obsolete");
  assert.ok((await checkRelease(temporary)).some(name => name.includes("stale.js")));
  await writeRelease(temporary, changed);
  assert.ok(!(await readdir(path.join(temporary, "docs/build"))).includes("stale.js"));
  await writeFile(path.join(temporary, "docs/src/future.js"), "export const ready = true;\n");
  const mainFile = path.join(temporary, "docs/src/main.js");
  await writeFile(mainFile, (await readFile(mainFile, "utf8")) +
    '\nglobalThis.loadFutureModule = () => import("./future.js");\n');
  const extensible = await compileRelease(temporary);
  const chunks = [...extensible.outputs.keys()].filter(name => name.startsWith("build/chunks/") && name.endsWith(".js"));
  assert.ok(chunks.length > 0, "future lazy modules produce independent chunks");
  assert.ok(chunks.every(name => extensible.precache.includes(name)), "future chunks are discovered for offline use");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

// Run the actual generated worker against an in-memory network and CacheStorage.
// Verify update/offline behavior rather than merely checking for source strings.
async function workerFixture({ mismatchedIndex = false } = {}) {
  const scope = "https://example.org/Game-Test/";
  const callbacks = new Map();
  const stores = new Map();
  const network = new Map();
  let online = true;
  let claims = 0;
  let skipped = 0;
  for (const name of release.precache) {
    let bytes = release.outputs.get(name) || await readFile(path.join(ROOT, "docs", name));
    if (mismatchedIndex && name === "index.html") bytes = Buffer.from(bytes.toString().replace(release.id, "another-build"));
    network.set(new URL(name, scope).href, new Response(bytes));
  }
  const key = request => typeof request === "string" ? request : request.url;
  const fetchMock = async request => {
    if (!online) throw new TypeError("Offline");
    const response = network.get(key(request));
    return response ? response.clone() : new Response("Not found", { status: 404 });
  };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(requests) {
          for (const request of requests) {
            assert.equal(request.cache, "reload", "offline installation bypasses stale HTTP responses");
            const response = await fetchMock(request);
            if (!response.ok) throw new Error("Asset unavailable");
            store.set(key(request), response.clone());
          }
        },
        async match(request) { return store.get(key(request))?.clone(); },
      };
    },
  };
  const self = { registration: { scope }, clients: { async claim() { claims++; } },
    skipWaiting() { skipped++; }, addEventListener: (name, callback) => callbacks.set(name, callback) };
  vm.runInNewContext(release.outputs.get("sw.js").toString(), { self, caches, fetch: fetchMock, URL, Request });
  async function lifecycle(name) {
    let pending;
    callbacks.get(name)({ waitUntil: promise => { pending = promise; } });
    await pending;
  }
  function request(name, options = {}) {
    let response;
    callbacks.get("fetch")({ request: { url: new URL(name, scope).href, method: "GET", mode: "cors", ...options },
      respondWith: promise => { response = promise; } });
    return response;
  }
  return { scope, stores, network, caches, lifecycle, request, offline: () => { online = false; },
    online: () => { online = true; }, claims: () => claims, skipped: () => skipped };
}

const worker = await workerFixture();
await worker.caches.open("another-app");
await worker.caches.open("sperrkreis98-%2FOtherGame%2F-old");
await worker.caches.open("sperrkreis98-v12.1");
await worker.lifecycle("install");
assert.equal(worker.skipped(), 0, "a release does not replace the worker underneath a running game");
worker.offline();
assert.equal(await (await worker.request("?v=legacy", { mode: "navigate" })).text(), html);
assert.equal(await (await worker.request(release.script)).text(), release.outputs.get(release.script).toString());
assert.equal(worker.request("missing-script.js"), undefined, "missing JS receives no HTML fallback");
assert.equal(worker.request("api/action", { method: "POST" }), undefined);
assert.equal(worker.request("https://another-origin.org/app.js"), undefined);
worker.online();
worker.network.set(new URL("./", worker.scope).href, new Response("new online release"));
assert.equal(await (await worker.request("./", { mode: "navigate" })).text(), "new online release");
worker.offline();
assert.equal(await (await worker.request("./", { mode: "navigate" })).text(), html,
  "an online update cannot corrupt the installed offline shell");
await worker.lifecycle("activate");
assert.equal(worker.claims(), 1);
assert.ok(worker.stores.has("another-app"));
assert.ok(worker.stores.has("sperrkreis98-%2FOtherGame%2F-old"));
assert.ok(!worker.stores.has("sperrkreis98-v12.1"));
const incomplete = await workerFixture({ mismatchedIndex: true });
await incomplete.caches.open("sperrkreis98-v12.1");
await assert.rejects(incomplete.lifecycle("install"), /Deployment changed/);
assert.equal(incomplete.stores.size, 1, "an incomplete update is discarded without deleting the previous release");

console.log("Deterministic build, module expansion, cache migration and offline update tests passed");
