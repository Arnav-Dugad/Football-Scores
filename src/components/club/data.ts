/* Data layer for the club and stadium pages: one merged game list per club
   (season store + ESPN team schedule), a guarded TheSportsDB lookup, squad
   rows joined with season player stats, and small time helpers. */

import { useEffect, useMemo, useState } from "react";
import type { PeopleData, PersonRow, SeasonData, SeasonMatch } from "../../../shared/season";
import { endpoints, fixText, normaliseRoster, normaliseSchedule, normaliseStandings, type TeamInfo } from "../../lib/api";
import { rounds, table, teamMap } from "../../lib/analytics";
import { useApi } from "../../lib/hooks";
import { usePeople, useSeason } from "../../lib/season";

/* ------------------------------------------------------------ team core -- */

export interface ClubCore {
  id: string;
  name: string;
  short: string;
  abbr: string;
  logo: string;
  color: string | null;
  alt: string | null;
  summary: string;
}

export function parseTeam(d: any, id: string): ClubCore | null {
  const t = d?.team;
  if (!t || !t.displayName) return null;
  const hex = (c: unknown) => (typeof c === "string" && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : null);
  return {
    id: String(t.id ?? id),
    name: fixText(t.displayName),
    short: fixText(t.shortDisplayName || t.displayName),
    abbr: t.abbreviation ?? "",
    logo: t.logos?.[0]?.href ?? t.logo ?? "",
    color: hex(t.color),
    alt: hex(t.alternateColor),
    summary: fixText(t.standingSummary ?? ""),
  };
}

export function useClubCore(league: string, id: string) {
  const q = useApi<any>(id ? endpoints.team(league, id) : null);
  const core = useMemo(() => parseTeam(q.data, id), [q.data, id]);
  return { ...q, core };
}

/* ------------------------------------------------ TheSportsDB guard ----- */

const NOISE = new Set([
  "fc", "afc", "cf", "sc", "ac", "as", "ssc", "club", "de", "del", "the", "calcio", "football", "cd", "ud", "sd", "rc", "rcd",
  "ca", "and", "of", "1", "sv", "vfb", "vfl", "tsg", "fk", "sk", "if", "bk", "us", "ssd", "cfc", "sporting",
]);
const WOMEN = /\b(women|womens|wfc|ladies|femenino|feminino|feminile|femminile|frauen|feminin|feminines|w)\b/;
const RESERVE = /\b(ii|b|2|u17|u18|u19|u20|u21|u23|reserves?|academy|youth|juniors?)\b/;

function words(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return words(s)
    .split(" ")
    .filter((w) => w && !NOISE.has(w));
}

/** Whether every token of `a` is matched (equal or prefix, ≥3 chars) by a token of `b`. */
function covered(a: string[], b: string[]): boolean {
  if (!a.length) return false;
  return a.every((x) => b.some((y) => x === y || (x.length >= 3 && y.length >= 3 && (y.startsWith(x) || x.startsWith(y)))));
}

/**
 * TheSportsDB's search sometimes returns a different side (a women's or
 * reserve team, or a namesake club). Accept the lookup only when the names
 * genuinely agree, so we never show another club's stadium or kit.
 */
export function trustedInfo(info: TeamInfo | undefined, espnName: string): TeamInfo | null {
  if (!info || !info.found || !info.name || !espnName) return null;
  const a = words(espnName);
  const b = words(info.name);
  if (WOMEN.test(b) !== WOMEN.test(a)) return null;
  if (RESERVE.test(b) && !RESERVE.test(a)) return null;
  const ta = tokens(espnName);
  const tb = tokens(info.name);
  if (a === b || covered(ta, tb) || covered(tb, ta)) return info;
  return null;
}

export function useTeamInfo(core: ClubCore | null) {
  const q = useApi<TeamInfo>(core ? endpoints.teamInfo(core.id, core.name) : null);
  const info = useMemo(() => (core ? trustedInfo(q.data, core.name) : null), [q.data, core]);
  return { info, loading: !!core && q.loading, error: q.error, reload: q.reload };
}

export interface VenueInfo {
  found: boolean;
  name?: string;
  alternate?: string;
  capacity?: number | null;
  opened?: string | null;
  cost?: string | null;
  location?: string | null;
  country?: string | null;
  timezone?: string | null;
  coords?: { lat: number; lon: number } | null;
  photos?: string[];
  logo?: string | null;
  description?: string | null;
  website?: string | null;
}

/* ------------------------------------------------------- merged games --- */

export interface GameSide {
  id: string;
  name: string;
  short: string;
  logo: string;
  score: number | null;
}

