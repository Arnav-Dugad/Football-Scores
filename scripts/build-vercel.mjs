import { mkdir, writeFile, cp } from "node:fs/promises";
import { build } from "esbuild";
await mkdir(".vercel/output/functions/api.func", { recursive: true });
await cp("dist", ".vercel/output/static", { recursive: true });
await build({
  entryPoints: ["api/index.ts"],
  outfile: ".vercel/output/functions/api.func/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
await writeFile(
  ".vercel/output/functions/api.func/.vc-config.json",
  JSON.stringify({ runtime: "edge", entrypoint: "index.js" }),
);
await writeFile(
  ".vercel/output/config.json",
  JSON.stringify({
    version: 3,
    routes: [
      { src: "/api/(.*)", dest: "/api" },
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/index.html" },
    ],
  }),
);
console.log("Vercel Build Output API: static assets + edge function packaged.");
