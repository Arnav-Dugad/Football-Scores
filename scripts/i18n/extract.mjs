// Extract every translatable string from the source tree.
//
//   node scripts/i18n/extract.mjs          → writes scripts/i18n/catalog.json and reports
//                                            missing keys per locale in src/i18n/locales/*.json
//
// Matches t("…"), t('…'), t(`…`) without interpolation, and tn(n, "one", "other").
// Strings passed through variables (e.g. t(league.short)) are listed in
// scripts/i18n/extra.json so translators still see them.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(root, "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const STR = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`(?:[^\`\\$]|\\.)*\`)`;
const T_RE = new RegExp(String.raw`\bt\(\s*` + STR, "g");
const TN_RE = new RegExp(String.raw`\btn\(\s*[^,]+,\s*` + STR + String.raw`\s*,\s*` + STR, "g");

const unquote = (s) => {
  const q = s[0];
  const body = s.slice(1, -1);
  if (q === "`") return body.replace(/\\`/g, "`").replace(/\\\\/g, "\\");
  return JSON.parse(q === '"' ? s : `"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
};

const keys = new Map(); // key -> files
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const rel = file.slice(root.length + 1).replace(/\\/g, "/");
  for (const m of text.matchAll(T_RE)) add(unquote(m[1]), rel);
  for (const m of text.matchAll(TN_RE)) {
    add(unquote(m[1]), rel);
    add(unquote(m[2]), rel);
  }
}
const extraPath = join(root, "scripts", "i18n", "extra.json");
if (existsSync(extraPath)) for (const k of JSON.parse(readFileSync(extraPath, "utf8"))) add(k, "extra.json");

function add(k, f) {
  if (!k.trim()) return;
  const set = keys.get(k) ?? new Set();
  set.add(f);
  keys.set(k, set);
}

const catalog = Object.fromEntries([...keys.keys()].sort((a, b) => a.localeCompare(b)).map((k) => [k, [...keys.get(k)].sort()]));
writeFileSync(join(root, "scripts", "i18n", "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`${keys.size} strings`);

const locDir = join(SRC, "i18n", "locales");
if (existsSync(locDir)) {
  for (const f of readdirSync(locDir).filter((n) => n.endsWith(".json"))) {
    const dict = JSON.parse(readFileSync(join(locDir, f), "utf8"));
    const missing = [...keys.keys()].filter((k) => !(k in dict));
    const stale = Object.keys(dict).filter((k) => !keys.has(k));
    const badVars = Object.entries(dict).filter(([k, v]) => {
      const need = (k.match(/\{\w+\}/g) ?? []).sort().join();
      const have = (String(v).match(/\{\w+\}/g) ?? []).sort().join();
      return keys.has(k) && need !== have;
    });
    console.log(`${f}: missing ${missing.length}, stale ${stale.length}, placeholder mismatches ${badVars.length}`);
    if (badVars.length) console.log("  ", badVars.slice(0, 5));
  }
}
