import { DurableObject } from "cloudflare:workers";
import { minuteOf, normaliseEvent, type WireMatch } from "../shared/scoreboard";
import type { PeopleData, PersonRow, SeasonData, SeasonEvent, SeasonMatch, SeasonShot, SeasonTeam } from "../shared/season";
import { fixText, nameKey } from "../shared/text";
import { extractShots } from "../shared/xg";
import { ESPN_SITE, ESPN_V2, upstream, ymdIn, type Env } from "./common";

/**
 * LeagueStore — one Durable Object per competition.
 *
 * Builds a season database incrementally from ESPN (scoreboards per match-day,
 * match summaries for referees / assists / lineups / shot locations, squad
 * rosters) on a self-scheduling alarm, staying inside the Free plan's limits:
 *   • ≤ 50 sub-requests per invocation,
 *   • 100k SQLite row writes per day across all objects — so each match is ONE
 *     row (events, shots and lineups are JSON columns), each squad is one row,
 *     and rows are only written when something actually changed.
 */

const DAY = 86400e3;
const MAX_FETCH = 40;
const LEAGUE_RE = /^[a-z]{2,6}\.[a-z0-9_]{1,20}$/;
const QUOTA = /rows written|quota|exceeded/i;

interface Calendar {
  at: number;
  type: string;
  season: { year: number; name: string; start: string; end: string } | null;
  days: string[];
}

interface StoredEvent {
  k: SeasonEvent["k"];
  t: string;
  min: number;
  p: string;
  pid: string | null;
  as: string | null;
  aid: string | null;
}
interface StoredShot {
  t: string;
  p: string;
  x: number;
  y: number;
  o: SeasonShot["o"];
  b: SeasonShot["b"];
  xg: number;
  min: string;
}
interface StoredLineup {
  f: string | null;
  p: { id: string; n: string; pos: string; s: 0 | 1; in: 0 | 1 }[];
}
interface StoredPlayer {
  id: string;
  n: string;
  pos: string;
  posName: string;
  age: number | null;
  dob: string | null;
  nat: string;
  flag: string;
  j: string;
  inj: string | null;
}

type Row = Record<string, SqlStorageValue>;

