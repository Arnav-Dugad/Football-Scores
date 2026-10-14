import type { Env } from "./common";
import { isBrowser, isId, isLeague, LEAGUE_FACTS } from "./og/leagues";
import type { MetaKind, PageMeta, Renderer } from "./og/renderer";

/**
 * Per-route social metadata (Open Graph / Twitter cards) for shared links.
 *
 * Rules that keep pages fast and unbreakable:
 *  • only 200 text/html GET responses are touched, via a streaming HTMLRewriter;
 *  • section/league pages need no I/O at all;
 *  • match/team/player/stadium facts come from the Renderer DO with a hard
 *    400 ms budget for crawlers — people in a browser never wait: they get
 *    whatever is already in isolate memory and the lookup warms it in the
 *    background (the SPA sets its own document title anyway);
 *  • any failure returns the original response untouched.
 */

const SITE = "Pitch";
const TAGLINE = "Football, beautifully";
const BUDGET_MS = 400;

type Route = { kind: MetaKind; league: string; id: string } | { kind: "tables" | "stats" | "news"; league: string | null } | { kind: "compare" } | { kind: "home" };

function route(path: string): Route | null {
  const p = path.replace(/\/+$/, "") || "/";
  let m = /^\/(match|team|player|stadium)\/([a-z0-9._]+)\/(\d{1,12})$/.exec(p);
  if (m) return isLeague(m[2]) ? { kind: m[1] as MetaKind, league: m[2], id: m[3] } : null;
  m = /^\/(tables|stats|news)(?:\/([a-z0-9._]+))?$/.exec(p);
  if (m) return m[2] && !isLeague(m[2]) ? null : { kind: m[1] as "tables" | "stats" | "news", league: m[2] ?? null };
  if (p === "/compare") return { kind: "compare" };
  if (p === "/") return { kind: "home" };
  return null;
}

function staticMeta(r: Route): PageMeta | null {
  const brand: PageMeta = {
    title: `${SITE} — ${TAGLINE}`,
    description: "Live football scores, lineups, tables and analytics for the Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, the Champions League and more.",
    image: "/og-default.png",
    alt: SITE,
    ttl: 0,
  };
  switch (r.kind) {
    case "home":
      return brand;
    case "compare":
      return { ...brand, title: `Compare clubs & players · ${SITE}`, description: "Head-to-head numbers for any two clubs or players: form, goals, xG and more." };
    case "tables":
    case "stats":
    case "news": {
      if (!r.league) {
        const what = { tables: "League tables", stats: "Football stats", news: "Football news" }[r.kind];
        return { ...brand, title: `${what} · ${SITE}` };
      }
      const name = LEAGUE_FACTS[r.league].name;
      const copy = {
        tables: [`${name} table`, `The ${name} table with form, goal difference and qualification and relegation zones — updated live.`],
        stats: [`${name} stats`, `${name} top scorers, assists, xG, attack and defence ratings and season trends.`],
        news: [`${name} news`, `The latest ${name} stories, transfers and match reports.`],
      }[r.kind];
      return { title: `${copy[0]} · ${SITE}`, description: copy[1], image: `/api/og/league/${r.league}.png`, alt: name, ttl: 0 };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------- dynamic meta --- */

const cache = new Map<string, { exp: number; meta: PageMeta | null }>();
const pending = new Map<string, Promise<PageMeta | null>>();

function lookup(env: Env, kind: MetaKind, league: string, id: string): Promise<PageMeta | null> {
  const key = `${kind}:${league}:${id}`;
  const running = pending.get(key);
  if (running) return running;
  const ns = env.RENDERER as unknown as DurableObjectNamespace<Renderer>;
  const p = ns
    .get(ns.idFromName(`og:${league}`))
    .meta(kind, league, id)
    .then((s) => {
      const meta = JSON.parse(s) as PageMeta | null;
      if (cache.size > 500) cache.clear();
      cache.set(key, { exp: Date.now() + (meta?.ttl ?? 60) * 1000, meta });
      return meta;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

async function dynamicMeta(r: { kind: MetaKind; league: string; id: string }, request: Request, env: Env, ctx: ExecutionContext): Promise<PageMeta | null> {
  if (!isId(r.id)) return null;
  const key = `${r.kind}:${r.league}:${r.id}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.meta;
  const p = lookup(env, r.kind, r.league, r.id);
  ctx.waitUntil(p);
  if (isBrowser(request.headers.get("User-Agent") ?? "")) return hit?.meta ?? null;
  let timer = 0;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), BUDGET_MS) as unknown as number;
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------ rewrite --- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function tags(meta: PageMeta, url: URL): string {
  const page = `${url.origin}${url.pathname}`;
  const image = `${url.origin}${meta.image}`;
  const title = meta.title.includes(SITE) ? meta.title : `${meta.title} · ${SITE}`;
  const rows: [string, string, string][] = [
    ["name", "description", meta.description],
    ["property", "og:type", "website"],
    ["property", "og:site_name", SITE],
    ["property", "og:title", title],
    ["property", "og:description", meta.description],
    ["property", "og:url", page],
    ["property", "og:image", image],
    ["property", "og:image:type", "image/png"],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", meta.alt],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", meta.description],
    ["name", "twitter:image", image],
    ["name", "twitter:image:alt", meta.alt],
  ];
  return [...rows.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}" />`), `<link rel="canonical" href="${esc(page)}" />`].join("\n    ");
}

function rewrite(response: Response, meta: PageMeta, url: URL): Response {
  const title = meta.title.includes(SITE) ? meta.title : `${meta.title} · ${SITE}`;
  const drop = {
    element: (el: Element) => {
      el.remove();
    },
  };
  const out = new HTMLRewriter()
    .on("title", {
      element: (el) => {
        el.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', drop)
    .on('meta[property^="og:"]', drop)
    .on('meta[name^="twitter:"]', drop)
    .on('link[rel="canonical"]', drop)
    .on("head", {
      element: (el) => {
        el.append(`  ${tags(meta, url)}\n  `, { html: true });
      },
    })
    .transform(response);
  const res = new Response(out.body, out);
  // The body no longer matches the static asset's validators.
  res.headers.delete("ETag");
  res.headers.delete("Content-Length");
  return res;
}

export async function injectMeta(request: Request, response: Response, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    if (request.method !== "GET" || response.status !== 200) return response;
    if (!(response.headers.get("Content-Type") ?? "").includes("text/html")) return response;
    const url = new URL(request.url);
    const r = route(url.pathname);
    if (!r) return response;
    const meta = r.kind === "match" || r.kind === "team" || r.kind === "player" || r.kind === "stadium" ? await dynamicMeta(r, request, env, ctx) : staticMeta(r);
    return meta ? rewrite(response, meta, url) : response;
  } catch (err) {
    console.error("meta injection skipped", String(err));
    return response;
  }
}
