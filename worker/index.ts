/**
 * Pitch — edge API.
 *
 * Serves the static SPA from ./dist and exposes a small, cached JSON API:
 *   /api/scores    aggregated + normalised scoreboards across leagues/dates
 *   /api/calendar  match-days per league (for the date strip)
 *   /api/espn/*    allow-listed passthrough to ESPN's public soccer API
 *   /api/player    real player photography (TheSportsDB cutouts → Wikipedia)
 *   /api/team      club imagery & facts (fan art, stadium photo, founded…)
 */

interface Env {
  ASSETS: Fetcher;
  /** Durable cache for player/club lookups (keeps us inside TheSportsDB's rate limit). */
  PITCH_CACHE?: KVNamespace;
}

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_V2 = "https://site.api.espn.com/apis/v2/sports/soccer";
const ESPN_WEB = "https://site.web.api.espn.com/apis/common/v3/sports/soccer";
const TSDB = "https://www.thesportsdb.com/api/v1/json/123";
const WIKI = "https://en.wikipedia.org/w/api.php";
const UA = "PitchFootball/2.0 (https://github.com/Arnav-Dugad/Football-Scores)";

const LEAGUE_RE = /^[a-z]{2,6}\.[a-z0-9_]{1,20}$/;

class UpstreamError extends Error {
  constructor(public status: number) {
    super(`upstream ${status}`);
  }
}

/* ---------------------------------------------------------------- cache -- */

const mem = new Map<string, { exp: number; data: unknown }>();

function memGet<T>(key: string): T | undefined {
  const hit = mem.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    mem.delete(key);
    return undefined;
  }
  return hit.data as T;
}

function memSet(key: string, data: unknown, ttl: number) {
  if (mem.size > 800) {
    // Drop the oldest quarter — Map preserves insertion order.
    let i = 0;
    for (const k of mem.keys()) {
      if (i++ > 200) break;
      mem.delete(k);
    }
  }
  mem.set(key, { exp: Date.now() + ttl * 1000, data });
}

/** Fetch JSON with an isolate-memory cache in front of the Cache API. */
async function getJSON<T = any>(url: string, ttl: number, ctx: ExecutionContext): Promise<T> {
  const cached = memGet<T>(url);
  if (cached !== undefined) return cached;

  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(url);
  let res = await cache.match(key).catch(() => undefined);
  if (!res) {
    const up = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!up.ok) throw new UpstreamError(up.status);
    const body = await up.text();
    res = new Response(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    });
    ctx.waitUntil(cache.put(key, res.clone()).catch(() => undefined));
  }
  const data = (await res.json()) as T;
  memSet(url, data, ttl);
  return data;
}

