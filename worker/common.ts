import type { LeagueStore } from "./league";
import type { LiveHub } from "./live";

export interface Env {
  ASSETS: Fetcher;
  /** Durable cache for player/club lookups (keeps us inside TheSportsDB's rate limit). */
  PITCH_CACHE?: KVNamespace;
  LIVE: DurableObjectNamespace<LiveHub>;
  LEAGUE: DurableObjectNamespace<LeagueStore>;
  RENDERER: DurableObjectNamespace;
  INSIGHTS: DurableObjectNamespace;
  /** Secret that unlocks the private /insights page. */
  INSIGHTS_KEY?: string;
}

export const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
export const ESPN_V2 = "https://site.api.espn.com/apis/v2/sports/soccer";
export const ESPN_WEB = "https://site.web.api.espn.com/apis/common/v3/sports/soccer";
export const TSDB = "https://www.thesportsdb.com/api/v1/json/123";
export const UA = "PitchFootball/3.0 (+https://github.com/Arnav-Dugad/Football-Scores)";

export const LEAGUES = [
  "eng.1",
  "esp.1",
  "ita.1",
  "ger.1",
  "fra.1",
  "uefa.champions",
  "uefa.europa",
  "usa.1",
  "ned.1",
  "por.1",
  "ind.1",
];
export const LEAGUE_RE = /^[a-z]{2,6}\.[a-z0-9_]{1,20}$/;

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`upstream ${status}`);
  }
}

/** JSON GET with a timeout and a clear error for non-2xx responses. */
export async function upstream<T = any>(url: string, timeoutMs = 9000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new UpstreamError(res.status);
  return (await res.json()) as T;
}

/** YYYYMMDD in a given IANA time zone. */
export function ymdIn(tz: string, t: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(t))
    .replace(/-/g, "");
}

export function json(data: unknown, maxAge: number, status = 200, extra: Record<string, string> = {}) {
  return new Response(typeof data === "string" ? data : JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAge > 0 ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}` : "no-store",
      "Access-Control-Allow-Origin": "*",
      ...extra,
    },
  });
}
