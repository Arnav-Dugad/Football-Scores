import { nameKey } from "../shared/text";
import { TSDB, UA, UpstreamError, json, type Env } from "./common";

/* TheSportsDB + Wikipedia lookups: player photography, careers, honours,
   club imagery, venues and kits. Small payloads, cached in isolate memory
   and Workers KV so we stay inside TheSportsDB's free rate limit. */

const WIKI = "https://en.wikipedia.org/w/api.php";
const mem = new Map<string, { exp: number; data: unknown }>();

function memGet<T>(k: string): T | undefined {
  const hit = mem.get(k);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    mem.delete(k);
    return undefined;
  }
  return hit.data as T;
}
function memSet(k: string, data: unknown, ttl: number) {
  if (mem.size > 1500) mem.clear();
  mem.set(k, { exp: Date.now() + ttl * 1000, data });
}

async function getJSON<T = any>(url: string): Promise<T> {
  const hit = memGet<T>(url);
  if (hit !== undefined) return hit;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new UpstreamError(res.status);
  const text = await res.text();
  // TheSportsDB returns an HTML 404 page for unknown endpoints/ids.
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) throw new UpstreamError(404);
  const data = JSON.parse(text) as T;
  memSet(url, data, 6 * 3600);
  return data;
}

/** Cached JSON response backed by memory + KV. */
async function cached(env: Env, ctx: ExecutionContext, key: string, ttl: number, make: () => Promise<{ data: unknown; ttl?: number; store?: boolean }>) {
  const hit = memGet<unknown>(key) ?? (await env.PITCH_CACHE?.get(key, "json").catch(() => null));
  if (hit) {
    memSet(key, hit, 3600);
    return json(hit, 86400);
  }
  const out = await make();
  const life = out.ttl ?? ttl;
  memSet(key, out.data, Math.min(life, 86400));
  if (out.store !== false && env.PITCH_CACHE) {
    ctx.waitUntil(env.PITCH_CACHE.put(key, JSON.stringify(out.data), { expirationTtl: Math.max(60, life) }).catch(() => undefined));
  }
  return json(out.data, Math.min(life, 86400));
}

const strip = (s: string) => nameKey(s).replace(/\b(fc|afc|cf|sc|ac|ssc|as|club|de|the|calcio|football)\b/g, "").replace(/\s+/g, " ").trim();

/* -------------------------------------------------------------- players -- */

export interface PlayerInfo {
  name: string;
  tsdbId: string | null;
  cutout: string | null;
  photo: string | null;
  nationality: string | null;
  born: string | null;
  birthplace: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  foot: string | null;
  team: string | null;
  number: string | null;
  bio: string | null;
  source: "thesportsdb" | "wikipedia" | null;
}

async function wikiPhoto(name: string): Promise<{ photo: string; bio: string | null } | null> {
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
    const data = await getJSON<any>(`${WIKI}?${qs}`);
    const pages = Object.values<any>(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const surname = nameKey(name).split(" ").pop() ?? "";
    const pick = pages.find((p) => p.thumbnail?.source && /football|soccer/i.test(p.description ?? "") && nameKey(p.title ?? "").includes(surname));
    return pick ? { photo: pick.thumbnail.source, bio: pick.description ?? null } : null;
  } catch {
    return null;
  }
}

