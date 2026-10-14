import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { DurableObject } from "cloudflare:workers";
import satori, { init as initSatori, type Font } from "satori/standalone";
import yogaWasm from "satori/yoga.wasm";
import { normaliseEvent, type WireMatch } from "../../shared/scoreboard";
import type { PeopleData, SeasonData } from "../../shared/season";
import { fixText } from "../../shared/text";
import { ESPN_SITE, UA, upstream, type Env } from "../common";
import { brandCard, H, leagueCard, matchCard, playerCard, teamCard, W, type El, type Images } from "./cards";
import {
  homeVenue,
  hubStub,
  kickoff,
  leagueName,
  leagueStub,
  LIVE_CLOCK,
  matchFacts,
  playerFacts,
  playerFromPeople,
  statusLabel,
  teamFacts,
  teamFromSeason,
  type MatchFacts,
  type PlayerFacts,
  type TeamFacts,
} from "./data";
import { crestUrl, leagueLogoUrl, LEAGUE_FACTS } from "./leagues";
import { fromWire, leaguesFeed, teamFeed, type WidgetFeed, type WidgetMatch } from "./widget";

/**
 * Renderer — CPU-heavy platform work, kept off the Worker's 10 ms budget:
 *   • Open Graph cards (satori → SVG → resvg → PNG), cached in SQLite by content
 *   • link-preview metadata for shared pages
 *   • the widget feed (parses the hub snapshot and the season dataset)
 *
 * Sharded by name: `og:<league>` for cards & metadata, `widget` for the feed.
 */

export type OgKind = "match" | "team" | "player" | "league" | "brand";
export type MetaKind = "match" | "team" | "player" | "stadium";

export interface PageMeta {
  title: string;
  description: string;
  image: string; // site-relative
  alt: string;
  ttl: number; // seconds the Worker may reuse this
}

export interface RenderResult {
  png: Uint8Array | null;
  maxAge: number;
}

/** Bump to invalidate every cached card after a design change. */
const CARD_VERSION = "c2";
const FONT_BASE = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.8/files";
const FONT_FILES: { weight: 500 | 700 | 800; subset: string }[] = [
  { weight: 500, subset: "latin" },
  { weight: 700, subset: "latin" },
  { weight: 800, subset: "latin" },
  { weight: 500, subset: "latin-ext" },
  { weight: 700, subset: "latin-ext" },
  { weight: 800, subset: "latin-ext" },
];
const DAY = 86400;

let wasmReady: Promise<void> | null = null;
function bootWasm(): Promise<void> {
  wasmReady ??= Promise.all([initSatori(yogaWasm), initWasm(resvgWasm)])
    .then(() => undefined)
    .catch((err) => {
      wasmReady = null;
      throw err;
    });
  return wasmReady;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function imageType(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf.slice(0, 4));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  return null;
}

