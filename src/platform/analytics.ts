import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { getSettings } from "../lib/settings";
import { isStandalone } from "./pwa";

/**
 * First-party, cookie-free page-view beacon.
 *
 * Sends only coarse labels — the section ("/match", never the full URL), the
 * competition, an external referrer's domain on landing, app language, theme
 * and whether Pitch runs as an installed app. A per-tab sessionStorage flag
 * marks the first view of a visit; nothing identifies a person or device.
 * Do-Not-Track and Global Privacy Control switch it off entirely.
 */

const SECTIONS = new Set(["match", "tables", "stats", "leagues", "team", "stadium", "player", "compare", "news", "settings", "widget"]);
const WITH_LEAGUE = new Set(["match", "team", "stadium", "player", "tables", "stats", "news"]);
const VISIT_KEY = "pitch.visit";

let landing = true;
let lastPath = "";

function optedOut(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  return n.globalPrivacyControl === true || n.doNotTrack === "1" || n.doNotTrack === "yes" || w.doNotTrack === "1" || n.msDoNotTrack === "1";
}

/** "/match/eng.1/401879264" → { p: "/match", l: "eng.1" }. Null = don't count (private pages). */
export function classify(path: string): { p: string; l: string } | null {
  const segs = path.split("/").filter(Boolean);
  if (!segs.length) return { p: "/", l: "" };
  const head = segs[0].toLowerCase();
  if (head === "insights") return null;
  if (!SECTIONS.has(head)) return { p: "/other", l: "" };
  const slug = WITH_LEAGUE.has(head) ? segs[1] ?? "" : "";
  return { p: `/${head}`, l: LEAGUE_BY_SLUG[slug] ? slug : "" };
}

/** The theme actually on screen (the widget may force one without persisting it). */
function resolvedTheme(): "dark" | "light" {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "dark" || forced === "light") return forced;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function externalReferrer(): string {
  try {
    if (!document.referrer) return "";
    const host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, "");
    return host && host !== location.hostname.toLowerCase().replace(/^www\./, "") ? host : "";
  } catch {
    return "";
  }
}

function firstOfVisit(): boolean {
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return false;
    sessionStorage.setItem(VISIT_KEY, "1");
    return true;
  } catch {
    return landing; // storage blocked: count the landing view only
  }
}

function send(path: string) {
  const c = classify(path);
  if (!c) return;
  const body = JSON.stringify({
    p: c.p,
    l: c.l,
    r: landing ? externalReferrer() : "",
    lang: getSettings().lang,
    th: resolvedTheme(),
    sa: isStandalone() ? 1 : 0,
    n: firstOfVisit() ? 1 : 0,
  });
  landing = false;
  try {
    const blob = new Blob([body], { type: "text/plain" });
    if (navigator.sendBeacon?.("/api/collect", blob)) return;
  } catch {
    /* fall through */
  }
  void fetch("/api/collect", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
}

let timer = 0;
function onRoute() {
  window.clearTimeout(timer);
  // Debounce so redirects and replaceState bursts count once.
  timer = window.setTimeout(() => {
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    send(path);
  }, 500);
}

let started = false;
export function startAnalytics() {
  if (started || typeof window === "undefined" || !import.meta.env.PROD || optedOut()) return;
  started = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const out = original.apply(this, args);
      onRoute();
      return out;
    };
  }
  window.addEventListener("popstate", onRoute);
  onRoute();
}