export interface ClubGame {
  id: string;
  date: string;
  slug: string;
  comp: string;
  state: "pre" | "in" | "post";
  /** Postponed, cancelled, abandoned… */
  void: boolean;
  status: string;
  home: GameSide;
  away: GameSide;
  venue: string;
  att: number | null;
  hx: number | null;
  ax: number | null;
}

const VOID = /POSTPONED|CANCEL|ABANDON|SUSPEND|FORFEIT|DELAYED/;
const STATE_RANK = { pre: 0, in: 1, post: 2 } as const;

function fromSeason(m: SeasonMatch, season: SeasonData, slug: string, comp: string): ClubGame {
  const teams = teamMap(season);
  const side = (tid: string, score: number | null): GameSide => {
    const t = teams.get(tid);
    return { id: tid, name: t?.n ?? "", short: t?.s ?? t?.n ?? "", logo: t?.l ?? "", score };
  };
  const pre = m.s === "pre";
  return {
    id: m.id,
    date: m.d,
    slug,
    comp,
    state: m.s,
    void: VOID.test(m.st),
    status: m.st,
    home: side(m.h, pre ? null : m.hs),
    away: side(m.a, pre ? null : m.as),
    venue: m.v ?? "",
    att: m.att ?? null,
    hx: m.hx,
    ax: m.ax,
  };
}

function fromEspn(raw: any, league: string): ClubGame[] {
  if (!raw) return [];
  const extra = new Map<string, { venue: string; status: string; att: number | null }>();
  for (const e of raw.events ?? []) {
    const c = e.competitions?.[0] ?? {};
    extra.set(String(e.id), {
      venue: fixText(c.venue?.fullName ?? ""),
      status: c.status?.type?.name ?? e.status?.type?.name ?? "",
      att: typeof c.attendance === "number" && c.attendance > 0 ? c.attendance : null,
    });
  }
  return normaliseSchedule(raw)
    .filter((g) => g.id && g.date && g.home?.id && g.away?.id)
    .map((g) => {
      const x = extra.get(String(g.id));
      const score = (n: number | null) => (n == null || Number.isNaN(n) ? null : n);
      return {
        id: String(g.id),
        date: g.date,
        slug: g.leagueSlug || league,
        comp: g.league,
        state: g.state,
        void: VOID.test(x?.status ?? ""),
        status: x?.status ?? g.status,
        home: { id: String(g.home.id), name: g.home.name, short: g.home.short, logo: g.home.logo, score: score(g.home.score) },
        away: { id: String(g.away.id), name: g.away.name, short: g.away.short, logo: g.away.logo, score: score(g.away.score) },
        venue: x?.venue ?? "",
        att: x?.att ?? null,
        hx: null,
        ax: null,
      } satisfies ClubGame;
    });
}