/** Route ESPN images through the resizing combiner so we embed ~200px, not 500px+. */
function sizedImage(url: string, w: number, h = w): string | null {
  const m = /^https:\/\/a\.espncdn\.com(\/i\/[\w/.-]+\.png)$/.exec(url);
  if (m) return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${w}&h=${h}`;
  return /^https:\/\/a\.espncdn\.com\/combiner\/i\?img=/.test(url) ? url : null;
}

export class Renderer extends DurableObject<Env> {
  private sql: SqlStorage;
  private mem = new Map<string, { exp: number; v: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  private fonts: Font[] | null = null;
  private writes = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS blobs (k TEXT PRIMARY KEY, v BLOB NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL)`);
  }

  /* ------------------------------------------------------------ RPC ----- */

  async render(kind: OgKind, league: string, id: string): Promise<RenderResult> {
    if (kind === "brand") return this.card(`brand`, 7 * DAY, () => brandCard(), []);
    if (!LEAGUE_FACTS[league]) return { png: null, maxAge: 60 };
    const leagueImg = { key: `league:${league}`, url: leagueLogoUrl(league, 200) };
    const fallback = () => this.card(`league:${league}`, 7 * DAY, (img) => leagueCard(league, img), [leagueImg]);

    if (kind === "league") return fallback();
    if (kind === "match") {
      const m = await this.matchData(league, id);
      if (!m) return fallback();
      const key = `match:${league}:${id}:${m.state}:${m.status}:${m.hs}-${m.as}:${m.hp}-${m.ap}:${LIVE_CLOCK(m)}:${m.date}`;
      const maxAge = m.state === "in" ? 60 : m.state === "pre" ? 1800 : DAY;
      return this.card(key, maxAge, (img) => matchCard(m, img), [
        leagueImg,
        { key: `crest:${m.home.id}`, url: m.home.logo || crestUrl(m.home.id) },
        { key: `crest:${m.away.id}`, url: m.away.logo || crestUrl(m.away.id) },
      ]);
    }
    if (kind === "team") {
      const t = await this.teamData(league, id);
      if (!t) return fallback();
      const venue = homeVenue(await this.season(league).catch(() => null), id);
      const key = `team:${league}:${id}:${t.standing}:${t.record}:${t.points}:${venue}`;
      return this.card(key, 6 * 3600, (img) => teamCard(t, img, venue), [leagueImg, { key: `crest:${t.id}`, url: t.logo }]);
    }
    if (kind === "player") {
      const p = await this.playerData(league, id);
      if (!p) return fallback();
      const key = `player:${league}:${id}:${p.team?.id ?? ""}:${p.age ?? ""}`;
      const imgs = [leagueImg];
      if (p.team) imgs.push({ key: `crest:${p.team.id}`, url: p.team.logo });
      if (p.headshot) imgs.push({ key: `photo:${p.id}`, url: p.headshot });
      return this.card(key, DAY, (img) => playerCard(p, img), imgs);
    }
    return { png: null, maxAge: 60 };
  }

  /**
   * Link-preview metadata. Crawlers get an answer fast: memory, then SQLite
   * (served even when stale while a refresh runs), and only a cold page waits
   * for upstream data.
   */
  async meta(kind: MetaKind, league: string, id: string): Promise<string> {
    if (!LEAGUE_FACTS[league]) return "null";
    const key = `meta:${kind}:${league}:${id}`;
    const hot = this.mem.get(key);
    if (hot && hot.exp > Date.now()) return hot.v as string;
    const row = this.sql.exec<{ v: string; exp: number }>("SELECT v, exp FROM meta WHERE k = ?", key).toArray()[0];
    const refresh = () =>
      this.dedupe(key, async () => {
        const meta = await this.buildMeta(kind, league, id);
        const v = JSON.stringify(meta);
        const ttl = meta?.ttl ?? 60;
        this.remember(key, v, Math.min(ttl, 300));
        if (meta) {
          this.sql.exec(
            "INSERT INTO meta (k, v, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp",
            key,
            v,
            Date.now() + ttl * 1000,
          );
          if (++this.writes % 50 === 0) this.sql.exec("DELETE FROM meta WHERE exp < ?", Date.now() - 7 * DAY * 1000);
        }
        return v;
      });
    if (row) {
      if (Number(row.exp) <= Date.now()) void refresh().catch(() => undefined);
      else this.remember(key, row.v, 60);
      return row.v;
    }
    return refresh();
  }

  async widget(team: string | null, league: string | null, leagues: string[]): Promise<string> {
    const key = team ? `w:t:${league}:${team}` : `w:l:${leagues.join(",")}`;
    return this.memo(key, 15, async () => {
      const snap = [...(await this.snapshot()).values()];
      let feed: WidgetFeed;
      if (team && league) {
        const season = await this.season(league).catch(() => null);
        feed = teamFeed(team, league, snap, season);
        if (feed.mode === "team" && (!feed.team || (!feed.live && !feed.next && !feed.last))) feed = await this.teamFallback(team, league, feed);
      } else {
        feed = leaguesFeed(leagues, snap);
      }
      return JSON.stringify(feed);
    });
  }

  /* ---------------------------------------------------------- data ------ */

  private snapshot(): Promise<Map<string, WireMatch>> {
    return this.memo("snapshot", 15, async () => {
      const body = JSON.parse(await hubStub(this.env).snapshot()) as { events?: WireMatch[] };
      return new Map((body.events ?? []).map((m) => [m.id, m]));
    });
  }

  private season(league: string): Promise<SeasonData> {
    return this.memo(`season:${league}`, 120, async () => JSON.parse(await leagueStub(this.env, league).season(league)) as SeasonData);
  }

  private async matchData(league: string, id: string): Promise<MatchFacts | null> {
    const hit = this.mem.get(`match:${league}:${id}`);
    if (hit && hit.exp > Date.now()) return hit.v as MatchFacts | null;
    return this.dedupe(`match:${league}:${id}`, async () => {
      const m = await matchFacts(this.env, league, id, () => this.snapshot());
      const ttl = !m ? 60 : m.state === "post" ? 900 : m.state === "in" ? 20 : 120;
      this.remember(`match:${league}:${id}`, m, ttl);
      return m;
    });
  }

  private people(league: string): Promise<PeopleData> {
    return this.memo(`people:${league}`, 600, async () => JSON.parse(await leagueStub(this.env, league).people(league)) as PeopleData);
  }

  /** Local season data first (fast, no upstream); ESPN only when it can't answer. */
  private teamData(league: string, id: string): Promise<TeamFacts | null> {
    return this.memo(`team:${league}:${id}`, 1800, async () => {
      const season = await this.season(league).catch(() => null);
      return teamFromSeason(season, league, id) ?? (await teamFacts(league, id));
    });
  }

  private playerData(league: string, id: string): Promise<PlayerFacts | null> {
    return this.memo(`player:${league}:${id}`, 6 * 3600, async () => {
      const [people, season] = await Promise.all([this.people(league).catch(() => null), this.season(league).catch(() => null)]);
      return playerFromPeople(people, season, league, id) ?? (await playerFacts(league, id));
    });
  }

  /** Team not in the season dataset yet: ESPN's team endpoint knows the next fixture. */
  private async teamFallback(teamId: string, league: string, feed: Extract<WidgetFeed, { mode: "team" }>): Promise<WidgetFeed> {
    try {
      const d = await upstream<any>(`${ESPN_SITE}/${league}/teams/${teamId}`, 6000);
      const t = d?.team;
      if (!t?.displayName) return feed;
      const team = feed.team ?? {
        id: teamId,
        league,
        name: fixText(t.displayName),
        short: fixText(t.shortDisplayName || t.displayName),
        abbr: t.abbreviation ?? "",
        logo: t.logos?.[0]?.href ?? crestUrl(teamId, 96),
        color: t.color ? `#${t.color}` : null,
        url: `/team/${league}/${teamId}`,
      };
      let next: WidgetMatch | null = feed.next;
      const ev = t.nextEvent?.[0];
      const comp = ev?.competitions?.[0];
      const slug = typeof ev?.league === "string" ? ev.league : ev?.league?.slug;
      if (!next && comp && typeof slug === "string" && LEAGUE_FACTS[slug]) {
        const wire = normaliseEvent({ id: ev.id, date: ev.date, competitions: [comp] }, { name: leagueName(slug) }, slug);
        next = wire.state === "pre" ? fromWire(wire) : null;
      }
      return { ...feed, team, next };
    } catch {
      return feed;
    }
  }

  /* ---------------------------------------------------------- meta ------ */

  private async buildMeta(kind: MetaKind, league: string, id: string): Promise<PageMeta | null> {
    const comp = leagueName(league);
    if (kind === "match") {
      const m = await this.matchData(league, id);
      if (!m) return null;
      const k = kickoff(m.date, league);
      const at = m.venue ? ` at ${m.venue}` : "";
      let title: string;
      let description: string;
      if (m.state === "pre") {
        title = `${m.home.name} vs ${m.away.name} — ${comp}`;
        description = /POSTPONED|CANCEL/.test(m.status)
          ? `${statusLabel(m)}. ${comp}${at}.`
          : `Kick-off ${k.day}, ${k.time} ${k.zone}${at}. Lineups, form, head-to-head and where to watch on Pitch.`;
      } else {
        const live = m.state === "in";
        const s = `${m.home.name} ${m.hs ?? 0}–${m.as ?? 0} ${m.away.name}`;
        title = live ? `LIVE ${LIVE_CLOCK(m)} · ${s}` : `${s} · ${comp}`;
        description = `${statusLabel(m)}${at} · ${comp}, ${k.day}. Timeline, lineups, stats and xG on Pitch.`;
      }
      const v = `${m.state}${m.hs ?? ""}${m.as ?? ""}${LIVE_CLOCK(m).replace(/\D/g, "")}`;
      return {
        title,
        description,
        image: `/api/og/match/${league}/${id}.png?v=${v}`,
        alt: `${m.home.name} vs ${m.away.name}`,
        ttl: m.state === "in" ? 20 : m.state === "pre" ? 120 : 600,
      };
    }
    if (kind === "team" || kind === "stadium") {
      const t = await this.teamData(league, id);
      if (!t) return null;
      const v = `${t.points ?? ""}${t.record.replace(/\D/g, "")}`;
      if (kind === "stadium") {
        const venue = homeVenue(await this.season(league).catch(() => null), id);
        return {
          title: venue ? `${venue} — home of ${t.name}` : `${t.name} stadium`,
          description: venue
            ? `${venue}, home of ${t.name}: location, upcoming matches and club details on Pitch.`
            : `The home ground of ${t.name}: location, upcoming matches and club details on Pitch.`,
          image: `/api/og/team/${league}/${id}.png?v=${v}`,
          alt: t.name,
          ttl: 3600,
        };
      }
      const bits = [t.standing, t.record && (t.points !== null ? `${t.record}, ${t.points} pts` : t.record)].filter(Boolean).join(" · ");
      return {
        title: `${t.name} — fixtures, results & squad`,
        description: `${bits ? `${bits}. ` : ""}Fixtures, results, squad, stats and news for ${t.name} on Pitch.`,
        image: `/api/og/team/${league}/${id}.png?v=${v}`,
        alt: t.name,
        ttl: 900,
      };
    }
    if (kind === "player") {
      const p = await this.playerData(league, id);
      if (!p) return null;
      const bits = [p.position, p.team?.name, p.nationality, p.age ? `age ${p.age}` : ""].filter(Boolean).join(" · ");
      return {
        title: p.team ? `${p.name} — ${p.team.name}` : p.name,
        description: `${bits ? `${bits}. ` : ""}Season stats, shot map and career for ${p.name} on Pitch.`,
        image: `/api/og/player/${league}/${id}.png?v=${p.team?.id ?? ""}`,
        alt: p.name,
        ttl: 3600,
      };
    }
    return null;
  }

  /* --------------------------------------------------------- render ----- */

  private async card(key: string, maxAge: number, build: (images: Images) => El, images: { key: string; url: string }[]): Promise<RenderResult> {
    const k = `png:${CARD_VERSION}:${key}`;
    const hit = this.sql.exec<{ v: ArrayBuffer }>("SELECT v FROM blobs WHERE k = ?", k).toArray()[0];
    if (hit) return { png: new Uint8Array(hit.v), maxAge };
    const png = await this.dedupe(k, async () => {
      const [, fonts, resolved] = await Promise.all([bootWasm(), this.loadFonts(), this.resolveImages(images)]);
      const svg = await satori(build(resolved) as unknown as Parameters<typeof satori>[0], { width: W, height: H, fonts });
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: false } });
      const rendered = resvg.render();
      const out = rendered.asPng();
      rendered.free();
      resvg.free();
      this.put(k, out);
      return out;
    });
    return { png, maxAge };
  }

  private async loadFonts(): Promise<Font[]> {
    if (this.fonts) return this.fonts;
    return this.dedupe("fonts", async () => {
      const fonts = await Promise.all(
        FONT_FILES.map(async ({ weight, subset }) => {
          const k = `font:inter-${subset}-${weight}`;
          const row = this.sql.exec<{ v: ArrayBuffer }>("SELECT v FROM blobs WHERE k = ?", k).toArray()[0];
          let data = row?.v;
          if (!data) {
            const res = await fetch(`${FONT_BASE}/inter-${subset}-${weight}-normal.woff`, {
              headers: { "User-Agent": UA },
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`font ${res.status}`);
            data = await res.arrayBuffer();
            this.put(k, data);
          }
          return { name: "Inter", data, weight, style: "normal" as const };
        }),
      );
      this.fonts = fonts;
      return fonts;
    });
  }

  private async resolveImages(list: { key: string; url: string }[]): Promise<Images> {
    const out: Images = {};
    await Promise.all(
      list.map(async ({ key, url }) => {
        const src = key.startsWith("photo:") ? sizedImage(url, 440, 320) : sizedImage(url, key.startsWith("league:") ? 200 : 240);
        if (!src) return;
        const k = `img:${src}`;
        const row = this.sql.exec<{ v: ArrayBuffer; at: number }>("SELECT v, at FROM blobs WHERE k = ?", k).toArray()[0];
        let buf: ArrayBuffer | null = row && Date.now() - Number(row.at) < 14 * DAY * 1000 ? row.v : null;
        if (!buf) {
          try {
            const res = await fetch(src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
            const len = Number(res.headers.get("Content-Length") ?? 0);
            if (res.ok && len < 1_500_000) {
              const data = await res.arrayBuffer();
              if (data.byteLength < 1_500_000 && imageType(data)) {
                buf = data;
                this.put(k, data);
              }
            }
          } catch {
            /* missing image → initials */
          }
          buf ??= row?.v ?? null;
        }
        const type = buf ? imageType(buf) : null;
        if (buf && type) out[key] = `data:${type};base64,${toBase64(buf)}`;
      }),
    );
    return out;
  }

  /* ---------------------------------------------------------- cache ----- */

  private put(k: string, v: ArrayBuffer | Uint8Array) {
    this.sql.exec("INSERT INTO blobs (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at", k, v, Date.now());
    if (++this.writes % 25 === 0) {
      // Keep the newest 300 cards and images; fonts are kept forever.
      this.sql.exec(
        `DELETE FROM blobs WHERE k NOT LIKE 'font:%' AND k NOT IN (SELECT k FROM blobs WHERE k NOT LIKE 'font:%' ORDER BY at DESC LIMIT 300)`,
      );
    }
  }

  private remember(key: string, v: unknown, ttl: number) {
    this.mem.set(key, { exp: Date.now() + ttl * 1000, v });
    if (this.mem.size > 500) {
      const now = Date.now();
      for (const [k, e] of this.mem) if (e.exp < now) this.mem.delete(k);
      if (this.mem.size > 400) this.mem.clear();
    }
  }

  private memo<T>(key: string, ttl: number, make: () => Promise<T>): Promise<T> {
    const hit = this.mem.get(key);
    if (hit && hit.exp > Date.now()) return Promise.resolve(hit.v as T);
    return this.dedupe(key, async () => {
      const v = await make();
      this.remember(key, v, ttl);
      return v;
    });
  }

  private dedupe<T>(key: string, make: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const p = make().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
