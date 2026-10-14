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
 * rosters) on a self-scheduling alarm, staying inside the Free plan's 50
 * sub-requests per invocation. Reads are served from SQLite as compact JSON.
 */

const DAY = 86400e3;
const MAX_FETCH = 40;
const LEAGUE_RE = /^[a-z]{2,6}\.[a-z0-9_]{1,20}$/;

interface Calendar {
  at: number;
  type: string;
  season: { year: number; name: string; start: string; end: string } | null;
  days: string[];
}

type Row = Record<string, SqlStorageValue>;

export class LeagueStore extends DurableObject<Env> {
  private sql: SqlStorage;
  private cache: { season?: string; people?: string } = {};

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS dates (d TEXT PRIMARY KEY, synced INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, n TEXT, s TEXT, ab TEXT, l TEXT, c TEXT);
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY, d TEXT, s TEXT, st TEXT, h TEXT, a TEXT,
        hs INTEGER, as_ INTEGER, hp INTEGER, ap INTEGER, v TEXT,
        ref TEXT, att INTEGER, hx REAL, ax REAL, hsh INTEGER, ash INTEGER,
        det INTEGER NOT NULL DEFAULT 0, tries INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS matches_d ON matches(d);
      CREATE TABLE IF NOT EXISTS events (m TEXT, i INTEGER, k TEXT, t TEXT, min INTEGER, p TEXT, pid TEXT, asn TEXT, aid TEXT, PRIMARY KEY (m, i));
      CREATE TABLE IF NOT EXISTS shots (m TEXT, i INTEGER, t TEXT, p TEXT, x REAL, y REAL, o TEXT, b TEXT, xg REAL, min TEXT, PRIMARY KEY (m, i));
      CREATE TABLE IF NOT EXISTS lineups (m TEXT, t TEXT, pid TEXT, n TEXT, pos TEXT, starter INTEGER, sub_in INTEGER, PRIMARY KEY (m, pid));
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, n TEXT, t TEXT, pos TEXT, posName TEXT, age INTEGER, dob TEXT, nat TEXT, flag TEXT, j TEXT, inj TEXT, updated INTEGER);
      CREATE TABLE IF NOT EXISTS h2h (k TEXT PRIMARY KEY, at INTEGER, v TEXT);
    `);
  }

  /* ------------------------------------------------------------ meta ---- */

  private getMeta<T>(k: string): T | null {
    const r = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = ?", k).toArray()[0];
    if (!r) return null;
    try {
      return JSON.parse(r.v) as T;
    } catch {
      return null;
    }
  }

  private setMeta(k: string, v: unknown) {
    this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, JSON.stringify(v));
  }

  private async ensure(slug: string) {
    if (!LEAGUE_RE.test(slug)) throw new Error("bad league");
    if (this.getMeta<string>("slug") !== slug) this.setMeta("slug", slug);
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) await this.ctx.storage.setAlarm(Date.now() + 500);
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
    const rows = this.sql
      .exec<Row>(
        `SELECT m, t, p, x, y, o, b, xg, min FROM shots WHERE (?1 IS NULL OR t = ?1) AND (?2 IS NULL OR p = ?2)`,
        team,
        player,
      )
      .toArray();
    const shots: SeasonShot[] = rows.map((r) => ({
      m: String(r.m),
      t: String(r.t),
      p: String(r.p),
      x: Number(r.x),
      y: Number(r.y),
      o: r.o as SeasonShot["o"],
      b: r.b as SeasonShot["b"],
      xg: Number(r.xg),
      min: String(r.min),
    }));
    return JSON.stringify({ league: slug, shots });
  }

  async match(slug: string, id: string): Promise<string> {
    await this.ensure(slug);
    const r = this.sql
      .exec<Row>(
        `SELECT m.*, th.n AS hn, th.l AS hl, th.c AS hc, ta.n AS an, ta.l AS al, ta.c AS ac
         FROM matches m LEFT JOIN teams th ON th.id = m.h LEFT JOIN teams ta ON ta.id = m.a WHERE m.id = ?`,
        id,
      )
      .toArray()[0];
    return JSON.stringify(r ?? null);
  }

  async h2h(slug: string, a: string, b: string): Promise<string> {
    await this.ensure(slug);
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return JSON.stringify({ games: [] });
    const key = [a, b].sort().join("-");
    const hit = this.sql.exec<{ at: number; v: string }>("SELECT at, v FROM h2h WHERE k = ?", key).toArray()[0];
    if (hit && Date.now() - Number(hit.at) < 12 * 3600e3) return hit.v;

    const cal = this.getMeta<Calendar>("cal");
    const year = cal?.season?.year ?? new Date().getUTCFullYear();
    const seasons = [year, year - 1, year - 2, year - 3, year - 4, year - 5];
    const games = new Map<string, unknown>();
    const results = await Promise.all(
      seasons.map((y) =>
        upstream<any>(`${ESPN_SITE}/${slug}/teams/${a}/schedule?season=${y}`).catch(() => null),
      ),
    );
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
    this.sql.exec("INSERT INTO h2h (k, at, v) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET at = excluded.at, v = excluded.v", key, Date.now(), v);
    return v;
  }

  /* ---------------------------------------------------------- builders -- */

  private buildSeason(slug: string): SeasonData {
    const cal = this.getMeta<Calendar>("cal");
    const teams = this.sql.exec<Row>("SELECT id, n, s, ab, l, c FROM teams").toArray().map(
      (r): SeasonTeam => ({ id: String(r.id), n: String(r.n), s: String(r.s), ab: String(r.ab ?? ""), l: String(r.l ?? ""), c: (r.c as string) ?? null }),
    );
    const matches = this.sql.exec<Row>("SELECT * FROM matches ORDER BY d").toArray().map(
      (r): SeasonMatch => ({
        id: String(r.id),
        d: String(r.d),
        s: r.s as SeasonMatch["s"],
        st: String(r.st ?? ""),
        h: String(r.h),
        a: String(r.a),
        hs: r.hs === null ? null : Number(r.hs),
        as: r.as_ === null ? null : Number(r.as_),
        hp: r.hp === null ? null : Number(r.hp),
        ap: r.ap === null ? null : Number(r.ap),
        v: String(r.v ?? ""),
        ref: (r.ref as string) ?? null,
        att: r.att === null ? null : Number(r.att),
        hx: r.hx === null ? null : Math.round(Number(r.hx) * 100) / 100,
        ax: r.ax === null ? null : Math.round(Number(r.ax) * 100) / 100,
        hsh: r.hsh === null ? null : Number(r.hsh),
        ash: r.ash === null ? null : Number(r.ash),
        det: Number(r.det) ? 1 : 0,
      }),
    );
    const events = this.sql.exec<Row>("SELECT * FROM events ORDER BY m, i").toArray().map(
      (r): SeasonEvent => ({
        m: String(r.m),
        k: r.k as SeasonEvent["k"],
        t: String(r.t),
        min: Number(r.min),
        p: String(r.p ?? ""),
        pid: (r.pid as string) ?? null,
        as: (r.asn as string) ?? null,
        aid: (r.aid as string) ?? null,
      }),
    );
    const count = (q: string) => Number(this.sql.exec<{ c: number }>(q).toArray()[0]?.c ?? 0);
    return {
      league: slug,
      season: cal?.season ?? null,
      teams,
      matches,
      events,
      seed: this.getMeta<Record<string, number>>("seed") ?? {},
      progress: {
        dates: count("SELECT COUNT(*) AS c FROM dates"),
        datesDone: count("SELECT COUNT(*) AS c FROM dates WHERE synced > 0"),
        details: count(`SELECT COUNT(*) AS c FROM matches WHERE s = 'post' AND st NOT LIKE '%POSTPONED%' AND st NOT LIKE '%CANCEL%'`),
        detailsDone: count("SELECT COUNT(*) AS c FROM matches WHERE det = 1"),
      },
      updated: Date.now(),
    };
  }

  private buildPeople(slug: string): PeopleData {
    const players = new Map<string, PersonRow>();
    const blank = (id: string, n: string, t: string): PersonRow => ({
      id, n, t, pos: "", posName: "", age: null, dob: null, nat: "", flag: "", j: "", inj: null,
      apps: 0, starts: 0, g: 0, a: 0, sh: 0, sot: 0, xg: 0, y: 0, r: 0, lpos: null,
    });
    for (const r of this.sql.exec<Row>("SELECT * FROM players").toArray()) {
      const p = blank(String(r.id), String(r.n), String(r.t));
      p.pos = String(r.pos ?? "");
      p.posName = String(r.posName ?? "");
      p.age = r.age === null ? null : Number(r.age);
      p.dob = (r.dob as string) ?? null;
      p.nat = String(r.nat ?? "");
      p.flag = String(r.flag ?? "");
      p.j = String(r.j ?? "");
      p.inj = (r.inj as string) ?? null;
      players.set(p.id, p);
    }
    // Appearances, starts and the most common starting position.
    const posCount = new Map<string, Map<string, number>>();
    for (const r of this.sql.exec<Row>("SELECT pid, n, t, pos, starter, sub_in FROM lineups").toArray()) {
      const id = String(r.pid);
      let p = players.get(id);
      if (!p) {
        p = blank(id, String(r.n), String(r.t));
        players.set(id, p);
      }
      const started = Number(r.starter) === 1;
      if (started || Number(r.sub_in) === 1) p.apps++;
      if (started) {
        p.starts++;
        const pos = String(r.pos ?? "");
        if (pos) {
          const m = posCount.get(id) ?? new Map<string, number>();
          m.set(pos, (m.get(pos) ?? 0) + 1);
          posCount.set(id, m);
        }
      }
    }
    for (const [id, m] of posCount) {
      const p = players.get(id);
      if (p) p.lpos = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    const byName = new Map<string, PersonRow>();
    for (const p of players.values()) byName.set(`${p.t}|${nameKey(p.n)}`, p);
    const find = (pid: string | null, name: string, team: string) =>
      (pid ? players.get(pid) : undefined) ?? byName.get(`${team}|${nameKey(name)}`);

    for (const r of this.sql.exec<Row>("SELECT k, t, p, pid, asn, aid FROM events").toArray()) {
      const k = String(r.k);
      const p = find((r.pid as string) ?? null, String(r.p ?? ""), String(r.t));
      if (k === "g" || k === "pg") {
        if (p) p.g++;
        if (r.asn) {
          const a = find((r.aid as string) ?? null, String(r.asn), String(r.t));
          if (a) a.a++;
        }
      } else if (k === "y") {
        if (p) p.y++;
      } else if (k === "r" || k === "yr") {
        if (p) p.r++;
      }
    }
    for (const r of this.sql.exec<Row>("SELECT t, p, o, xg FROM shots").toArray()) {
      const p = byName.get(`${r.t}|${nameKey(String(r.p))}`);
      if (!p) continue;
      p.sh++;
      if (r.o === "goal" || r.o === "saved") p.sot++;
      p.xg += Number(r.xg);
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
      next = await this.sync(slug);
    } catch (err) {
      console.error("sync failed", slug, String(err));
      next = 2 * 60e3;
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + next);
    }
  }

  private async sync(slug: string): Promise<number> {
    let budget = MAX_FETCH;
    const now = Date.now();
    let wrote = false;

    // 1. Calendar & season window.
    let cal = this.getMeta<Calendar>("cal");
    if (!cal || now - cal.at > 6 * 3600e3) {
      budget--;
      const data = await upstream<any>(`${ESPN_SITE}/${slug}/scoreboard`);
      const lg = data.leagues?.[0] ?? {};
      const raw = lg.calendar ?? [];
      const days = raw.filter((c: unknown) => typeof c === "string").map((c: string) => c.slice(0, 10).replace(/-/g, ""));
      const s = lg.season;
      cal = {
        at: now,
        type: lg.calendarType ?? (days.length ? "day" : "list"),
        season: s ? { year: Number(s.year), name: fixText(s.displayName), start: s.startDate, end: s.endDate } : null,
        days,
      };
      this.setMeta("cal", cal);
      for (const e of data.events ?? []) this.upsertMatch(normaliseEvent(e, lg, slug));
      wrote = true;
    }

    // 2. Candidate match-days.
    const today = ymdIn("America/New_York", now);
    const yesterday = ymdIn("America/New_York", now - DAY);
    const tomorrow = ymdIn("America/New_York", now + DAY);
    let candidates = cal.days;
    if (!candidates.length && cal.season) {
      const start = Date.parse(cal.season.start);
      const end = Math.min(Date.parse(cal.season.end), now + 150 * DAY);
      candidates = [];
      for (let t = start; t <= end; t += DAY) candidates.push(ymdIn("America/New_York", t));
    }
    for (const d of candidates) this.sql.exec("INSERT OR IGNORE INTO dates (d) VALUES (?)", d);

    const pick = (q: string, ...args: SqlStorageValue[]) => this.sql.exec<{ d: string }>(q, ...args).toArray().map((r) => r.d);
    const hot = pick(`SELECT d FROM dates WHERE d IN (?, ?, ?) AND synced < ?`, yesterday, today, tomorrow, now - 4 * 60e3);
    const pastNew = pick(`SELECT d FROM dates WHERE synced = 0 AND d < ? ORDER BY d DESC LIMIT 30`, today);
    const futureNew = pick(`SELECT d FROM dates WHERE synced = 0 AND d > ? ORDER BY d ASC LIMIT 30`, today);
    const staleFuture = pick(
      `SELECT d FROM dates WHERE d > ? AND synced > 0 AND synced < ? AND (n > 0 OR synced < ?) ORDER BY d ASC LIMIT 10`,
      tomorrow,
      now - 12 * 3600e3,
      now - 4 * DAY,
    );
    const pastOpen = pick(`SELECT d FROM dates WHERE d < ? AND done = 0 AND n > 0 AND synced < ? ORDER BY d DESC LIMIT 6`, yesterday, now - 6 * 3600e3);

    const queue: string[] = [];
    for (const d of [...hot, ...pastNew, ...futureNew, ...staleFuture, ...pastOpen]) {
      if (!queue.includes(d)) queue.push(d);
    }
    const summaryBudget = Math.min(6, Math.max(2, budget - queue.length));
    const dateBatch = queue.slice(0, Math.max(0, budget - summaryBudget - 1));
    budget -= dateBatch.length;

    await pool(dateBatch, 6, async (d) => {
      try {
        const data = await upstream<any>(`${ESPN_SITE}/${slug}/scoreboard?dates=${d}`);
        const lg = data.leagues?.[0] ?? {};
        const evs: WireMatch[] = (data.events ?? []).map((e: any) => normaliseEvent(e, lg, slug));
        for (const m of evs) this.upsertMatch(m);
        const done = evs.length === 0 ? (d < today ? 1 : 0) : evs.every((m) => m.state === "post") ? 1 : 0;
        this.sql.exec("UPDATE dates SET synced = ?, n = ?, done = ? WHERE d = ?", Date.now(), evs.length, done, d);
        wrote = true;
      } catch (err) {
        console.error("date failed", slug, d, String(err));
      }
    });

    // 3. Match details (referee, assists, lineups, shots).
    const pending = this.sql
      .exec<{ id: string; h: string; a: string }>(
        `SELECT id, h, a FROM matches WHERE s = 'post' AND det = 0 AND tries < 3
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
        this.sql.exec("UPDATE matches SET tries = tries + 1 WHERE id = ?", m.id);
        console.error("summary failed", slug, m.id, String(err));
      }
    });

    // 4. Squads, once a day, a few teams per run.
    const rosters = this.getMeta<{ at: number; done: string[] }>("rosters") ?? { at: 0, done: [] };
    if (now - rosters.at > DAY) {
      rosters.at = now;
      rosters.done = [];
    }
    const teamIds = this.sql.exec<{ id: string }>("SELECT id FROM teams ORDER BY id").toArray().map((r) => r.id);
    const todo = teamIds.filter((id) => !rosters.done.includes(id)).slice(0, Math.max(0, Math.min(4, budget - 1)));
    budget -= todo.length;
    await pool(todo, 4, async (id) => {
      try {
        const data = await upstream<any>(`${ESPN_SITE}/${slug}/teams/${id}/roster`);
        this.applyRoster(id, data);
        wrote = true;
      } catch (err) {
        console.error("roster failed", slug, id, String(err));
      }
      rosters.done.push(id);
    });
    this.setMeta("rosters", rosters);

    // 5. Previous-season strength, for rating seeds.
    if (!this.getMeta("seed") && cal.season && budget > 0) {
      budget--;
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
      } catch {
        this.setMeta("seed", {});
      }
      wrote = true;
    }

    if (wrote) this.cache = {};

    // Next run: quick while back-filling, calmer once complete.
    const backlog =
      Number(this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM dates WHERE synced = 0").toArray()[0]?.c ?? 0) +
      Number(
        this.sql
          .exec<{ c: number }>(
            `SELECT COUNT(*) AS c FROM matches WHERE s = 'post' AND det = 0 AND tries < 3 AND st NOT LIKE '%POSTPONED%' AND st NOT LIKE '%CANCEL%' AND st NOT LIKE '%ABANDON%'`,
          )
          .toArray()[0]?.c ?? 0,
      );
    if (backlog > 0 || teamIds.length > rosters.done.length) return 20e3;
    const soon = this.sql
      .exec<{ c: number }>(`SELECT COUNT(*) AS c FROM matches WHERE (s = 'in') OR (s = 'pre' AND d BETWEEN ? AND ?)`, new Date(now - 3 * 3600e3).toISOString(), new Date(now + 3 * 3600e3).toISOString())
      .toArray()[0]?.c;
    return Number(soon) > 0 ? 4 * 60e3 : 15 * 60e3;
  }

  private upsertMatch(m: WireMatch) {
    for (const s of [m.home, m.away]) {
      if (!s.id) continue;
      this.sql.exec(
        `INSERT INTO teams (id, n, s, ab, l, c) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET n = excluded.n, s = excluded.s, ab = excluded.ab, l = excluded.l, c = excluded.c`,
        s.id, s.name, s.short, s.abbr, s.logo, s.color,
      );
    }
    this.sql.exec(
      `INSERT INTO matches (id, d, s, st, h, a, hs, as_, hp, ap, v) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET d = excluded.d, s = excluded.s, st = excluded.st, h = excluded.h, a = excluded.a,
         hs = excluded.hs, as_ = excluded.as_, hp = excluded.hp, ap = excluded.ap, v = excluded.v`,
      m.id, m.date, m.state, m.statusName, m.home.id, m.away.id, m.home.score, m.away.score,
      m.home.shootout === null ? null : Number(m.home.shootout), m.away.shootout === null ? null : Number(m.away.shootout), m.venue,
    );
    const det = this.sql.exec<{ det: number }>("SELECT det FROM matches WHERE id = ?", m.id).toArray()[0]?.det;
    if (Number(det) === 1) return;
    this.sql.exec("DELETE FROM events WHERE m = ?", m.id);
    m.details.forEach((d, i) => {
      const k = d.kind === "goal" ? (d.ownGoal ? "og" : d.penalty ? "pg" : "g") : d.kind === "red" ? "r" : "y";
      this.sql.exec(
        "INSERT INTO events (m, i, k, t, min, p, pid, asn, aid) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)",
        m.id, i, k, d.teamId, minuteOf(d.clock), d.player,
      );
    });
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
    const rows: { k: string; t: string; min: number; p: string; pid: string | null; asn: string | null; aid: string | null }[] = [];
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
        rows.push({
          k: own ? "og" : pen ? "pg" : "g",
          t: team,
          min,
          p: fixText(p0?.displayName ?? ""),
          pid: p0?.id ? String(p0.id) : null,
          asn: !own && !pen && p1 ? fixText(p1.displayName) : null,
          aid: !own && !pen && p1?.id ? String(p1.id) : null,
        });
      } else if (/red-card/.test(type) || /red card/i.test(typeText)) {
        rows.push({
          k: /second yellow/i.test(text) || /yellow/i.test(typeText) ? "yr" : "r",
          t: String(k.team?.id ?? ""),
          min,
          p: fixText(p0?.displayName ?? ""),
          pid: p0?.id ? String(p0.id) : null,
          asn: null,
          aid: null,
        });
      } else if (/yellow-card/.test(type) || /yellow card/i.test(typeText)) {
        rows.push({ k: "y", t: String(k.team?.id ?? ""), min, p: fixText(p0?.displayName ?? ""), pid: p0?.id ? String(p0.id) : null, asn: null, aid: null });
      }
    }

    const names = (c: any) => [fixText(c?.team?.displayName ?? ""), fixText(c?.team?.shortDisplayName ?? ""), c?.team?.abbreviation ?? ""].filter(Boolean);
    const shots = extractShots(d.commentary ?? [], names(home), names(away));
    const hx = shots.filter((s) => s.side === "home").reduce((a, s) => a + s.xg, 0);
    const ax = shots.filter((s) => s.side === "away").reduce((a, s) => a + s.xg, 0);
    const hasShots = shots.length > 0;

    this.ctx.storage.transactionSync(() => {
      if (rows.length || (d.keyEvents ?? []).length) {
        this.sql.exec("DELETE FROM events WHERE m = ?", id);
        rows.forEach((r, i) =>
          this.sql.exec("INSERT INTO events (m, i, k, t, min, p, pid, asn, aid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, i, r.k, r.t, r.min, r.p, r.pid, r.asn, r.aid),
        );
      }
      this.sql.exec("DELETE FROM shots WHERE m = ?", id);
      shots.forEach((s, i) =>
        this.sql.exec(
          "INSERT INTO shots (m, i, t, p, x, y, o, b, xg, min) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          id, i, s.side === "home" ? homeId : awayId, s.player, s.x, s.y, s.outcome, s.body, Math.round(s.xg * 1000) / 1000, s.minute,
        ),
      );
      this.sql.exec("DELETE FROM lineups WHERE m = ?", id);
      for (const r of d.rosters ?? []) {
        const t = String(r.team?.id ?? "");
        for (const p of r.roster ?? []) {
          const pid = p.athlete?.id ? String(p.athlete.id) : null;
          if (!pid) continue;
          this.sql.exec(
            "INSERT OR REPLACE INTO lineups (m, t, pid, n, pos, starter, sub_in) VALUES (?, ?, ?, ?, ?, ?, ?)",
            id, t, pid, fixText(p.athlete?.displayName), p.position?.abbreviation ?? "", p.starter ? 1 : 0, p.subbedIn ? 1 : 0,
          );
        }
      }
      this.sql.exec(
        "UPDATE matches SET ref = ?, att = ?, hx = ?, ax = ?, hsh = ?, ash = ?, det = 1 WHERE id = ?",
        referee,
        attendance,
        hasShots ? hx : null,
        hasShots ? ax : null,
        hasShots ? shots.filter((s) => s.side === "home").length : null,
        hasShots ? shots.filter((s) => s.side === "away").length : null,
        id,
      );
    });
  }

  private applyRoster(teamId: string, d: any) {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      for (const a of d.athletes ?? []) {
        const id = a.id ? String(a.id) : null;
        if (!id) continue;
        const inj = a.injuries?.[0];
        const injText = inj ? fixText(inj.status ?? inj.type?.description ?? inj.details?.type ?? "Injured") : null;
        this.sql.exec(
          `INSERT INTO players (id, n, t, pos, posName, age, dob, nat, flag, j, inj, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET n = excluded.n, t = excluded.t, pos = excluded.pos, posName = excluded.posName, age = excluded.age,
             dob = excluded.dob, nat = excluded.nat, flag = excluded.flag, j = excluded.j, inj = excluded.inj, updated = excluded.updated`,
          id,
          fixText(a.displayName),
          teamId,
          String(a.position?.abbreviation ?? "").charAt(0).toUpperCase(),
          a.position?.displayName ?? "",
          a.age ?? null,
          a.dateOfBirth ?? null,
          fixText(a.citizenship ?? a.flag?.alt ?? ""),
          a.flag?.href ?? "",
          a.jersey ?? "",
          injText,
          now,
        );
      }
    });
  }
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
