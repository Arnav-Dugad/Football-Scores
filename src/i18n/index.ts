import { getSettings, updateSettings, type Lang } from "../lib/settings";

/**
 * Tiny gettext-style i18n. English source strings are the keys:
 *
 *   t("Full time")                    → "Final del partido"
 *   t("{n} matches", { n: 4 })        → "4 partidos"
 *   tn(n, "{n} match", "{n} matches") → plural-aware
 *
 * Locale dictionaries live in ./locales/<lang>.json and are loaded before the
 * app renders (and again when the language changes, which remounts the app).
 * Missing keys fall back to English, so partial dictionaries are safe.
 */

let dict: Record<string, string> = {};
let loaded: Lang = "en";

const loaders = import.meta.glob<{ default: Record<string, string> }>("./locales/*.json");

export async function loadLang(lang: Lang): Promise<void> {
  if (lang === "en") {
    dict = {};
    loaded = "en";
    return;
  }
  const loader = loaders[`./locales/${lang}.json`];
  if (!loader) {
    dict = {};
    loaded = "en";
    return;
  }
  try {
    dict = (await loader()).default;
    loaded = lang;
  } catch {
    dict = {};
    loaded = "en";
  }
}

export function currentLang(): Lang {
  return loaded;
}

export function t(source: string, vars?: Record<string, string | number>): string {
  // "context::Text" keys disambiguate identical English words ("assists::A" vs "A" for Away);
  // English shows the text after "::".
  let out = dict[source] || (source.includes("::") ? source.slice(source.indexOf("::") + 2) : source);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** Plural helper — picks the singular form only for exactly 1. */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

/** Keep the import side-effect free for SSR-less builds. */
export function initialLang(): Lang {
  return getSettings().lang;
}

/** Switch language: load the dictionary first, then flip the setting (remounts the app). */
export async function changeLanguage(lang: Lang): Promise<void> {
  await loadLang(lang);
  updateSettings({ lang });
}