/** Merge season-store fixtures with ESPN's team schedule (which can be fresher, and can include other competitions). */
export function mergeGames(teamId: string, league: string, leagueName: string, season: SeasonData | undefined, results: any, fixtures: any): ClubGame[] {
  const out = new Map<string, ClubGame>();
  if (season && season.teams.length) {
    for (const m of season.matches) {
      if (m.h !== teamId && m.a !== teamId) continue;
      out.set(m.id, fromSeason(m, season, league, leagueName));
    }
  }
  for (const g of [...fromEspn(results, league), ...fromEspn(fixtures, league)]) {
    if (g.home.id !== teamId && g.away.id !== teamId) continue;
    const prev = out.get(g.id);
    if (!prev) {
      out.set(g.id, g);
      continue;
    }
    // Keep the season record (venue, attendance, xG) but take ESPN's state when it is further along.
    const fresher = STATE_RANK[g.state] > STATE_RANK[prev.state];
    out.set(g.id, {
      ...prev,
      comp: g.comp || prev.comp,
      state: fresher ? g.state : prev.state,
      status: fresher ? g.status : prev.status,
      void: fresher ? g.void : prev.void,
      home: { ...prev.home, name: prev.home.name || g.home.name, short: prev.home.short || g.home.short, logo: prev.home.logo || g.home.logo, score: fresher ? g.home.score : prev.home.score ?? g.home.score },
      away: { ...prev.away, name: prev.away.name || g.away.name, short: prev.away.short || g.away.short, logo: prev.away.logo || g.away.logo, score: fresher ? g.away.score : prev.away.score ?? g.away.score },
      venue: prev.venue || g.venue,
      att: prev.att ?? g.att,
    });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function gamePlayed(g: ClubGame): boolean {
  return g.state === "post" && !g.void && g.home.score != null && g.away.score != null;
}

export function gameResult(g: ClubGame, teamId: string): "W" | "D" | "L" | null {
  if (!gamePlayed(g)) return null;
  const home = g.home.id === teamId;
  const us = home ? g.home.score! : g.away.score!;
  const them = home ? g.away.score! : g.home.score!;
  return us > them ? "W" : us < them ? "L" : "D";
}

export function opponentOf(g: ClubGame, teamId: string): { side: GameSide; home: boolean } {
  const home = g.home.id === teamId;
  return { side: home ? g.away : g.home, home };
}

/** The live game, else the next scheduled one. */
export function nextGame(games: ClubGame[], now = Date.now()): ClubGame | null {
  const live = games.find((g) => g.state === "in");
  if (live) return live;
  return games.find((g) => g.state === "pre" && !g.void && Date.parse(g.date) > now - 3 * 3600e3) ?? null;
}

export function lastGame(games: ClubGame[]): ClubGame | null {
  for (let i = games.length - 1; i >= 0; i--) if (gamePlayed(games[i])) return games[i];
  return null;
}

/* ---------------------------------------------------------- club data --- */

export function useClubGames(league: string, id: string, leagueName: string) {
  const season = useSeason(league);
  const results = useApi<any>(id ? endpoints.results(league, id) : null);
  const fixtures = useApi<any>(id ? endpoints.fixtures(league, id) : null);
  const games = useMemo(
    () => mergeGames(id, league, leagueName, season.data, results.data, fixtures.data),
    [id, league, leagueName, season.data, results.data, fixtures.data],
  );
  const loading = games.length === 0 && (season.loading || results.loading || fixtures.loading);
  return { season, games, loading, error: !games.length && results.error && fixtures.error && season.error, reload: () => (results.reload(), fixtures.reload(), season.reload()) };
}

export interface StandingRow {
  rank: number;
  of: number;
  pts: number;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  note: string | null;
  group: string;
  groupIds: string[];
}

export function useStanding(league: string, id: string, season: SeasonData | undefined): StandingRow | null {
  const st = useApi<any>(endpoints.standings(league));
  return useMemo(() => {
    if (st.data) {
      try {
        for (const g of normaliseStandings(st.data).groups) {
          const r = g.rows.find((x) => x.team.id === id);
          if (r)
            return {
              rank: r.rank,
              of: g.rows.length,
              pts: r.pts,
              gp: r.gp,
              w: r.w,
              d: r.d,
              l: r.l,
              gf: r.gf,
              ga: r.ga,
              gd: r.gd,
              note: r.note?.description ?? null,
              group: g.name,
              groupIds: g.rows.map((x) => x.team.id),
            };
        }
      } catch {
        /* fall through to the season table */
      }
    }
    if (season && season.teams.some((t) => t.id === id)) {
      const tbl = table(season);
      const r = tbl.find((x) => x.team === id);
      if (r && r.gp > 0)
        return { rank: r.rank, of: tbl.length, pts: r.pts, gp: r.gp, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, gd: r.gd, note: null, group: "", groupIds: tbl.map((x) => x.team) };
    }
    return null;
  }, [st.data, id, season]);
}

/** League position after each round, ranked within the club's group/conference when there is one. */
export function clubPositions(season: SeasonData, teamId: string, groupIds?: string[]): { round: number; date: string; rank: number; of: number; pts: number }[] {
  if (!season.teams.some((t) => t.id === teamId)) return [];
  const ids = groupIds && groupIds.includes(teamId) && groupIds.every((g) => season.teams.some((t) => t.id === g)) ? groupIds : undefined;
  const out: { round: number; date: string; rank: number; of: number; pts: number }[] = [];
  for (const r of rounds(season)) {
    // Skip rounds the club didn't play in so the line tracks its own matchdays.
    if (!r.matches.some((m) => m.h === teamId || m.a === teamId)) continue;
    const cutoff = new Date(Date.parse(r.end) + 1).toISOString();
    const tbl = table(season, { before: cutoff, teams: ids });
    const row = tbl.find((x) => x.team === teamId);
    if (row) out.push({ round: out.length + 1, date: r.end, rank: row.rank, of: tbl.length, pts: row.pts });
  }
  return out;
}

/* -------------------------------------------------------------- squad --- */

export interface SquadMember {
  id: string;
  name: string;
  jersey: string;
  pos: "G" | "D" | "M" | "F" | "";
  posName: string;
  age: number | null;
  nat: string;
  flag: string;
  dob: string;
  height: string;
  headshot: string | null;
  injury: string | null;
  apps: number;
  starts: number;
  g: number;
  a: number;
  y: number;
  r: number;
  lpos: string | null;
}

function injuryText(a: any): string | null {
  const list = Array.isArray(a?.injuries) ? a.injuries : [];
  const inj = list[0];
  if (!inj) return null;
  const parts = [inj.status, inj.type?.description ?? inj.details?.type, inj.details?.detail].filter((x) => typeof x === "string" && x.trim());
  return parts.length ? fixText(parts.join(" · ")) : null;
}

export function mergeSquad(roster: any, people: PeopleData | undefined, teamId: string): SquadMember[] {
  const base = roster ? normaliseRoster(roster) : [];
  const raw = new Map<string, any>((roster?.athletes ?? []).map((a: any) => [String(a.id), a]));
  const stats = new Map<string, PersonRow>();
  for (const p of people?.players ?? []) if (p.t === teamId) stats.set(String(p.id), p);
  const posOf = (g: string): SquadMember["pos"] =>
    g === "Goalkeepers" ? "G" : g === "Defenders" ? "D" : g === "Midfielders" ? "M" : g === "Forwards" ? "F" : "";
  return base
    .filter((p) => p.id && p.name)
    .map((p) => {
      const s = stats.get(String(p.id));
      const a = raw.get(String(p.id));
      const pos = posOf(p.group) || ((s?.pos as SquadMember["pos"]) ?? "");
      return {
        id: String(p.id),
        name: p.name,
        jersey: p.jersey || s?.j || "",
        pos,
        posName: p.position || s?.posName || "",
        age: p.age ?? s?.age ?? null,
        nat: p.nationality || s?.nat || "",
        flag: p.flag || s?.flag || "",
        dob: p.dob || s?.dob || "",
        height: p.height,
        headshot: a?.headshot?.href ?? null,
        injury: s?.inj || injuryText(a),
        apps: s?.apps ?? 0,
        starts: s?.starts ?? 0,
        g: s?.g ?? 0,
        a: s?.a ?? 0,
        y: s?.y ?? 0,
        r: s?.r ?? 0,
        lpos: s?.lpos ?? null,
      };
    });
}

export function useSquad(league: string, id: string) {
  const roster = useApi<any>(id ? endpoints.roster(league, id) : null);
  const people = usePeople(league);
  const squad = useMemo(() => mergeSquad(roster.data, people.data, id), [roster.data, people.data, id]);
  return { squad, roster, people, hasStats: !!people.data?.players.some((p) => p.t === id) };
}

/* ------------------------------------------------------------- stadium -- */

/** The venue the club plays most of its home league games at (season data, else ESPN schedule). */
export function homeVenue(games: ClubGame[], teamId: string): string {
  const count = new Map<string, number>();
  for (const g of games) if (g.home.id === teamId && g.venue) count.set(g.venue, (count.get(g.venue) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function seasonVenueGames(season: SeasonData | undefined, venue: string, league: string, leagueName: string): ClubGame[] {
  if (!season || !venue) return [];
  return season.matches
    .filter((m) => m.v === venue)
    .map((m) => fromSeason(m, season, league, leagueName))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* -------------------------------------------------------------- misc ---- */

/** Ticking clock for countdowns; ticks every `ms` while the tab is visible. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
  return now;
}

/** First paragraphs of a long description, cut on a sentence boundary. */
export function paragraphs(text: string | null | undefined, maxChars = 900): string[] {
  if (!text) return [];
  const clean = fixText(text).replace(/\r/g, "").trim();
  const paras = clean.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let used = 0;
  for (const p of paras) {
    if (used >= maxChars) break;
    if (used + p.length <= maxChars) {
      out.push(p);
      used += p.length;
      continue;
    }
    const sentences = p.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
    let acc = "";
    for (const s of sentences) {
      if (used + acc.length + s.length > maxChars) break;
      acc += s;
    }
    if (acc.trim()) out.push(acc.trim());
    break;
  }
  // The worker truncates long descriptions mid-sentence: drop a dangling tail.
  if (out.length) {
    const last = out[out.length - 1];
    if (!/[.!?»"”)]$/.test(last)) {
      const cut = last.match(/^[\s\S]*[.!?](?=\s|$)/);
      if (cut) out[out.length - 1] = cut[0];
      else if (out.length > 1) out.pop();
    }
  }
  return out;
}

export function websiteUrl(site: string | null | undefined): string | null {
  if (!site) return null;
  const s = site.trim();
  if (!s || /\s/.test(s)) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

