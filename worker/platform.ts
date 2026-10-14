import { json, type Env } from "./common";
import { collect, insights } from "./insights/http";
import { isId, isLeague, LEAGUE_FACTS } from "./og/leagues";
import type { OgKind, Renderer } from "./og/renderer";

/**
 * Platform features: share images (/api/og/*), first-party analytics
 * (/api/collect, /api/insights) and the compact widget feed (/api/widget).
 * Returns null when the request isn't a platform route.
 *
 * Everything here is O(1) string work in the Worker; parsing and rendering
 * happen in the Renderer / InsightsStore Durable Objects.
 */
export async function handlePlatform(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const p = url.pathname;
  if (p === "/api/collect") return collect(request, url, env, ctx);
  if (p === "/api/insights") return insights(request, url, env);
  if (p === "/api/widget") return widget(url, env);
  if (p.startsWith("/api/og/")) return og(request, p, env, ctx);
  return null;
}

export { Renderer } from "./og/renderer";
export { InsightsStore } from "./insights/store";

function renderer(env: Env, name: string) {
  const ns = env.RENDERER as unknown as DurableObjectNamespace<Renderer>;
  return ns.get(ns.idFromName(name));
}

/* ------------------------------------------------------------- widget --- */

const widgetCache = new Map<string, { exp: number; body: string }>();
const WIDGET_TTL = 20;

async function widget(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams;
  const team = q.get("team");
  const league = q.get("league");
  let leagues: string[] = [];
  if (team !== null) {
    if (!isId(team) || !isLeague(league)) return json({ error: "team needs a numeric ESPN id and a supported league" }, 0, 400);
  } else {
    const raw = (q.get("leagues") ?? q.get("league") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (raw.some((s) => !isLeague(s))) return json({ error: "unsupported league", supported: Object.keys(LEAGUE_FACTS) }, 0, 400);
    leagues = raw.length ? [...new Set(raw)] : Object.keys(LEAGUE_FACTS);
  }

  const key = team ? `t:${league}:${team}` : `l:${leagues.join(",")}`;
  const hit = widgetCache.get(key);
  if (hit && hit.exp > Date.now()) return json(hit.body, WIDGET_TTL);
  const body = await renderer(env, "widget").widget(team, team ? league : null, leagues);
  if (widgetCache.size > 300) widgetCache.clear();
  widgetCache.set(key, { exp: Date.now() + WIDGET_TTL * 1000, body });
  return json(body, WIDGET_TTL);
}

/* --------------------------------------------------------- og images --- */

const OG_RE = /^\/api\/og\/(?:(brand)|league\/([a-z0-9._]+)|(match|team|player)\/([a-z0-9._]+)\/(\d{1,12}))\.png$/;

async function og(request: Request, path: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const m = OG_RE.exec(path);
  if (!m) return json({ error: "not found" }, 0, 404);
  const kind = (m[1] ? "brand" : m[2] ? "league" : m[3]) as OgKind;
  const league = m[2] ?? m[4] ?? "";
  const id = m[5] ?? "";
  if (kind !== "brand" && !isLeague(league)) return json({ error: "league" }, 0, 404);

  // Edge cache first (effective on custom domains; a no-op on workers.dev).
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(request).catch(() => undefined);
  if (cached) return cached;

  try {
    const res = await renderer(env, kind === "brand" ? "og:brand" : `og:${league}`).render(kind, league, id);
    if (!res.png) return json({ error: "not found" }, 60, 404);
    const out = new Response(res.png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": `public, max-age=${res.maxAge}, stale-while-revalidate=${res.maxAge}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
    ctx.waitUntil(cache.put(request, out.clone()).catch(() => undefined));
    return out;
  } catch (err) {
    console.error("og render failed", path, String(err));
    // Never leave a preview without an image: serve the static brand card.
    const fallback = await env.ASSETS.fetch(new URL("/og-default.png", request.url));
    if (!fallback.ok) return json({ error: "render" }, 0, 503);
    return new Response(fallback.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" } });
  }
}
