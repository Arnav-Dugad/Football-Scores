/* Canonical URLs for player surfaces. Import these instead of hand-building paths. */

const SLUG_RE = /^[a-z]{2,6}\.[a-z0-9_]{1,20}$/;
const ID_RE = /^\d{1,12}$/;

/** Full player page, e.g. `/player/eng.1/253989`. */
export function playerHref(league: string, id: string): string {
  return `/player/${encodeURIComponent(league)}/${encodeURIComponent(id)}`;
}

/** A player reference as used in compare URLs: `eng.1:253989`. */
export interface PlayerKey {
  league: string;
  id: string;
}

export function encodeKey(k: PlayerKey): string {
  return `${k.league}:${k.id}`;
}

export function parseKey(raw: string | null | undefined): PlayerKey | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(":");
  if (i <= 0) return null;
  const league = raw.slice(0, i).toLowerCase();
  const id = raw.slice(i + 1);
  return SLUG_RE.test(league) && ID_RE.test(id) ? { league, id } : null;
}

/** Compare page with one or two players pre-selected. */
export function compareHref(a?: PlayerKey | null, b?: PlayerKey | null): string {
  const qs = new URLSearchParams();
  if (a) qs.set("a", encodeKey(a));
  if (b) qs.set("b", encodeKey(b));
  const s = qs.toString().replace(/%3A/gi, ":");
  return s ? `/compare?${s}` : "/compare";
}

export function isLeagueSlug(s: string | undefined | null): s is string {
  return !!s && SLUG_RE.test(s);
}

export function isPlayerId(s: string | undefined | null): s is string {
  return !!s && ID_RE.test(s);
}
