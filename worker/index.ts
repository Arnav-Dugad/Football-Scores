/**
 * Pitch — edge router.
 *
 * Kept deliberately thin (the Free plan allows ~10 ms CPU per request):
 * heavy lifting happens in Durable Objects, which get 30 s per request.
 *
 *   /api/scores, /api/calendar, /api/live(*)   → LiveHub DO
 *   /api/season|people|shots|h2h|match/:league → LeagueStore DO (one per league)
 *   /api/espn/*                                → raw, allow-listed ESPN passthrough
 *   /api/player, /api/player/career, /api/team, /api/venue → TheSportsDB / Wikipedia
 *   /api/geo                                   → visitor country (for defaults)
 *   platform routes (og images, analytics, widget) → ./platform
 */

import { ESPN_SITE, ESPN_V2, ESPN_WEB, LEAGUES, LEAGUE_RE, UA, json, type Env } from "./common";
import { injectMeta } from "./meta";
import { handlePlatform } from "./platform";
import { career, player, team, venue } from "./tsdb";

export { LeagueStore } from "./league";
export { LiveHub } from "./live";
export { Renderer, InsightsStore } from "./platform";

/* ---------------------------------------------------- ESPN passthrough -- */

const raw = new Map<string, { exp: number; body: string; status: number }>();

function espnTarget(path: string): { url: string; ttl: number } | null {
  if (!/^[a-z0-9./_-]+$/i.test(path) || path.includes("..")) return null;
  const [base, ...rest] = path.split("/");
  const root = base === "site" ? ESPN_SITE : base === "v2" ? ESPN_V2 : base === "web" ? ESPN_WEB : null;
  if (!root || !LEAGUE_RE.test(rest[0] ?? "")) return null;
  const tail = rest.join("/");
  let ttl = 300;
  if (/\/summary$/.test(tail)) ttl = 15;
  else if (/\/scoreboard$/.test(tail)) ttl = 20;
  else if (/\/standings$/.test(tail)) ttl = 120;
  else if (/\/(statistics|news)$/.test(tail)) ttl = 900;
  else if (/\/(roster|schedule)$/.test(tail)) ttl = 1800;
  else if (/\/athletes\//.test(tail)) ttl = 3600;
  else if (/\/teams(\/\d+)?$/.test(tail)) ttl = 3600;
  return { url: `${root}/${tail}`, ttl };
}

async function espnProxy(path: string, url: URL) {
  const target = espnTarget(path);
  if (!target) return json({ error: "not allowed" }, 0, 400);
  const qs = new URLSearchParams();
  for (const k of ["event", "dates", "season", "limit", "level", "region", "lang", "contentorigin", "fixture"]) {
    const v = url.searchParams.get(k);
    if (v && /^[a-z0-9,._-]{1,40}$/i.test(v)) qs.set(k, v);
  }
  const full = target.url + (qs.size ? `?${qs}` : "");
  const hit = raw.get(full);
  if (hit && hit.exp > Date.now()) return json(hit.body, target.ttl, hit.status);
  const res = await fetch(full, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(9000) }).catch(
    () => null,
  );
  if (!res) return json({ error: "upstream" }, 5, 502);
  const body = await res.text();
  const status = res.ok ? 200 : res.status === 404 ? 404 : 502;
  if (res.ok) {
    if (raw.size > 300) raw.clear();
    raw.set(full, { exp: Date.now() + target.ttl * 1000, body, status });
  }
  return json(res.ok ? body : { error: "upstream", status: res.status }, res.ok ? target.ttl : 5, status);
}

/* ------------------------------------------------------------- router --- */

// Durable Objects live where they are first created. Pin them near ESPN's API
// (eastern North America): from some regions upstream requests stall.
function league(env: Env, slug: string) {
  return env.LEAGUE.get(env.LEAGUE.idFromName(slug), { locationHint: "enam" });
}
function hub(env: Env) {
  return env.LIVE.get(env.LIVE.idFromName("live-enam"), { locationHint: "enam" });
}
const list = (v: string | null) => (v ?? "").split(",").filter(Boolean);

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname;

  if (p === "/api/live") return hub(env).fetch(request);
  if (request.method !== "GET" && request.method !== "HEAD" && !p.startsWith("/api/collect")) return json({ error: "method" }, 0, 405);

  const platform = await handlePlatform(request, url, env, ctx);
  if (platform) return platform;

  if (p === "/api/scores") {
    const body = await hub(env).scores(list(url.searchParams.get("dates")), list(url.searchParams.get("leagues")));
    const live = body.includes('"state":"in"');
    return json(body, live ? 10 : 30);
  }
  if (p === "/api/calendar") return json(await hub(env).calendar(list(url.searchParams.get("leagues"))), 3 * 3600);
  if (p === "/api/live/snapshot") return json(await hub(env).snapshot(), 10);
  if (p === "/api/geo") {
    const cf = (request as unknown as { cf?: IncomingRequestCfProperties }).cf;
    return json({ country: cf?.country ?? null, timezone: cf?.timezone ?? null }, 0);
  }

  const m = /^\/api\/(season|people|shots|h2h|match)\/([a-z0-9._]+)$/.exec(p);
  if (m) {
    const slug = m[2];
    // Only known competitions get a Durable Object (and a background sync).
    if (!LEAGUES.includes(slug)) return json({ error: "unknown league" }, 0, 404);
    const stub = league(env, slug);
    switch (m[1]) {
      case "season":
        return json(await stub.season(slug), 60);
      case "people":
        return json(await stub.people(slug), 300);
      case "shots": {
        const t = url.searchParams.get("team");
        const pl = url.searchParams.get("player");
        return json(await stub.shots(slug, t && /^\d+$/.test(t) ? t : null, pl ? pl.slice(0, 80) : null), 600);
      }
      case "h2h":
        return json(await stub.h2h(slug, url.searchParams.get("a") ?? "", url.searchParams.get("b") ?? ""), 3600);
      case "match":
        return json(await stub.match(slug, (url.searchParams.get("id") ?? "").replace(/\D/g, "")), 60);
    }
  }

  if (p === "/api/player") return player(url, env, ctx);
  if (p === "/api/player/career") return career(url, env, ctx);
  if (p === "/api/team") return team(url, env, ctx);
  if (p === "/api/venue") return venue(url, env, ctx);
  if (p.startsWith("/api/espn/")) return espnProxy(p.slice("/api/espn/".length), url);
  return json({ error: "not found" }, 0, 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      const res = await env.ASSETS.fetch(request);
      return injectMeta(request, res, env, ctx);
    }
    try {
      return await api(request, env, ctx);
    } catch (err) {
      console.error("api error", url.pathname, String(err));
      return json({ error: "server" }, 0, 500);
    }
  },

  /** Keep every league's background sync alive. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all(LEAGUES.map((slug) => league(env, slug).kick(slug).catch(() => undefined))));
  },
} satisfies ExportedHandler<Env>;