export async function player(url: URL, env: Env, ctx: ExecutionContext) {
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 80);
  const team = (url.searchParams.get("team") ?? "").trim().slice(0, 80);
  const full = url.searchParams.get("full") === "1";
  if (!name) return json({ error: "name required" }, 0, 400);

  return cached(env, ctx, `p3:${nameKey(name)}:${strip(team)}:${full ? 1 : 0}`, 7 * 86400, async () => {
    const info: PlayerInfo = {
      name, tsdbId: null, cutout: null, photo: null, nationality: null, born: null, birthplace: null,
      position: null, height: null, weight: null, foot: null, team: null, number: null, bio: null, source: null,
    };
    let rateLimited = false;
    try {
      const data = await getJSON<any>(`${TSDB}/searchplayers.php?p=${encodeURIComponent(name)}`);
      const target = nameKey(name);
      const teamN = strip(team);
      const best = (data.player ?? [])
        .filter((p: any) => p.strSport === "Soccer")
        .map((p: any) => {
          let s = 0;
          const pn = nameKey(p.strPlayer ?? "");
          if (pn === target) s += 5;
          else if (pn.includes(target) || target.includes(pn)) s += 2;
          const tn = strip(p.strTeam ?? "");
          if (teamN && tn && (tn.includes(teamN) || teamN.includes(tn))) s += 4;
          if (p.strStatus === "Active") s += 1;
          if (p.strCutout) s += 1;
          return { p, s };
        })
        .sort((a: any, b: any) => b.s - a.s)[0];
      if (best && best.s >= 2) {
        const p = best.p;
        info.tsdbId = p.idPlayer ?? null;
        info.cutout = p.strCutout || null;
        info.photo = p.strThumb || p.strRender || null;
        info.nationality = p.strNationality || null;
        info.born = p.dateBorn || null;
        info.position = p.strPosition || null;
        info.team = p.strTeam || null;
        info.source = "thesportsdb";
        if (full && p.idPlayer) {
          try {
            const d = await getJSON<any>(`${TSDB}/lookupplayer.php?id=${p.idPlayer}`);
            const x = d.players?.[0] ?? d.player?.[0];
            if (x) {
              info.height = x.strHeight || null;
              info.weight = x.strWeight || null;
              info.foot = x.strSide || null;
              info.birthplace = x.strBirthLocation || null;
              info.number = x.strNumber || null;
              info.bio = x.strDescriptionEN ? String(x.strDescriptionEN).slice(0, 1400) : null;
              info.photo = info.photo || x.strThumb || null;
              info.cutout = info.cutout || x.strCutout || null;
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
      const w = await wikiPhoto(name);
      if (w) {
        info.photo = w.photo;
        info.bio = info.bio ?? w.bio;
        info.source = "wikipedia";
      }
    }
    const found = !!(info.cutout || info.photo);
    return { data: info, ttl: rateLimited ? 120 : found ? 7 * 86400 : 86400, store: !rateLimited };
  });
}

/** Former clubs (with apps/goals) and honours for a TheSportsDB player id. */
export async function career(url: URL, env: Env, ctx: ExecutionContext) {
  const id = (url.searchParams.get("id") ?? "").replace(/\D/g, "");
  if (!id) return json({ error: "id required" }, 0, 400);
  return cached(env, ctx, `career:${id}`, 7 * 86400, async () => {
    const [former, honours] = await Promise.all([
      getJSON<any>(`${TSDB}/lookupformerteams.php?id=${id}`).catch(() => null),
      getJSON<any>(`${TSDB}/lookuphonours.php?id=${id}`).catch(() => null),
    ]);
    const clubs = (former?.formerteams ?? [])
      .filter((f: any) => f.strSport === "Soccer" || !f.strSport)
      .map((f: any) => ({
        team: f.strFormerTeam ?? "",
        badge: f.strBadge ?? f.strTeamBadge ?? "",
        joined: f.strJoined ?? "",
        departed: f.strDeparted ?? "",
        move: f.strMoveType ?? "",
        apps: f.intAppearances ? Number(f.intAppearances) : null,
        goals: f.intGoals ? Number(f.intGoals) : null,
      }))
      .sort((a: any, b: any) => String(a.joined).localeCompare(String(b.joined)));
    const trophies = (honours?.honours ?? []).map((h: any) => ({
      honour: h.strHonour ?? "",
      season: h.strSeason ?? "",
      team: h.strTeam ?? "",
      badge: h.strTeamBadge ?? "",
    }));
    return { data: { clubs, honours: trophies }, ttl: former || honours ? 7 * 86400 : 3600, store: !!(former || honours) };
  });
}

/* --------------------------------------------------------------- teams --- */

function dmsToDecimal(s: string | null | undefined): { lat: number; lon: number } | null {
  if (!s) return null;
  const parts = [...s.matchAll(/(\d+(?:\.\d+)?)°\s*(?:(\d+(?:\.\d+)?)[′'])?\s*(?:(\d+(?:\.\d+)?)[″"])?\s*([NSEW])/g)];
  if (parts.length >= 2) {
    const conv = (m: RegExpMatchArray) => {
      const v = Number(m[1]) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600;
      return /[SW]/.test(m[4]) ? -v : v;
    };
    const lat = parts.find((p) => /[NS]/.test(p[4]));
    const lon = parts.find((p) => /[EW]/.test(p[4]));
    if (lat && lon) return { lat: conv(lat), lon: conv(lon) };
  }
  const dec = /(-?\d+\.\d+)\s*[, ]\s*(-?\d+\.\d+)/.exec(s);
  return dec ? { lat: Number(dec[1]), lon: Number(dec[2]) } : null;
}

export async function team(url: URL, env: Env, ctx: ExecutionContext) {
  const espnId = (url.searchParams.get("id") ?? "").replace(/\D/g, "");
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 80);
  if (!name) return json({ error: "name required" }, 0, 400);
  return cached(env, ctx, `team4:${espnId}:${strip(name)}`, 7 * 86400, async () => {
    const search = async (q: string) =>
      ((await getJSON<any>(`${TSDB}/searchteams.php?t=${encodeURIComponent(q)}`)).teams ?? []).filter((t: any) => t.strSport === "Soccer");
    // Senior men's sides only — searches also return women's, reserve and youth teams.
    const senior = (list: any[]) =>
      list.filter(
        (t: any) =>
          t.strGender !== "Female" &&
          !/\b(women|wfc|ladies|femen|femin|frauen|u-?\d{2}|reserves?|ii|b team|academy|youth)\b/i.test(`${t.strTeam} ${t.strTeamAlternate ?? ""}`),
      );
    let teams = await search(name);
    const bare = (n: string) => n.replace(/\b(FC|AFC|CF|SC)\b/g, "").replace(/\s+/g, " ").trim();
    for (const alt of [bare(name), bare(name.replace(/\s*&\s*/g, " and "))]) {
      if (teams.some((x: any) => espnId && x.idESPN === espnId)) break;
      if (alt && alt !== name) teams = [...teams, ...(await search(alt))];
    }
    const t =
      teams.find((x: any) => espnId && x.idESPN === espnId) ??
      senior(teams).find((x: any) => strip(x.strTeam) === strip(name)) ??
      senior(teams).find((x: any) => String(x.strTeamAlternate ?? "").split(",").some((a: string) => strip(a) === strip(name)));
    // No confident match: say so rather than show another club's imagery.
    if (!t) return { data: { found: false }, ttl: 86400 };

    const [venueRes, kitRes] = await Promise.all([
      t.idVenue ? getJSON<any>(`${TSDB}/lookupvenue.php?id=${t.idVenue}`).catch(() => null) : null,
      getJSON<any>(`${TSDB}/lookupequipment.php?id=${t.idTeam}`).catch(() => null),
    ]);
    const venue = venueRes?.venues?.[0];
    const kits = (kitRes?.equipment ?? [])
      .filter((k: any) => k.strEquipment)
      .map((k: any) => ({ season: k.strSeason ?? "", type: k.strType ?? "", image: k.strEquipment }))
      .sort((a: any, b: any) => String(b.season).localeCompare(String(a.season)));
    const fanart = [t.strFanart1, t.strFanart2, t.strFanart3, t.strFanart4].filter(Boolean);
    return {
      data: {
        found: true,
        tsdbId: t.idTeam ?? null,
        idESPN: t.idESPN ?? null,
        name: t.strTeam,
        formed: t.intFormedYear || null,
        stadium: t.strStadium || venue?.strVenue || null,
        capacity: venue?.intCapacity || t.intStadiumCapacity || null,
        location: t.strLocation || venue?.strLocation || null,
        venueId: t.idVenue || null,
        stadiumPhoto: venue?.strThumb || venue?.strFanart1 || null,
        fanart,
        banner: t.strBanner || null,
        jersey: t.strEquipment || null,
        kits,
        website: t.strWebsite || null,
        description: t.strDescriptionEN ? String(t.strDescriptionEN).slice(0, 1600) : null,
      },
    };
  });
}

export async function venue(url: URL, env: Env, ctx: ExecutionContext) {
  const id = (url.searchParams.get("id") ?? "").replace(/\D/g, "");
  if (!id) return json({ error: "id required" }, 0, 400);
  return cached(env, ctx, `venue:${id}`, 14 * 86400, async () => {
    const v = (await getJSON<any>(`${TSDB}/lookupvenue.php?id=${id}`)).venues?.[0];
    if (!v) return { data: { found: false }, ttl: 86400 };
    return {
      data: {
        found: true,
        name: v.strVenue ?? "",
        alternate: v.strVenueAlternate ?? "",
        capacity: v.intCapacity ? Number(v.intCapacity) : null,
        opened: v.intFormedYear || null,
        cost: v.strCost || null,
        location: v.strLocation || null,
        country: v.strCountry || null,
        timezone: v.strTimezone || null,
        coords: dmsToDecimal(v.strMap),
        photos: [v.strThumb, v.strFanart1, v.strFanart2, v.strFanart3, v.strFanart4].filter(Boolean),
        logo: v.strLogo || null,
        description: v.strDescriptionEN ? String(v.strDescriptionEN).slice(0, 1800) : null,
        website: v.strWebsite || null,
      },
    };
  });
}
