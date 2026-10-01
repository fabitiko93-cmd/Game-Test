import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { ROOT, writeRelease } from "./build.mjs";

const docs = path.join(ROOT, "docs");
const port = Number(process.env.SPERRKREIS_PORT || 4173);
let building = writeRelease();
await building;
let timer;
function rebuild() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    building = building.catch(() => {}).then(() => writeRelease());
    building.then(release => console.log(`Rebuilt ${release.id}`))
      .catch(error => console.error(error.message));
  }, 100);
}
const watchers = [watch(path.join(docs, "src"), { recursive: true }, rebuild),
  watch(path.join(docs, "assets"), { recursive: true }, rebuild),
  watch(path.join(ROOT, "web"), { recursive: true }, rebuild),
  watch(path.join(docs, "style.css"), rebuild),
  watch(path.join(docs, "manifest.webmanifest"), rebuild)];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  try {
    await building;
    const url = new URL(request.url, "http://localhost");
    const name = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(docs, name);
    if (!file.startsWith(docs + path.sep) || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(403); response.end(); return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end(error.code === "ENOENT" ? "Not found" : "Build failed; see terminal.");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Game: http://127.0.0.1:${port}/`));
function stop() { clearTimeout(timer); watchers.forEach(w => w.close()); server.close(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
