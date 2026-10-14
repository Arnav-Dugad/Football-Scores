import { t } from "../i18n";
import { hour12, localeTag } from "./settings";

/** Local calendar day helpers. ESPN buckets fixtures by US day, so a viewer's
 *  local day can straddle two ESPN days — we request both and filter locally. */

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDay(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  return Number.isNaN(x.getTime()) ? null : x;
}

function ymdIn(tz: string, d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .replace(/-/g, "");
  return parts;
}

/** ESPN `dates=` values that together cover the viewer's local day. */
export function espnDatesFor(localDay: Date): string[] {
  const start = startOfDay(localDay);
  const end = new Date(addDays(start, 1).getTime() - 1);
  const set = new Set<string>();
  for (const tz of ["America/New_York", "America/Los_Angeles"]) {
    set.add(ymdIn(tz, start));
    set.add(ymdIn(tz, end));
  }
  return [...set].sort().slice(0, 3);
}

export function sameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return isoDay(d) === isoDay(day);
}

/* Formatters follow the viewer's language and 12/24-hour preference. */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(kind: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const h = hour12();
  const key = `${kind}|${localeTag()}|${h}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(localeTag(), { ...opts, ...(opts.hour ? { hour12: h } : {}) });
    fmtCache.set(key, f);
  }
  return f;
}

export const fmtTime = (iso: string | Date) => dtf("time", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const fmtDayLong = (d: Date) => dtf("long", { weekday: "long", day: "numeric", month: "long" }).format(d);
export const fmtDayShort = (d: Date | string) =>
  dtf("short", { weekday: "short", day: "numeric", month: "short" }).format(typeof d === "string" ? new Date(d) : d);
export const fmtDow = (d: Date) => dtf("dow", { weekday: "short" }).format(d);
export const fmtFull = (iso: string) =>
  dtf("full", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const fmtDate = (d: Date | string) =>
  dtf("date", { day: "numeric", month: "short", year: "numeric" }).format(typeof d === "string" ? new Date(d) : d);
export const fmtMonth = (d: Date) => dtf("month", { month: "long", year: "numeric" }).format(d);
/** Time in a specific IANA zone (e.g. the stadium's). */
export const fmtTimeIn = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat(localeTag(), { hour: "numeric", minute: "2-digit", hour12: hour12(), timeZone }).format(new Date(iso));

const numCache = new Map<string, Intl.NumberFormat>();
export function fmtNum(n: number, digits = 0): string {
  const key = `${localeTag()}|${digits}`;
  let f = numCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(localeTag(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numCache.set(key, f);
  }
  return f.format(n);
}
export const fmtPct = (p: number, digits = 0) => `${fmtNum(p * 100, digits)}%`;

export function relativeDayLabel(d: Date): string | null {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return t("Today");
  if (diff === 1) return t("Tomorrow");
  if (diff === -1) return t("Yesterday");
  return null;
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();
export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t("Just now");
  let f = rtfCache.get(localeTag());
  if (!f) {
    f = new Intl.RelativeTimeFormat(localeTag(), { numeric: "auto", style: "short" });
    rtfCache.set(localeTag(), f);
  }
  if (s < 3600) return f.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return f.format(-Math.floor(s / 3600), "hour");
  if (s < 86400 * 7) return f.format(-Math.floor(s / 86400), "day");
  return fmtDayShort(iso);
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L} ]/gu, "").split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function lastName(name: string): string {
  const parts = name.split(" ");
  if (parts.length <= 1) return name;
  // Keep particles together: "van Dijk", "De Bruyne", "Mac Allister"
  const particles = new Set(["van", "von", "de", "da", "di", "del", "der", "la", "le", "mac", "dos", "ter", "el"]);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ");
}

/** Pick readable text on top of an arbitrary team colour. */
export function onColor(hex: string | null | undefined): string {
  if (!hex) return "#fff";
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "#111" : "#fff";
}

/** Team colour, nudged away from pure white/black so it shows on glass. */
export function teamTint(hex: string | null | undefined, fallback = "#5e5ce6"): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  const h = hex.slice(1).toLowerCase();
  if (h === "ffffff" || h === "000000" || h === "fefefe" || h === "010101") return fallback;
  return hex;
}

export function age(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 86400000));
}
