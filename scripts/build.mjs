import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const posix = name => name.split(path.sep).join("/");

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const groups = await Promise.all(entries.map(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(name) : [name];
  }));
  return groups.flat().sort();
}

// Source modules have stable imports. Only generated output names carry hashes.
// ESM splitting also supports future dynamic imports without changing this pipeline.
export async function compileRelease(root = ROOT) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["docs/src/main.js", "docs/style.css"],
    outdir: "docs/build",
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "assets/[name]-[hash]",
    loader: { ".svg": "file", ".png": "file", ".jpg": "file", ".jpeg": "file", ".webp": "file", ".woff2": "file" },
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2020", "safari15"],
    minify: true,
    keepNames: true,
    sourcemap: "linked",
    sourcesContent: false,
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  const outputs = new Map(result.outputFiles.map(file => [
    posix(path.relative(path.join(root, "docs"), file.path)), Buffer.from(file.contents),
  ]));
  function entry(source) {
    const found = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint === source);
    if (!found) throw new Error(`Missing build entry: ${source}`);
    return posix(path.relative("docs", found[0]));
  }
  const script = entry("docs/src/main.js");
  const style = entry("docs/style.css");
  const staticFiles = ["manifest.webmanifest", ...(await filesIn(path.join(root, "docs/assets")))
    .map(file => posix(path.relative(path.join(root, "docs"), file)))];
  const staticContents = new Map(await Promise.all(staticFiles.map(async name => [
    name, await readFile(path.join(root, "docs", name)),
  ])));
  const [htmlTemplate, workerTemplate] = await Promise.all([
    readFile(path.join(root, "web/index.html"), "utf8"),
    readFile(path.join(root, "web/service-worker.js"), "utf8"),
  ]);
  const fingerprint = createHash("sha256");
  for (const [name, bytes] of [...outputs, ...staticContents].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    fingerprint.update(`${name}\0${hash(bytes)}\n`);
  }
  fingerprint.update(htmlTemplate).update(workerTemplate);
  const id = fingerprint.digest("hex").slice(0, 20);
  const precache = ["index.html", ...staticFiles,
    ...[...outputs.keys()].filter(name => !name.endsWith(".map"))].sort();
  const html = htmlTemplate.replaceAll("{{SCRIPT_ENTRY}}", script)
    .replaceAll("{{STYLE_ENTRY}}", style).replaceAll("{{BUILD_ID}}", id);
  const worker = workerTemplate.replaceAll("{{BUILD_ID}}", id)
    .replace("/* PRECACHE_FILES */ []", JSON.stringify(precache.map(name => `./${name}`), null, 2));
  if (/\{\{[A-Z_]+\}\}/.test(html + worker)) throw new Error("Unresolved release template token");
  outputs.set("index.html", Buffer.from(html));
  outputs.set("sw.js", Buffer.from(worker));
  outputs.set(".nojekyll", Buffer.alloc(0));
  outputs.set("build/manifest.json", Buffer.from(JSON.stringify({ id, script, style, precache }, null, 2) + "\n"));
  return { id, outputs, script, style, precache };
}

export async function writeRelease(root = ROOT, release = null) {
  release ||= await compileRelease(root);
  // Compile everything before writing. Keep the HTML/worker publication last.
  for (const [name, bytes] of [...release.outputs].sort(([a], [b]) =>
    Number(["index.html", "sw.js"].includes(a)) - Number(["index.html", "sw.js"].includes(b)))) {
    const file = path.join(root, "docs", name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  for (const file of await filesIn(path.join(root, "docs/build"))) {
    const name = posix(path.relative(path.join(root, "docs"), file));
    if (!release.outputs.has(name)) await rm(file);
  }
  return release;
}

export async function checkRelease(root = ROOT, release = null) {
  release ||= await compileRelease(root);
  const differences = [];
  for (const [name, expected] of release.outputs) {
    const actual = await readFile(path.join(root, "docs", name)).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!actual?.equals(expected)) differences.push(name);
  }
  for (const file of await filesIn(path.join(root, "docs/build"))) {
    const name = posix(path.relative(path.join(root, "docs"), file));
    if (!release.outputs.has(name)) differences.push(`${name} (obsolete)`);
  }
  return differences;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes("--check")) {
    const differences = await checkRelease();
    if (differences.length) {
      console.error(`Build is stale. Run npm run build:\n${differences.join("\n")}`);
      process.exitCode = 1;
    } else console.log("Release output matches source.");
  } else {
    const release = await writeRelease();
    console.log(`Build ${release.id}: ${release.outputs.size} generated files.`);
  }
}
