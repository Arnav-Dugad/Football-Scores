import { useCallback, useSyncExternalStore } from "react";

/* Viewer preferences. Persisted per browser (localStorage), never sent anywhere. */

export type Lang = "en" | "es" | "fr" | "de" | "it" | "pt" | "nl" | "hi" | "ar";
export type Clock = "auto" | "12" | "24";

export interface FollowTeam {
  id: string;
  league: string;
  name: string;
  logo: string;
  color?: string | null;
}

export interface Settings {
  country: string | null;
  lang: Lang;
  clock: Clock;
  haptics: boolean;
  contrast: "auto" | "more";
  patterns: boolean;
  teams: FollowTeam[];
  leagues: string[];
  onboarded: boolean;
}

const KEY = "pitch.settings";

export const LANGS: { code: Lang; name: string; english: string; dir: "ltr" | "rtl"; locale: string }[] = [
  { code: "en", name: "English", english: "English", dir: "ltr", locale: "en" },
  { code: "es", name: "Español", english: "Spanish", dir: "ltr", locale: "es" },
  { code: "fr", name: "Français", english: "French", dir: "ltr", locale: "fr" },
  { code: "de", name: "Deutsch", english: "German", dir: "ltr", locale: "de" },
  { code: "it", name: "Italiano", english: "Italian", dir: "ltr", locale: "it" },
  { code: "pt", name: "Português", english: "Portuguese", dir: "ltr", locale: "pt" },
  { code: "nl", name: "Nederlands", english: "Dutch", dir: "ltr", locale: "nl" },
  { code: "hi", name: "हिन्दी", english: "Hindi", dir: "ltr", locale: "hi-IN" },
  { code: "ar", name: "العربية", english: "Arabic", dir: "rtl", locale: "ar-u-nu-latn" },
];

function detectLang(): Lang {
  const prefs = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const p of prefs) {
    const code = String(p).slice(0, 2).toLowerCase();
    if (LANGS.some((l) => l.code === code)) return code as Lang;
  }
  return "en";
}

const DEFAULTS: Settings = {
  country: null,
  lang: "en",
  clock: "auto",
  haptics: true,
  contrast: "auto",
  patterns: false,
  teams: [],
  leagues: [],
  onboarded: false,
};

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      const s = { ...DEFAULTS, ...parsed };
      if (!LANGS.some((l) => l.code === s.lang)) s.lang = "en";
      if (!Array.isArray(s.teams)) s.teams = [];
      if (!Array.isArray(s.leagues)) s.leagues = [];
      return s;
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS, lang: detectLang() };
}

let current: Settings = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  applyDocumentSettings();
  listeners.forEach((fn) => fn());
}

export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const s = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const set = useCallback((patch: Partial<Settings>) => updateSettings(patch), []);
  return [s, set];
}

/** Reflect settings that CSS depends on onto <html>. */
export function applyDocumentSettings() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const lang = LANGS.find((l) => l.code === current.lang) ?? LANGS[0];
  root.lang = lang.code;
  root.dir = lang.dir;
  if (current.contrast === "more") root.setAttribute("data-contrast", "more");
  else root.removeAttribute("data-contrast");
  if (current.patterns) root.setAttribute("data-patterns", "on");
  else root.removeAttribute("data-patterns");
}

export function localeTag(): string {
  return (LANGS.find((l) => l.code === current.lang) ?? LANGS[0]).locale;
}

export function hour12(): boolean | undefined {
  return current.clock === "auto" ? undefined : current.clock === "12";
}

/* ------------------------------------------------------------ follows ---- */

export function isFollowing(teamId: string): boolean {
  return current.teams.some((t) => t.id === teamId);
}

export function toggleFollow(team: FollowTeam) {
  const exists = current.teams.some((t) => t.id === team.id);
  updateSettings({ teams: exists ? current.teams.filter((t) => t.id !== team.id) : [...current.teams, team] });
  return !exists;
}

export function toggleLeagueFollow(slug: string) {
  const exists = current.leagues.includes(slug);
  updateSettings({ leagues: exists ? current.leagues.filter((l) => l !== slug) : [...current.leagues, slug] });
}

/** Light haptic tap where supported and enabled. */
export function haptic(pattern: number | number[] = 12) {
  if (!current.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
