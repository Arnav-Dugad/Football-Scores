import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = (await readdir("dist/assets")).map((name) => `/assets/${name}`);
const data = (await readdir("dist/data")).map((name) => `/data/${name}`);
const files = [
  "/",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  "/fonts/inter-latin.woff2",
  ...assets,
  ...data,
];
const hash = createHash("sha256");
for (const path of files) {
  hash.update(path);
  hash.update(await readFile(path === "/" ? "dist/index.html" : `dist${path}`));
}
const version = hash.digest("hex").slice(0, 12);
let source = await readFile("public/sw.js", "utf8");
source = source.replace(
  /const CACHE\s*=.*?;/,
  `const CACHE=${JSON.stringify("football-scores-" + version)};`,
);
source = source.replace(
  /cache\.addAll\(\[[^\]]*\]\)/,
  `cache.addAll(${JSON.stringify(files)})`,
);
if (!source.includes(version) || !source.includes("/data/2026-27-en.1.json"))
  throw new Error("Precache generation failed.");
await writeFile("dist/sw.js", source);
console.log(`PWA precache: ${files.length} genuine snapshot and shell assets.`);