const parse = <T>(v: SqlStorageValue | undefined, fallback: T): T => {
  if (typeof v !== "string" || !v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export class LeagueStore extends DurableObject<Env> {
  private sql: SqlStorage;
  private cache: { season?: string; people?: string } = {};
  /** Hot match-days fetched recently (memory only, so polling costs no writes). */
  private hotFetched = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      try {
        this.migrate();
      } catch (err) {
        // Writes can be refused (daily quota); reads must keep working.
        console.error("migrate failed", String(err));
      }
    });
  }

  private migrate() {
    const have = new Set(this.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map((r) => r.name));
    if (["meta2", "days", "clubs", "games", "squads", "pairs"].every((n) => have.has(n))) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta2 (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS days (d TEXT PRIMARY KEY, synced INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS clubs (id TEXT PRIMARY KEY, n TEXT, s TEXT, ab TEXT, l TEXT, c TEXT);
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY, d TEXT, s TEXT, st TEXT, h TEXT, a TEXT,
        hs INTEGER, as_ INTEGER, hp INTEGER, ap INTEGER, v TEXT,
        ref TEXT, att INTEGER, hx REAL, ax REAL, hsh INTEGER, ash INTEGER,
        det INTEGER NOT NULL DEFAULT 0, tries INTEGER NOT NULL DEFAULT 0,
        ev TEXT, sh TEXT, lu TEXT
      );
      CREATE INDEX IF NOT EXISTS games_d ON games(d);
      CREATE TABLE IF NOT EXISTS squads (t TEXT PRIMARY KEY, at INTEGER, v TEXT);
      CREATE TABLE IF NOT EXISTS pairs (k TEXT PRIMARY KEY, at INTEGER, v TEXT);
    `);
    // Tables from the earlier row-per-item schema are left in place: dropping them
    // would spend write quota for no benefit (they're simply no longer read).
  }

  private has(table: string): boolean {
    return this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = ?", table).toArray()[0]?.c > 0;
  }

  /* ------------------------------------------------------------ meta ---- */

  private getMeta<T>(k: string): T | null {
    try {
      const r = this.sql.exec<{ v: string }>("SELECT v FROM meta2 WHERE k = ?", k).toArray()[0];
      return r ? parse<T | null>(r.v, null) : null;
    } catch {
      return null;
    }
  }

  private setMeta(k: string, v: unknown) {
    const s = JSON.stringify(v);
    const cur = this.sql.exec<{ v: string }>("SELECT v FROM meta2 WHERE k = ?", k).toArray()[0]?.v;
    if (cur === s) return;
    this.sql.exec("INSERT INTO meta2 (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, s);
  }

  private async ensure(slug: string) {
    if (!LEAGUE_RE.test(slug)) throw new Error("bad league");
    try {
      if (!this.has("games")) this.migrate();
      if (this.getMeta<string>("slug") !== slug) this.setMeta("slug", slug);
      if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 500);
    } catch (err) {
      console.error("ensure failed", slug, String(err));
    }
  }

  /** Reads are skipped (empty) until the tables exist — e.g. while out of write quota. */
  private ready(): boolean {
    return this.has("games") && this.has("clubs");
  }

  /* ------------------------------------------------------------ RPC ----- */

  async kick(slug: string): Promise<void> {
    await this.ensure(slug);
  }

  async season(slug: string): Promise<string> {
    await this.ensure(slug);
    if (!this.cache.season) this.cache.season = JSON.stringify(this.buildSeason(slug));
    return this.cache.season;
  }

  async people(slug: string): Promise<string> {
    await this.ensure(slug);
    if (!this.cache.people) this.cache.people = JSON.stringify(this.buildPeople(slug));
    return this.cache.people;
  }

  async shots(slug: string, team: string | null, player: string | null): Promise<string> {
    await this.ensure(slug);
    const shots: SeasonShot[] = [];
    if (this.ready()) {
      for (const r of this.sql.exec<Row>("SELECT id, sh FROM games WHERE sh IS NOT NULL").toArray()) {
        for (const s of parse<StoredShot[]>(r.sh, [])) {
          if (team && s.t !== team) continue;
          if (player && s.p !== player) continue;
          shots.push({ m: String(r.id), ...s });
        }
      }
    }
    return JSON.stringify({ league: slug, shots });
  }

  async match(slug: string, id: string): Promise<string> {
    await this.ensure(slug);
    if (!this.ready()) return JSON.stringify(null);
    const r = this.sql
      .exec<Row>(
        `SELECT g.id, g.d, g.s, g.st, g.h, g.a, g.hs, g.as_, g.hp, g.ap, g.v, g.ref, g.att, g.hx, g.ax,
                th.n AS hn, th.l AS hl, th.c AS hc, ta.n AS an, ta.l AS al, ta.c AS ac
         FROM games g LEFT JOIN clubs th ON th.id = g.h LEFT JOIN clubs ta ON ta.id = g.a WHERE g.id = ?`,
        id,
      )
      .toArray()[0];
    return JSON.stringify(r ?? null);
  }

  /** A club's most recent starting XI (with formation) — the basis for projected lineups. */
  async lastLineup(slug: string, team: string): Promise<string> {
    await this.ensure(slug);
    if (!/^\d+$/.test(team) || !this.ready()) return JSON.stringify(null);
    const last = this.sql
      .exec<Row>(`SELECT id, d, h, a, lu FROM games WHERE (h = ?1 OR a = ?1) AND det = 1 AND lu IS NOT NULL ORDER BY d DESC LIMIT 6`, team)
      .toArray()
      .find((r) => (parse<Record<string, StoredLineup>>(r.lu, {})[team]?.p ?? []).some((p) => p.s));
    if (!last) return JSON.stringify(null);
    const lu = parse<Record<string, StoredLineup>>(last.lu, {})[team];
    const squad = new Map(this.squad(team).map((p) => [p.id, p]));
    const players = lu.p
      .filter((p) => p.s)
      .map((p) => ({ id: p.id, name: p.n, pos: p.pos, jersey: squad.get(p.id)?.j ?? "", inj: squad.get(p.id)?.inj ?? null, posName: squad.get(p.id)?.posName ?? "" }));
    const opp = last.h === team ? String(last.a) : String(last.h);
    const oppName = this.sql.exec<{ n: string }>("SELECT n FROM clubs WHERE id = ?", opp).toArray()[0]?.n ?? "";
    return JSON.stringify({ match: String(last.id), date: String(last.d), opponent: oppName, formation: lu.f, players });
  }

  async h2h(slug: string, a: string, b: string): Promise<string> {
    await this.ensure(slug);
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return JSON.stringify({ games: [] });
    const key = [a, b].sort().join("-");
    const cached = this.has("pairs") ? this.sql.exec<{ at: number; v: string }>("SELECT at, v FROM pairs WHERE k = ?", key).toArray()[0] : undefined;
    if (cached && Date.now() - Number(cached.at) < DAY) return cached.v;

    const cal = this.getMeta<Calendar>("cal");
    const year = cal?.season?.year ?? new Date().getUTCFullYear();
    const seasons = [year, year - 1, year - 2, year - 3, year - 4, year - 5];
    const games = new Map<string, unknown>();
    const results = await Promise.all(seasons.map((y) => upstream<any>(`${ESPN_SITE}/${slug}/teams/${a}/schedule?season=${y}`).catch(() => null)));
    for (const data of results) {
      for (const e of data?.events ?? []) {
        const comp = e.competitions?.[0];
        const cs = comp?.competitors ?? [];
        if (!cs.some((c: any) => String(c.team?.id ?? c.id) === b)) continue;
        if (!comp?.status?.type?.completed) continue;
        const home = cs.find((c: any) => c.homeAway === "home") ?? cs[0];
        const away = cs.find((c: any) => c.homeAway === "away") ?? cs[1];
        const score = (c: any) => {
          const s = c?.score;
          const v = typeof s === "object" && s ? s.value ?? s.displayValue : s;
          return v === undefined || v === null || v === "" ? null : Number(v);
        };
        games.set(String(e.id), {
          id: String(e.id),
          d: e.date,
          league: e.league?.abbreviation ?? e.seasonType?.name ?? "",
          h: String(home?.team?.id ?? ""),
          a: String(away?.team?.id ?? ""),
          hn: fixText(home?.team?.displayName),
          an: fixText(away?.team?.displayName),
          hl: home?.team?.logos?.[0]?.href ?? home?.team?.logo ?? "",
          al: away?.team?.logos?.[0]?.href ?? away?.team?.logo ?? "",
          hs: score(home),
          as: score(away),
        });
      }
    }
    const list = [...games.values()].sort((x: any, y: any) => String(y.d).localeCompare(String(x.d)));
    const v = JSON.stringify({ games: list });
    try {
      this.sql.exec("INSERT INTO pairs (k, at, v) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET at = excluded.at, v = excluded.v", key, Date.now(), v);
    } catch {
      /* the cache is optional */
    }
    return v;
  }

  /* ---------------------------------------------------------- builders -- */

  private squad(team: string): StoredPlayer[] {
    if (!this.has("squads")) return [];
    return parse<StoredPlayer[]>(this.sql.exec<{ v: string }>("SELECT v FROM squads WHERE t = ?", team).toArray()[0]?.v, []);
  }

  private buildSeason(slug: string): SeasonData {
    const cal = this.getMeta<Calendar>("cal");
    const empty: SeasonData = {
      league: slug,
      season: cal?.season ?? null,
      teams: [],
      matches: [],
      events: [],
      seed: {},
      progress: { dates: 0, datesDone: 0, details: 0, detailsDone: 0 },
      updated: Date.now(),
    };
    if (!this.ready()) return empty;
    const teams = this.sql.exec<Row>("SELECT id, n, s, ab, l, c FROM clubs").toArray().map(
      (r): SeasonTeam => ({ id: String(r.id), n: String(r.n), s: String(r.s), ab: String(r.ab ?? ""), l: String(r.l ?? ""), c: (r.c as string) ?? null }),
    );
    const rows = this.sql.exec<Row>("SELECT id, d, s, st, h, a, hs, as_, hp, ap, v, ref, att, hx, ax, hsh, ash, det, ev FROM games ORDER BY d").toArray();
    const num = (v: SqlStorageValue) => (v === null || v === undefined ? null : Number(v));
    const matches = rows.map(
      (r): SeasonMatch => ({
        id: String(r.id),
        d: String(r.d),
        s: r.s as SeasonMatch["s"],
        st: String(r.st ?? ""),
        h: String(r.h),
        a: String(r.a),
        hs: num(r.hs),
        as: num(r.as_),
        hp: num(r.hp),
        ap: num(r.ap),
        v: String(r.v ?? ""),
        ref: (r.ref as string) ?? null,
        att: num(r.att),
        hx: r.hx === null ? null : Math.round(Number(r.hx) * 100) / 100,
        ax: r.ax === null ? null : Math.round(Number(r.ax) * 100) / 100,
        hsh: num(r.hsh),
        ash: num(r.ash),
        det: Number(r.det) ? 1 : 0,
      }),
    );
    const events: SeasonEvent[] = [];
    for (const r of rows) for (const e of parse<StoredEvent[]>(r.ev, [])) events.push({ m: String(r.id), ...e });
    const count = (q: string) => Number(this.sql.exec<{ c: number }>(q).toArray()[0]?.c ?? 0);
    return {
      ...empty,
      teams,
      matches,
      events,
      seed: this.getMeta<Record<string, number>>("seed") ?? {},
      progress: {
        dates: count("SELECT COUNT(*) AS c FROM days"),
        datesDone: count("SELECT COUNT(*) AS c FROM days WHERE synced > 0"),
        details: count(`SELECT COUNT(*) AS c FROM games WHERE s = 'post' AND st NOT LIKE '%POSTPONED%' AND st NOT LIKE '%CANCEL%'`),
        detailsDone: count("SELECT COUNT(*) AS c FROM games WHERE det = 1"),
      },
    };
  }

  private buildPeople(slug: string): PeopleData {
    const players = new Map<string, PersonRow>();
    if (!this.ready()) return { league: slug, players: [], updated: Date.now() };
    const blank = (id: string, n: string, t: string): PersonRow => ({
      id, n, t, pos: "", posName: "", age: null, dob: null, nat: "", flag: "", j: "", inj: null,
      apps: 0, starts: 0, g: 0, a: 0, sh: 0, sot: 0, xg: 0, y: 0, r: 0, lpos: null,
    });
    if (this.has("squads")) {
      for (const r of this.sql.exec<{ t: string; v: string }>("SELECT t, v FROM squads").toArray()) {
        for (const sp of parse<StoredPlayer[]>(r.v, [])) {
          players.set(sp.id, { ...blank(sp.id, sp.n, String(r.t)), pos: sp.pos, posName: sp.posName, age: sp.age, dob: sp.dob, nat: sp.nat, flag: sp.flag, j: sp.j, inj: sp.inj });
        }
      }
    }
    const games = this.sql.exec<Row>("SELECT id, ev, sh, lu FROM games WHERE det = 1").toArray();
    const posCount = new Map<string, Map<string, number>>();
    for (const g of games) {
      for (const [t, lu] of Object.entries(parse<Record<string, StoredLineup>>(g.lu, {}))) {
        for (const lp of lu.p) {
          let p = players.get(lp.id);
          if (!p) {
            p = blank(lp.id, lp.n, t);
            players.set(lp.id, p);
          }
          if (lp.s || lp.in) p.apps++;
          if (lp.s) {
            p.starts++;
            if (lp.pos) {
              const m = posCount.get(lp.id) ?? new Map<string, number>();
              m.set(lp.pos, (m.get(lp.pos) ?? 0) + 1);
              posCount.set(lp.id, m);
            }
          }
        }
      }
    }
    for (const [id, m] of posCount) {
      const p = players.get(id);
      if (p) p.lpos = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    const byName = new Map<string, PersonRow>();
    for (const p of players.values()) byName.set(`${p.t}|${nameKey(p.n)}`, p);
    const find = (pid: string | null, name: string, team: string) => (pid ? players.get(pid) : undefined) ?? byName.get(`${team}|${nameKey(name)}`);

    for (const g of this.sql.exec<Row>("SELECT ev FROM games WHERE ev IS NOT NULL").toArray()) {
      for (const e of parse<StoredEvent[]>(g.ev, [])) {
        const p = find(e.pid, e.p, e.t);
        if (e.k === "g" || e.k === "pg") {
          if (p) p.g++;
          if (e.as) {
            const a = find(e.aid, e.as, e.t);
            if (a) a.a++;
          }
        } else if (e.k === "y") {
          if (p) p.y++;
        } else if (e.k === "r" || e.k === "yr") {
          if (p) p.r++;
        }
      }
    }
    for (const g of games) {
      for (const s of parse<StoredShot[]>(g.sh, [])) {
        const p = byName.get(`${s.t}|${nameKey(s.p)}`);
        if (!p) continue;
        p.sh++;
        if (s.o === "goal" || s.o === "saved") p.sot++;
        p.xg += s.xg;
      }
    }
    const list = [...players.values()].map((p) => ({ ...p, xg: Math.round(p.xg * 100) / 100 }));
    return { league: slug, players: list, updated: Date.now() };
  }

  /* -------------------------------------------------------------- sync -- */

  async alarm(): Promise<void> {
    const slug = this.getMeta<string>("slug");
    if (!slug) return;
    let next = 15 * 60e3;
    try {
      if (!this.ready()) this.migrate();
      next = await this.sync(slug);
    } catch (err) {
      const msg = String(err);
      console.error("sync failed", slug, msg);
      // Out of the daily write quota: back off until it resets.
      next = QUOTA.test(msg) ? 60 * 60e3 : 2 * 60e3;
    } finally {
      try {
        await this.ctx.storage.setAlarm(Date.now() + next);
      } catch {
        /* the cron trigger re-arms it */
      }
    }
  }

  private async sync(slug: string): Promise<number> {
    let budget = MAX_FETCH;
    const now = Date.now();
    let wrote = false;

    // 1. Calendar & season window (the only time new match-days are inserted).
    let cal = this.getMeta<Calendar>("cal");
    if (!cal || now - cal.at > 6 * 3600e3) {
      budget--;
      const data = await upstream<any>(`${ESPN_SITE}/${slug}/scoreboard`);
      const lg = data.leagues?.[0] ?? {};
      const days = (lg.calendar ?? []).filter((c: unknown) => typeof c === "string").map((c: string) => c.slice(0, 10).replace(/-/g, ""));
      const s = lg.season;
      cal = {
        at: now,
        type: lg.calendarType ?? (days.length ? "day" : "list"),
        season: s ? { year: Number(s.year), name: fixText(s.displayName), start: s.startDate, end: s.endDate } : null,
        days,
      };
      this.setMeta("cal", cal);
      let candidates = cal.days;
      if (!candidates.length && cal.season) {
        const start = Date.parse(cal.season.start);
        const end = Math.min(Date.parse(cal.season.end), now + 150 * DAY);
        candidates = [];
        for (let t = start; t <= end; t += DAY) candidates.push(ymdIn("America/New_York", t));
      }
      const known = new Set(this.sql.exec<{ d: string }>("SELECT d FROM days").toArray().map((r) => r.d));
      for (const d of candidates) if (!known.has(d)) this.sql.exec("INSERT INTO days (d) VALUES (?)", d);
      for (const e of data.events ?? []) wrote = this.upsertMatch(normaliseEvent(e, lg, slug)) || wrote;
    }

    // 2. Which match-days to fetch.
    const today = ymdIn("America/New_York", now);
    const yesterday = ymdIn("America/New_York", now - DAY);
    const tomorrow = ymdIn("America/New_York", now + DAY);
    const activeSoon =
      Number(
        this.sql
          .exec<{ c: number }>(
            `SELECT COUNT(*) AS c FROM games WHERE s = 'in' OR (s = 'pre' AND d BETWEEN ? AND ?)`,
            new Date(now - 3 * 3600e3).toISOString(),
            new Date(now + 3 * 3600e3).toISOString(),
          )
          .toArray()[0]?.c ?? 0,
      ) > 0;
    const hotEvery = activeSoon ? 4 * 60e3 : 30 * 60e3;
    const pick = (q: string, ...args: SqlStorageValue[]) => this.sql.exec<{ d: string }>(q, ...args).toArray().map((r) => r.d);
    const hot = [yesterday, today, tomorrow].filter((d) => now - (this.hotFetched.get(d) ?? 0) > hotEvery);
    const pastNew = pick(`SELECT d FROM days WHERE synced = 0 AND d < ? ORDER BY d DESC LIMIT 30`, today);
    const futureNew = pick(`SELECT d FROM days WHERE synced = 0 AND d > ? ORDER BY d ASC LIMIT 30`, today);
    const staleFuture = pick(
      `SELECT d FROM days WHERE d > ? AND synced > 0 AND synced < ? AND (n > 0 OR synced < ?) ORDER BY d ASC LIMIT 6`,
      tomorrow,
      now - DAY,
      now - 7 * DAY,
    );
    const pastOpen = pick(`SELECT d FROM days WHERE d < ? AND done = 0 AND n > 0 AND synced < ? ORDER BY d DESC LIMIT 4`, yesterday, now - 12 * 3600e3);

    const queue: string[] = [];
    for (const d of [...hot, ...pastNew, ...futureNew, ...staleFuture, ...pastOpen]) if (!queue.includes(d)) queue.push(d);
    const summaryBudget = Math.min(6, Math.max(2, budget - queue.length));
    const dateBatch = queue.slice(0, Math.max(0, budget - summaryBudget - 1));
    budget -= dateBatch.length;

    let quotaHit: unknown = null;
    await pool(dateBatch, 6, async (d) => {
      try {
        const data = await upstream<any>(`${ESPN_SITE}/${slug}/scoreboard?dates=${d}`);
        const lg = data.leagues?.[0] ?? {};
        const evs: WireMatch[] = (data.events ?? []).map((e: any) => normaliseEvent(e, lg, slug));
        for (const m of evs) wrote = this.upsertMatch(m) || wrote;
        if (d === yesterday || d === today || d === tomorrow) this.hotFetched.set(d, Date.now());
        const done = evs.length === 0 ? (d < today ? 1 : 0) : evs.every((m) => m.state === "post") ? 1 : 0;
        const cur = this.sql.exec<Row>("SELECT synced, n, done FROM days WHERE d = ?", d).toArray()[0];
        // Persist only meaningful changes: first sync, new counts, completion, or a daily touch.
        if (!cur || Number(cur.synced) === 0 || Number(cur.n) !== evs.length || Number(cur.done) !== done || Date.now() - Number(cur.synced) > DAY) {
          this.sql.exec(
            "INSERT INTO days (d, synced, n, done) VALUES (?, ?, ?, ?) ON CONFLICT(d) DO UPDATE SET synced = excluded.synced, n = excluded.n, done = excluded.done",
            d,
            Date.now(),
            evs.length,
            done,
          );
        }
      } catch (err) {
        if (QUOTA.test(String(err))) quotaHit = err;
        else console.error("date failed", slug, d, String(err));
      }
    });
    if (quotaHit) throw quotaHit;

    // 3. Match details (referee, assists, lineups, shots) — one row write per match.
    const pending = this.sql
      .exec<{ id: string; h: string; a: string }>(
        `SELECT id, h, a FROM games WHERE s = 'post' AND det = 0 AND tries < 3
           AND st NOT LIKE '%POSTPONED%' AND st NOT LIKE '%CANCEL%' AND st NOT LIKE '%ABANDON%'
         ORDER BY d DESC LIMIT ?`,
        Math.max(0, Math.min(summaryBudget, budget - 2)),
      )
      .toArray();
    budget -= pending.length;
    await pool(pending, 3, async (m) => {
      try {
        const data = await upstream<any>(`${ESPN_SITE}/${slug}/summary?event=${m.id}`);
        this.applySummary(m.id, m.h, m.a, data);
        wrote = true;
      } catch (err) {
        if (QUOTA.test(String(err))) {
          quotaHit = err;
          return;
        }
        try {
          this.sql.exec("UPDATE games SET tries = tries + 1 WHERE id = ?", m.id);
        } catch {
          /* ignore */
        }
        console.error("summary failed", slug, m.id, String(err));
      }
    });
    if (quotaHit) throw quotaHit;

    // 4. Squads: one row per club, refreshed every 3 days.
    const stale = this.sql
      .exec<{ id: string }>(
        "SELECT c.id FROM clubs c LEFT JOIN squads s ON s.t = c.id WHERE s.t IS NULL OR s.at < ? ORDER BY c.id LIMIT ?",
        now - 3 * DAY,
        Math.max(0, Math.min(4, budget - 1)),
      )
      .toArray()
      .map((r) => r.id);
    budget -= stale.length;
    await pool(stale, 4, async (id) => {
      try {
        const data = await upstream<any>(`${ESPN_SITE}/${slug}/teams/${id}/roster`);
        this.applyRoster(id, data);
        wrote = true;
      } catch (err) {
        if (QUOTA.test(String(err))) quotaHit = err;
        else console.error("roster failed", slug, id, String(err));
      }
    });
    if (quotaHit) throw quotaHit;

    // 5. Previous-season strength, for rating seeds (once).
    if (!this.getMeta("seed") && cal.season && budget > 0) {
      try {
        const data = await upstream<any>(`${ESPN_V2}/${slug}/standings?season=${cal.season.year - 1}`);
        const seed: Record<string, number> = {};
        const groups = data.children?.length ? data.children : [{ standings: data.standings }];
        for (const g of groups) {
          for (const e of g.standings?.entries ?? []) {
            const stat = (n: string) => Number(e.stats?.find((s: any) => s.name === n)?.value ?? 0);
            const gp = stat("gamesPlayed");
            if (gp > 0) seed[String(e.team?.id)] = Math.round((stat("points") / gp) * 1000) / 1000;
          }
        }
        this.setMeta("seed", seed);
      } catch (err) {
        if (QUOTA.test(String(err))) throw err;
        this.setMeta("seed", {});
      }
      wrote = true;
    }

    if (wrote) this.cache = {};

    const backlog =
      Number(this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM days WHERE synced = 0").toArray()[0]?.c ?? 0) +
      Number(
        this.sql
          .exec<{ c: number }>(
            `SELECT COUNT(*) AS c FROM games WHERE s = 'post' AND det = 0 AND tries < 3 AND st NOT LIKE '%POSTPONED%' AND st NOT LIKE '%CANCEL%' AND st NOT LIKE '%ABANDON%'`,
          )
          .toArray()[0]?.c ?? 0,
      );
    if (backlog > 0) return 30e3;
    return activeSoon ? 4 * 60e3 : 30 * 60e3;
  }

  /** Insert or update a match row; returns true only if something was written. */
  private upsertMatch(m: WireMatch): boolean {
    let wrote = false;
    for (const s of [m.home, m.away]) {
      if (!s.id) continue;
      const cur = this.sql.exec<Row>("SELECT n, s, ab, l, c FROM clubs WHERE id = ?", s.id).toArray()[0];
      if (!cur || cur.n !== s.name || cur.s !== s.short || cur.ab !== s.abbr || cur.l !== s.logo || (cur.c ?? null) !== s.color) {
        this.sql.exec(
          `INSERT INTO clubs (id, n, s, ab, l, c) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET n = excluded.n, s = excluded.s, ab = excluded.ab, l = excluded.l, c = excluded.c`,
          s.id, s.name, s.short, s.abbr, s.logo, s.color,
        );
        wrote = true;
      }
    }
    const hp = m.home.shootout === null ? null : Number(m.home.shootout);
    const ap = m.away.shootout === null ? null : Number(m.away.shootout);
    const cur = this.sql.exec<Row>("SELECT d, s, st, h, a, hs, as_, hp, ap, v, det, ev FROM games WHERE id = ?", m.id).toArray()[0];
    const det = cur ? Number(cur.det) : 0;
    // Scoreboard events are only kept until the full summary (with assists) is synced.
    const ev =
      det === 1
        ? ((cur!.ev as string | null) ?? null)
        : JSON.stringify(
            m.details.map(
              (d): StoredEvent => ({
                k: d.kind === "goal" ? (d.ownGoal ? "og" : d.penalty ? "pg" : "g") : d.kind === "red" ? "r" : "y",
                t: d.teamId,
                min: minuteOf(d.clock),
                p: d.player,
                pid: null,
                as: null,
                aid: null,
              }),
            ),
          );
    const same =
      !!cur &&
      cur.d === m.date &&
      cur.s === m.state &&
      cur.st === m.statusName &&
      cur.h === m.home.id &&
      cur.a === m.away.id &&
      (cur.hs ?? null) === m.home.score &&
      (cur.as_ ?? null) === m.away.score &&
      (cur.hp ?? null) === hp &&
      (cur.ap ?? null) === ap &&
      (cur.v ?? "") === m.venue &&
      (cur.ev ?? null) === ev;
    if (same) return wrote;
    this.sql.exec(
      `INSERT INTO games (id, d, s, st, h, a, hs, as_, hp, ap, v, ev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET d = excluded.d, s = excluded.s, st = excluded.st, h = excluded.h, a = excluded.a,
         hs = excluded.hs, as_ = excluded.as_, hp = excluded.hp, ap = excluded.ap, v = excluded.v, ev = excluded.ev`,
      m.id, m.date, m.state, m.statusName, m.home.id, m.away.id, m.home.score, m.away.score, hp, ap, m.venue, ev,
    );
    return true;
  }

  private applySummary(id: string, homeId: string, awayId: string, d: any) {
    const comp = d.header?.competitions?.[0] ?? {};
    const cs = comp.competitors ?? [];
    const home = cs.find((c: any) => c.homeAway === "home") ?? cs[0];
    const away = cs.find((c: any) => c.homeAway === "away") ?? cs[1];
    const homeName = fixText(home?.team?.displayName ?? "");
    const awayName = fixText(away?.team?.displayName ?? "");
    const official = (d.gameInfo?.officials ?? []).find((o: any) => /referee/i.test(o.position?.name ?? "") && !/assist|video|fourth/i.test(o.position?.name ?? ""));
    const referee = official ? fixText(official.displayName ?? official.fullName) : null;
    const attendance = Number(d.gameInfo?.attendance ?? 0) || null;

    // Key events → goals (with assists), cards. Credit goals from the running score in the text.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scoreRe = homeName && awayName ? new RegExp(`${esc(homeName)}\\s+(\\d+),\\s*${esc(awayName)}\\s+(\\d+)`) : null;
    let hs = 0;
    let as = 0;
    const events: StoredEvent[] = [];
    for (const k of d.keyEvents ?? []) {
      const type: string = k.type?.type ?? "";
      const typeText: string = k.type?.text ?? "";
      const text = fixText(k.text ?? "");
      const min = minuteOf(k.clock?.displayValue ?? "");
      const p0 = k.participants?.[0]?.athlete;
      const p1 = k.participants?.[1]?.athlete;
      if (k.shootout) continue;
      if (k.scoringPlay) {
        const own = /own/i.test(type) || /own goal/i.test(typeText) || /own goal/i.test(text);
        const pen = /penalty/i.test(type) || /penalty/i.test(typeText);
        let team = String(k.team?.id ?? "");
        const sm = scoreRe?.exec(text);
        if (sm) {
          const nh = Number(sm[1]);
          const na = Number(sm[2]);
          if (nh > hs) team = homeId;
          else if (na > as) team = awayId;
          hs = nh;
          as = na;
        }
        events.push({
          k: own ? "og" : pen ? "pg" : "g",
          t: team,
          min,
          p: fixText(p0?.displayName ?? ""),
          pid: p0?.id ? String(p0.id) : null,
          as: !own && !pen && p1 ? fixText(p1.displayName) : null,
          aid: !own && !pen && p1?.id ? String(p1.id) : null,
        });
      } else if (/red-card/.test(type) || /red card/i.test(typeText)) {
        events.push({ k: /second yellow/i.test(text) || /yellow/i.test(typeText) ? "yr" : "r", t: String(k.team?.id ?? ""), min, p: fixText(p0?.displayName ?? ""), pid: p0?.id ? String(p0.id) : null, as: null, aid: null });
      } else if (/yellow-card/.test(type) || /yellow card/i.test(typeText)) {
        events.push({ k: "y", t: String(k.team?.id ?? ""), min, p: fixText(p0?.displayName ?? ""), pid: p0?.id ? String(p0.id) : null, as: null, aid: null });
      }
    }

    const names = (c: any) => [fixText(c?.team?.displayName ?? ""), fixText(c?.team?.shortDisplayName ?? ""), c?.team?.abbreviation ?? ""].filter(Boolean);
    const shots = extractShots(d.commentary ?? [], names(home), names(away));
    const stored: StoredShot[] = shots.map((s) => ({
      t: s.side === "home" ? homeId : awayId,
      p: s.player,
      x: s.x,
      y: s.y,
      o: s.outcome,
      b: s.body,
      xg: Math.round(s.xg * 1000) / 1000,
      min: s.minute,
    }));
    const hx = shots.filter((s) => s.side === "home").reduce((a, s) => a + s.xg, 0);
    const ax = shots.filter((s) => s.side === "away").reduce((a, s) => a + s.xg, 0);
    const hasShots = shots.length > 0;

    const lineups: Record<string, StoredLineup> = {};
    for (const r of d.rosters ?? []) {
      const t = String(r.team?.id ?? "");
      if (!t) continue;
      lineups[t] = {
        f: r.formation ? String(r.formation) : null,
        p: (r.roster ?? [])
          .filter((p: any) => p.athlete?.id)
          .map((p: any) => ({ id: String(p.athlete.id), n: fixText(p.athlete.displayName), pos: p.position?.abbreviation ?? "", s: p.starter ? 1 : 0, in: p.subbedIn ? 1 : 0 })),
      };
    }

    const keep = events.length > 0 || (d.keyEvents ?? []).length > 0;
    this.sql.exec(
      `UPDATE games SET ref = ?, att = ?, hx = ?, ax = ?, hsh = ?, ash = ?, det = 1,
         ev = CASE WHEN ? = 1 THEN ? ELSE ev END, sh = ?, lu = ? WHERE id = ?`,
      referee,
      attendance,
      hasShots ? hx : null,
      hasShots ? ax : null,
      hasShots ? shots.filter((s) => s.side === "home").length : null,
      hasShots ? shots.filter((s) => s.side === "away").length : null,
      keep ? 1 : 0,
      JSON.stringify(events),
      hasShots ? JSON.stringify(stored) : null,
      Object.keys(lineups).length ? JSON.stringify(lineups) : null,
      id,
    );
  }

  private applyRoster(teamId: string, d: any) {
    const squad: StoredPlayer[] = (d.athletes ?? [])
      .filter((a: any) => a.id)
      .map((a: any) => {
        const inj = a.injuries?.[0];
        return {
          id: String(a.id),
          n: fixText(a.displayName),
          pos: String(a.position?.abbreviation ?? "").charAt(0).toUpperCase(),
          posName: a.position?.displayName ?? "",
          age: a.age ?? null,
          dob: a.dateOfBirth ?? null,
          nat: fixText(a.citizenship ?? a.flag?.alt ?? ""),
          flag: a.flag?.href ?? "",
          j: a.jersey ?? "",
          inj: inj ? fixText(inj.status ?? inj.type?.description ?? inj.details?.type ?? "Injured") : null,
        };
      });
    this.sql.exec(
      "INSERT INTO squads (t, at, v) VALUES (?, ?, ?) ON CONFLICT(t) DO UPDATE SET at = excluded.at, v = excluded.v",
      teamId,
      Date.now(),
      JSON.stringify(squad),
    );
  }
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