function json(data: unknown, maxAge: number, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/* ------------------------------------------------------------- helpers --- */

/** ESPN sometimes double-encodes UTF-8 ("AraÃºjo"). Repair when detectable. */
function fixText(s: string | undefined): string {
  if (!s) return "";
  if (!/[ÃÂ][\u0080-ÿ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return s;
  }
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|ssc|as|club|de|the|calcio|football)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/* --------------------------------------------------------- scoreboards --- */

function normaliseEvent(e: any, league: any, slug: string) {
  const comp = e.competitions?.[0] ?? {};
  const st = e.status ?? comp.status ?? {};
  const side = (c: any) => {
    if (!c) return null;
    const t = c.team ?? {};
    return {
      id: t.id,
      name: fixText(t.displayName),
      short: fixText(t.shortDisplayName || t.displayName),
      abbr: t.abbreviation,
      logo: t.logo || t.logos?.[0]?.href || "",
      color: t.color ? `#${t.color}` : null,
      altColor: t.alternateColor ? `#${t.alternateColor}` : null,
      score: c.score === undefined || st.type?.state === "pre" ? null : Number(c.score),
      shootout: c.shootoutScore ?? null,
      winner: !!c.winner,
      form: c.form || "",
      record: c.records?.[0]?.summary || "",
    };
  };
  const competitors = comp.competitors ?? [];
  const home = competitors.find((c: any) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c: any) => c.homeAway === "away") ?? competitors[1];

  const details = (comp.details ?? [])
    .map((d: any) => ({
      kind: d.redCard ? "red" : d.yellowCard ? "yellow" : d.scoringPlay ? "goal" : "other",
      clock: d.clock?.displayValue ?? "",
      teamId: d.team?.id,
      player: fixText(d.athletesInvolved?.[0]?.displayName),
      penalty: !!d.penaltyKick,
      ownGoal: !!d.ownGoal,
    }))
    .filter((d: any) => d.kind !== "other");

  return {
    id: e.id,
    league: {
      slug,
      name: league?.name ?? slug,
      abbr: league?.abbreviation ?? "",
      logo: league?.logos?.[0]?.href ?? "",
    },
    date: e.date,
    state: st.type?.state ?? "pre",
    completed: !!st.type?.completed,
    status: st.type?.shortDetail ?? "",
    statusName: st.type?.name ?? "",
    clock: st.displayClock ?? "",
    period: st.period ?? 0,
    venue: fixText(comp.venue?.fullName),
    city: fixText(comp.venue?.address?.city),
    note: fixText(comp.notes?.[0]?.headline || comp.altGameNote || ""),
    home: side(home),
    away: side(away),
    details,
  };
}

async function scores(url: URL, ctx: ExecutionContext) {
  const dates = (url.searchParams.get("dates") ?? "")
    .split(",")
    .filter((d) => /^\d{8}$/.test(d))
    .slice(0, 3);
  const leagues = (url.searchParams.get("leagues") ?? "")
    .split(",")
    .filter((l) => LEAGUE_RE.test(l))
    .slice(0, 14);
  if (!leagues.length) return json({ error: "leagues required" }, 0, 400);

  const today = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const yesterday = ymd(new Date(today.getTime() - 36 * 3600e3));

  const jobs = leagues.flatMap((l) => (dates.length ? dates : [""]).map((d) => ({ l, d })));
  const results = await pool(jobs, 8, async ({ l, d }) => {
    const ttl = d && d < yesterday ? 3600 : 20;
    try {
      const data = await getJSON(`${ESPN_SITE}/${l}/scoreboard${d ? `?dates=${d}` : ""}`, ttl, ctx);
      const league = data.leagues?.[0];
      return (data.events ?? []).map((e: any) => normaliseEvent(e, league, l));
    } catch {
      return [];
    }
  });

  const seen = new Set<string>();
  const events = results.flat().filter((e: any) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  const live = events.some((e: any) => e.state === "in");
  return json({ events, updated: new Date().toISOString() }, live ? 15 : 30);
}

async function calendar(url: URL, ctx: ExecutionContext) {
  const leagues = (url.searchParams.get("leagues") ?? "")
    .split(",")
    .filter((l) => LEAGUE_RE.test(l))
    .slice(0, 14);
  const out: Record<string, string[]> = {};
  await pool(leagues, 8, async (l) => {
    try {
      const data = await getJSON(`${ESPN_SITE}/${l}/scoreboard`, 3 * 3600, ctx);
      const cal = data.leagues?.[0]?.calendar ?? [];
      out[l] = cal
        .filter((c: unknown) => typeof c === "string")
        .map((c: string) => c.slice(0, 10));
    } catch {
      out[l] = [];
    }
  });
  return json({ days: out }, 3 * 3600);
}

/* ------------------------------------------------------- espn passthru --- */

function espnTarget(path: string): { url: string; ttl: number } | null {
  if (!/^[a-z0-9./_-]+$/i.test(path) || path.includes("..")) return null;
  const [base, ...rest] = path.split("/");
  const tail = rest.join("/");
  let root: string;
  if (base === "site") root = ESPN_SITE;
  else if (base === "v2") root = ESPN_V2;
  else if (base === "web") root = ESPN_WEB;
  else return null;
  if (!LEAGUE_RE.test(rest[0] ?? "")) return null;

  let ttl = 300;
  if (/\/summary$/.test(tail)) ttl = 15;
  else if (/\/scoreboard$/.test(tail)) ttl = 20;
  else if (/\/standings$/.test(tail)) ttl = 300;
  else if (/\/(statistics|news)$/.test(tail)) ttl = 900;
  else if (/\/(roster|schedule)$/.test(tail)) ttl = 1800;
  else if (/\/athletes\//.test(tail)) ttl = 3600;
  else if (/\/teams(\/\d+)?$/.test(tail)) ttl = 3600;
  return { url: `${root}/${tail}`, ttl };
}

async function espnProxy(path: string, url: URL, ctx: ExecutionContext) {
  const target = espnTarget(path);
  if (!target) return json({ error: "not allowed" }, 0, 400);
  const qs = new URLSearchParams();
  for (const k of ["event", "dates", "season", "limit", "level", "region", "lang", "contentorigin", "fixture"]) {
    const v = url.searchParams.get(k);
    if (v && /^[a-z0-9,._-]{1,40}$/i.test(v)) qs.set(k, v);
  }
  const q = qs.toString();
  try {
    const data = await getJSON(target.url + (q ? `?${q}` : ""), target.ttl, ctx);
    if (path.endsWith("/summary") && data && typeof data === "object") {
      // Drop heavy sections the UI never reads (commentary alone is ~60% of the payload).
      const { commentary, odds, pickcenter, videos, news, article, broadcasts, meta, ...lean } = data as Record<string, unknown>;
      void [commentary, odds, pickcenter, videos, news, article, broadcasts, meta];
      return json(lean, target.ttl);
    }
    return json(data, target.ttl);
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 502;
    return json({ error: "upstream", status }, 5, status === 404 ? 404 : 502);
  }
}

/* ------------------------------------------------------------- players --- */

interface PlayerInfo {
  name: string;
  cutout: string | null;
  photo: string | null;
  nationality: string | null;
  born: string | null;
  position: string | null;
  height: string | null;
  team: string | null;
  number: string | null;
  bio: string | null;
  source: "thesportsdb" | "wikipedia" | null;
}

async function wikiPhoto(name: string, ctx: ExecutionContext): Promise<{ photo: string; bio: string | null } | null> {
  const qs = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${name} footballer`,
    gsrlimit: "4",
    prop: "pageimages|description",
    piprop: "thumbnail",
    pithumbsize: "640",
    origin: "*",
  });
  try {
    const data = await getJSON<any>(`${WIKI}?${qs}`, 7 * 86400, ctx);
    const pages = Object.values<any>(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const surname = norm(name).split(" ").pop() ?? "";
    const pick = pages.find(
      (p) =>
        p.thumbnail?.source &&
        /football|soccer/i.test(p.description ?? "") &&
        norm(p.title ?? "").includes(surname),
    );
    return pick ? { photo: pick.thumbnail.source, bio: pick.description ?? null } : null;
  } catch {
    return null;
  }
}

async function player(url: URL, env: Env, ctx: ExecutionContext) {
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 80);
  const team = (url.searchParams.get("team") ?? "").trim().slice(0, 80);
  const full = url.searchParams.get("full") === "1";
  if (!name) return json({ error: "name required" }, 0, 400);

  const key = `player:${norm(name)}:${norm(team)}:${full ? 1 : 0}`;
  const hit = memGet<PlayerInfo>(key) ?? ((await env.PITCH_CACHE?.get(key, "json").catch(() => null)) as PlayerInfo | null);
  if (hit) {
    memSet(key, hit, 86400);
    return json(hit, 86400);
  }

  const info: PlayerInfo = {
    name,
    cutout: null,
    photo: null,
    nationality: null,
    born: null,
    position: null,
    height: null,
    team: null,
    number: null,
    bio: null,
    source: null,
  };
  let rateLimited = false;

  try {
    const data = await getJSON<any>(
      `${TSDB}/searchplayers.php?p=${encodeURIComponent(name)}`,
      7 * 86400,
      ctx,
    );
    const target = norm(name);
    const teamN = norm(team);
    const candidates = (data.player ?? []).filter((p: any) => p.strSport === "Soccer");
    const scored = candidates
      .map((p: any) => {
        let s = 0;
        const pn = norm(p.strPlayer ?? "");
        if (pn === target) s += 5;
        else if (pn.includes(target) || target.includes(pn)) s += 2;
        const tn = norm(p.strTeam ?? "");
        if (teamN && tn && (tn.includes(teamN) || teamN.includes(tn))) s += 4;
        if (p.strStatus === "Active") s += 1;
        if (p.strCutout) s += 1;
        return { p, s };
      })
      .sort((a: any, b: any) => b.s - a.s);
    const best = scored[0]?.s >= 2 ? scored[0].p : null;
    if (best) {
      info.cutout = best.strCutout || null;
      info.photo = best.strThumb || best.strRender || null;
      info.nationality = best.strNationality || null;
      info.born = best.dateBorn || null;
      info.position = best.strPosition || null;
      info.team = best.strTeam || null;
      info.source = "thesportsdb";
      if (full && best.idPlayer) {
        try {
          const d = await getJSON<any>(`${TSDB}/lookupplayer.php?id=${best.idPlayer}`, 7 * 86400, ctx);
          const p = d.players?.[0] ?? d.player?.[0];
          if (p) {
            info.height = p.strHeight || null;
            info.number = p.strNumber || null;
            info.bio = p.strDescriptionEN ? String(p.strDescriptionEN).slice(0, 900) : null;
            info.photo = info.photo || p.strThumb || null;
            info.cutout = info.cutout || p.strCutout || null;
          }
        } catch {
          /* optional */
        }
      }
    }
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 429) rateLimited = true;
  }

  if (!info.cutout && !info.photo) {
    const w = await wikiPhoto(name, ctx);
    if (w) {
      info.photo = w.photo;
      info.bio = info.bio ?? w.bio;
      info.source = "wikipedia";
    }
  }

  const found = !!(info.cutout || info.photo);
  const ttl = rateLimited ? 120 : found ? 7 * 86400 : 86400;
  memSet(key, info, ttl);
  if (!rateLimited && env.PITCH_CACHE) {
    ctx.waitUntil(env.PITCH_CACHE.put(key, JSON.stringify(info), { expirationTtl: ttl }).catch(() => undefined));
  }
  return json(info, rateLimited ? 60 : found ? 86400 : 3600);
}

/* --------------------------------------------------------------- teams --- */

async function team(url: URL, env: Env, ctx: ExecutionContext) {
  const espnId = (url.searchParams.get("id") ?? "").replace(/\D/g, "");
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 80);
  if (!name) return json({ error: "name required" }, 0, 400);

  const key = `team:${espnId}:${norm(name)}`;
  const hit = memGet<unknown>(key) ?? (await env.PITCH_CACHE?.get(key, "json").catch(() => null));
  if (hit) return json(hit, 86400);
  const remember = (data: unknown) => {
    memSet(key, data, 7 * 86400);
    if (env.PITCH_CACHE) {
      ctx.waitUntil(env.PITCH_CACHE.put(key, JSON.stringify(data), { expirationTtl: 7 * 86400 }).catch(() => undefined));
    }
    return json(data, 86400);
  };

  try {
    let data = await getJSON<any>(`${TSDB}/searchteams.php?t=${encodeURIComponent(name)}`, 7 * 86400, ctx);
    let teams = (data.teams ?? []).filter((t: any) => t.strSport === "Soccer");
    if (!teams.length) {
      const simple = name.replace(/\b(FC|AFC|CF|SC)\b/g, "").trim();
      if (simple && simple !== name) {
        data = await getJSON<any>(`${TSDB}/searchteams.php?t=${encodeURIComponent(simple)}`, 7 * 86400, ctx);
        teams = (data.teams ?? []).filter((t: any) => t.strSport === "Soccer");
      }
    }
    const t =
      teams.find((x: any) => espnId && x.idESPN === espnId) ??
      teams.find((x: any) => norm(x.strTeam) === norm(name)) ??
      teams[0];
    if (!t) return remember({ found: false });

    let stadiumPhoto: string | null = null;
    if (t.idVenue) {
      try {
        const v = await getJSON<any>(`${TSDB}/lookupvenue.php?id=${t.idVenue}`, 7 * 86400, ctx);
        const venue = v.venues?.[0];
        stadiumPhoto = venue?.strThumb || venue?.strFanart1 || null;
      } catch {
        /* optional */
      }
    }

    const fanart = [t.strFanart1, t.strFanart2, t.strFanart3, t.strFanart4].filter(Boolean);
    return remember({
        found: true,
        name: t.strTeam,
        formed: t.intFormedYear || null,
        stadium: t.strStadium || null,
        capacity: t.intStadiumCapacity || null,
        location: t.strLocation || null,
        stadiumPhoto,
        fanart,
        banner: t.strBanner || null,
        jersey: t.strEquipment || null,
        website: t.strWebsite || null,
        description: t.strDescriptionEN ? String(t.strDescriptionEN).slice(0, 1200) : null,
      });
  } catch {
    return json({ found: false }, 300);
  }
}

/* -------------------------------------------------------------- router --- */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "GET") return json({ error: "method" }, 0, 405);

    try {
      const p = url.pathname;
      if (p === "/api/scores") return await scores(url, ctx);
      if (p === "/api/calendar") return await calendar(url, ctx);
      if (p === "/api/player") return await player(url, env, ctx);
      if (p === "/api/team") return await team(url, env, ctx);
      if (p.startsWith("/api/espn/")) return await espnProxy(p.slice("/api/espn/".length), url, ctx);
      return json({ error: "not found" }, 0, 404);
    } catch (err) {
      return json({ error: String(err) }, 0, 500);
    }
  },
} satisfies ExportedHandler<Env>;
