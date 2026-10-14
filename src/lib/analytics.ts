/**
 * Pitch analytics — pure functions over the compact season dataset
 * (`/api/season/:league`). Everything is computed client-side so the edge stays
 * cheap; heavier Monte-Carlo work runs in `projection.worker.ts`.
 */

import type { SeasonData, SeasonEvent, SeasonMatch, SeasonTeam } from "../../shared/season";

export type { SeasonData, SeasonEvent, SeasonMatch, SeasonTeam };

const VOID = /POSTPONED|CANCEL|ABANDON|SUSPEND|FORFEIT|DELAYED/;

export function isPlayed(m: SeasonMatch): boolean {
  return m.s === "post" && m.hs !== null && m.as !== null && !VOID.test(m.st);
}
export function isLive(m: SeasonMatch): boolean {
  return m.s === "in";
}
export function isUpcoming(m: SeasonMatch): boolean {
  return m.s === "pre" && !VOID.test(m.st);
}

export function teamMap(season: SeasonData): Map<string, SeasonTeam> {
  return new Map(season.teams.map((t) => [t.id, t]));
}

export function played(season: SeasonData): SeasonMatch[] {
  return season.matches.filter(isPlayed).sort((a, b) => a.d.localeCompare(b.d));
}

/* -------------------------------------------------------------- table ---- */

export interface Row {
  team: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  /** Most recent last, e.g. "WWDLW". */
  form: string;
  rank: number;
}

export interface TableOptions {
  venue?: "home" | "away";
  /** Only each team's last N played matches. */
  lastN?: number;
  /** Only matches kicking off before this instant (ISO string; exclusive). */
  before?: string;
  /** Extra matches to treat as finished (e.g. live scores) — `{...match, hs, as}`. */
  overrides?: SeasonMatch[];
  /** Restrict to these team ids (groups/conferences). */
  teams?: string[];
}

export function table(season: SeasonData, opts: TableOptions = {}): Row[] {
  const override = new Map((opts.overrides ?? []).map((m) => [m.id, m]));
  let games = season.matches
    .map((m) => override.get(m.id) ?? m)
    .filter((m) => (override.has(m.id) ? m.hs !== null && m.as !== null : isPlayed(m)))
    .filter((m) => !opts.before || Date.parse(m.d) < Date.parse(opts.before))
    .sort((a, b) => a.d.localeCompare(b.d));
  const ids = opts.teams ?? season.teams.map((t) => t.id);
  const rows = new Map<string, Row>(
    ids.map((id) => [id, { team: id, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: "", rank: 0 }]),
  );

  if (opts.lastN) {
    const keep = new Set<string>();
    for (const id of ids) {
      const mine = games.filter((m) => (opts.venue !== "away" && m.h === id) || (opts.venue !== "home" && m.a === id));
      mine.slice(-opts.lastN).forEach((m) => keep.add(`${m.id}|${id}`));
    }
    games = games.filter((m) => keep.has(`${m.id}|${m.h}`) || keep.has(`${m.id}|${m.a}`));
    const apply = (m: SeasonMatch, id: string, home: boolean) => {
      if (!keep.has(`${m.id}|${id}`)) return;
      add(rows.get(id), home ? m.hs! : m.as!, home ? m.as! : m.hs!);
    };
    for (const m of games) {
      if (opts.venue !== "away") apply(m, m.h, true);
      if (opts.venue !== "home") apply(m, m.a, false);
    }
  } else {
    for (const m of games) {
      if (opts.venue !== "away") add(rows.get(m.h), m.hs!, m.as!);
      if (opts.venue !== "home") add(rows.get(m.a), m.as!, m.hs!);
    }
  }
  const out = [...rows.values()];
  const names = teamMap(season);
  out.sort(
    (a, b) =>
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (names.get(a.team)?.n ?? "").localeCompare(names.get(b.team)?.n ?? ""),
  );
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}

function add(r: Row | undefined, gf: number, ga: number) {
  if (!r) return;
  r.gp++;
  r.gf += gf;
  r.ga += ga;
  r.gd = r.gf - r.ga;
  const res = gf > ga ? "W" : gf < ga ? "L" : "D";
  if (res === "W") {
    r.w++;
    r.pts += 3;
  } else if (res === "D") {
    r.d++;
    r.pts += 1;
  } else r.l++;
  r.form = (r.form + res).slice(-10);
}

/* ------------------------------------------------------- results utils -- */

export function resultFor(m: SeasonMatch, teamId: string): "W" | "D" | "L" | null {
  if (!isPlayed(m)) return null;
  const home = m.h === teamId;
  const us = home ? m.hs! : m.as!;
  const them = home ? m.as! : m.hs!;
  return us > them ? "W" : us < them ? "L" : "D";
}

export function teamMatches(season: SeasonData, teamId: string): SeasonMatch[] {
  return season.matches.filter((m) => m.h === teamId || m.a === teamId).sort((a, b) => a.d.localeCompare(b.d));
}

/* ------------------------------------------------------- points race ---- */

export interface RacePoint {
  n: number; // game number
  pts: number;
  d: string;
  m: string;
}

/** Cumulative points after each game, per team. */
export function pointsRace(season: SeasonData): Map<string, RacePoint[]> {
  const out = new Map<string, RacePoint[]>(season.teams.map((t) => [t.id, [{ n: 0, pts: 0, d: "", m: "" }]]));
  for (const m of played(season)) {
    for (const id of [m.h, m.a]) {
      const arr = out.get(id);
      if (!arr) continue;
      const r = resultFor(m, id);
      const last = arr[arr.length - 1];
      arr.push({ n: last.n + 1, pts: last.pts + (r === "W" ? 3 : r === "D" ? 1 : 0), d: m.d, m: m.id });
    }
  }
  return out;
}

/* ------------------------------------------------------------ rounds ---- */

export interface Round {
  index: number;
  start: string;
  end: string;
  matches: SeasonMatch[];
}

/** Cluster played match dates into rounds (gaps of 3+ days separate rounds). */
export function rounds(season: SeasonData): Round[] {
  const games = played(season);
  const out: Round[] = [];
  let cur: Round | null = null;
  for (const m of games) {
    const t = Date.parse(m.d);
    if (!cur || t - Date.parse(cur.end) > 2.5 * 86400e3) {
      cur = { index: out.length + 1, start: m.d, end: m.d, matches: [] };
      out.push(cur);
    }
    cur.end = m.d;
    cur.matches.push(m);
  }
  return out;
}

/** League position after each round, per team. */
export function positionHistory(season: SeasonData): { rounds: Round[]; ranks: Map<string, number[]> } {
  const rs = rounds(season);
  const ranks = new Map<string, number[]>(season.teams.map((t) => [t.id, []]));
  rs.forEach((_r, i) => {
    // Everything up to (but not including) the next round; the last round includes all played games.
    const next = rs[i + 1]?.start;
    const tbl = next ? table(season, { before: next }) : table(season);
    for (const row of tbl) ranks.get(row.team)?.push(row.rank);
  });
  return { rounds: rs, ranks };
}

/* ----------------------------------------------------------- ratings ---- */

export interface Ratings {
  now: Map<string, number>;
  history: Map<string, { d: string; r: number }[]>;
  homeAdv: number;
}

/** Elo-style rating (World Football Elo method), seeded from last season's points per game. */
export function elo(season: SeasonData, k = 22, homeAdv = 65): Ratings {
  const now = new Map<string, number>();
  const history = new Map<string, { d: string; r: number }[]>();
  const seeds = Object.values(season.seed);
  const avgSeed = seeds.length ? seeds.reduce((a, b) => a + b, 0) / seeds.length : 1.37;
  for (const t of season.teams) {
    const ppg = season.seed[t.id];
    // Unknown last-season form (e.g. promoted clubs) starts below average.
    const start = ppg !== undefined ? 1500 + (ppg - avgSeed) * 260 : 1440;
    now.set(t.id, Math.round(start));
    history.set(t.id, [{ d: season.season?.start ?? "", r: Math.round(start) }]);
  }
  for (const m of played(season)) {
    const rh = now.get(m.h) ?? 1500;
    const ra = now.get(m.a) ?? 1500;
    const we = 1 / (1 + 10 ** (-(rh + homeAdv - ra) / 400));
    const w = m.hs! > m.as! ? 1 : m.hs! < m.as! ? 0 : 0.5;
    const gd = Math.abs(m.hs! - m.as!);
    const g = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
    const delta = k * g * (w - we);
    now.set(m.h, rh + delta);
    now.set(m.a, ra - delta);
    history.get(m.h)?.push({ d: m.d, r: Math.round(rh + delta) });
    history.get(m.a)?.push({ d: m.d, r: Math.round(ra - delta) });
  }
  for (const [id, r] of now) now.set(id, Math.round(r));
  return { now, history, homeAdv };
}

/* ------------------------------------------------- match probabilities -- */

export interface GoalModel {
  /** League average goals for the home and away side. */
  muH: number;
  muA: number;
  homeAdv: number;
}

export function goalModel(season: SeasonData, homeAdv = 65): GoalModel {
  const games = played(season);
  if (games.length < 10) return { muH: 1.5, muA: 1.2, homeAdv };
  const h = games.reduce((a, m) => a + m.hs!, 0) / games.length;
  const a = games.reduce((a, m) => a + m.as!, 0) / games.length;
  // Shrink toward typical values while the sample is small.
  const w = Math.min(1, games.length / 120);
  return { muH: h * w + 1.5 * (1 - w), muA: a * w + 1.2 * (1 - w), homeAdv };
}

/** Expected goals for each side from the rating gap. */
export function expectedGoals(rh: number, ra: number, gm: GoalModel): [number, number] {
  const dr = (rh - ra) / 400;
  const base = Math.sqrt(gm.muH * gm.muA);
  const homeBoost = Math.sqrt(gm.muH / gm.muA);
  return [base * homeBoost * Math.exp(0.85 * dr), (base / homeBoost) * Math.exp(-0.85 * dr)];
}

function poisson(k: number, l: number): number {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

/** Home / draw / away probabilities from two Poisson scoring rates. */
export function outcomeProbs(lh: number, la: number): { h: number; d: number; a: number } {
  let h = 0;
  let d = 0;
  let a = 0;
  for (let i = 0; i <= 10; i++) {
    const pi = poisson(i, lh);
    for (let j = 0; j <= 10; j++) {
      const p = pi * poisson(j, la);
      if (i > j) h += p;
      else if (i < j) a += p;
      else d += p;
    }
  }
  const s = h + d + a;
  return { h: h / s, d: d / s, a: a / s };
}

export function matchProbs(season: SeasonData, ratings: Ratings, homeId: string, awayId: string) {
  const gm = goalModel(season, ratings.homeAdv);
  const [lh, la] = expectedGoals((ratings.now.get(homeId) ?? 1500) + ratings.homeAdv / 2, (ratings.now.get(awayId) ?? 1500) - ratings.homeAdv / 2, gm);
  return { ...outcomeProbs(lh, la), lh, la };
}

/** Bookmaker American odds → normalised probabilities (vig removed). */
export function oddsToProbs(home: number, draw: number, away: number): { h: number; d: number; a: number } | null {
  const imp = (o: number) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  if (![home, draw, away].every((o) => Number.isFinite(o) && o !== 0)) return null;
  const h = imp(home);
  const d = imp(draw);
  const a = imp(away);
  const s = h + d + a;
  return { h: h / s, d: d / s, a: a / s };
}

/* --------------------------------------------------- fixture difficulty -- */

export interface Fixture {
  match: SeasonMatch;
  opponent: string;
  home: boolean;
  /** 1 (easiest) … 5 (hardest). */
  difficulty: number;
  winProb: number;
}

export function fixtureDifficulty(season: SeasonData, ratings: Ratings, n = 5): Map<string, Fixture[]> {
  const upcoming = season.matches.filter(isUpcoming).sort((a, b) => a.d.localeCompare(b.d));
  const out = new Map<string, Fixture[]>(season.teams.map((t) => [t.id, []]));
  for (const m of upcoming) {
    const p = matchProbs(season, ratings, m.h, m.a);
    for (const [id, opp, home, win] of [
      [m.h, m.a, true, p.h],
      [m.a, m.h, false, p.a],
    ] as const) {
      const list = out.get(id);
      if (!list || list.length >= n) continue;
      // Difficulty from the chance of NOT winning: 5 bands.
      const hard = 1 - win;
      const difficulty = hard < 0.45 ? 1 : hard < 0.55 ? 2 : hard < 0.65 ? 3 : hard < 0.75 ? 4 : 5;
      list.push({ match: m, opponent: opp, home, difficulty, winProb: win });
    }
  }
  return out;
}

/* ------------------------------------------------------ goals by minute -- */

export const MINUTE_BINS = ["1–15", "16–30", "31–45+", "46–60", "61–75", "76–90+"];

export function binOf(min: number): number {
  if (min <= 15) return 0;
  if (min <= 30) return 1;
  if (min <= 45) return 2;
  if (min <= 60) return 3;
  if (min <= 75) return 4;
  return 5;
}

const isGoal = (e: SeasonEvent) => e.k === "g" || e.k === "pg" || e.k === "og";

export function goalsByMinute(season: SeasonData, teamId?: string): { scored: number[]; conceded: number[] } {
  const playedIds = new Set(played(season).map((m) => m.id));
  const byId = new Map(season.matches.map((m) => [m.id, m]));
  const scored = [0, 0, 0, 0, 0, 0];
  const conceded = [0, 0, 0, 0, 0, 0];
  for (const e of season.events) {
    if (!isGoal(e) || !playedIds.has(e.m)) continue;
    const b = binOf(e.min);
    if (!teamId) {
      scored[b]++;
      continue;
    }
    const m = byId.get(e.m)!;
    if (m.h !== teamId && m.a !== teamId) continue;
    if (e.t === teamId) scored[b]++;
    else conceded[b]++;
  }
  return { scored, conceded };
}

/* ------------------------------------------------------------ discipline -- */

export function discipline(season: SeasonData) {
  const games = new Set(played(season).map((m) => m.id));
  const teams = new Map<string, { y: number; r: number; gp: number }>();
  const players = new Map<string, { name: string; team: string; pid: string | null; y: number; r: number }>();
  for (const m of played(season)) {
    for (const id of [m.h, m.a]) {
      const t = teams.get(id) ?? { y: 0, r: 0, gp: 0 };
      t.gp++;
      teams.set(id, t);
    }
  }
  for (const e of season.events) {
    if (!games.has(e.m) || !(e.k === "y" || e.k === "r" || e.k === "yr")) continue;
    const t = teams.get(e.t);
    if (t) {
      if (e.k === "y") t.y++;
      else t.r++;
    }
    const key = e.pid ?? `${e.t}|${e.p}`;
    const p = players.get(key) ?? { name: e.p, team: e.t, pid: e.pid, y: 0, r: 0 };
    if (e.k === "y") p.y++;
    else p.r++;
    players.set(key, p);
  }
  return { teams, players: [...players.values()].sort((a, b) => b.r * 3 + b.y - (a.r * 3 + a.y)) };
}

/* ------------------------------------------------------------- records --- */

export function biggestResults(season: SeasonData, teamId?: string, limit = 5) {
  const games = played(season).filter((m) => !teamId || m.h === teamId || m.a === teamId);
  const margin = (m: SeasonMatch) => Math.abs(m.hs! - m.as!);
  const wins = games
    .filter((m) => !teamId || resultFor(m, teamId) === "W")
    .filter((m) => margin(m) > 0)
    .sort((a, b) => margin(b) - margin(a) || b.hs! + b.as! - (a.hs! + a.as!))
    .slice(0, limit);
  const losses = teamId
    ? games
        .filter((m) => resultFor(m, teamId) === "L")
        .sort((a, b) => margin(b) - margin(a) || b.hs! + b.as! - (a.hs! + a.as!))
        .slice(0, limit)
    : [];
  const highest = [...games].sort((a, b) => b.hs! + b.as! - (a.hs! + a.as!)).slice(0, limit);
  return { wins, losses, highest };
}

/* ------------------------------------------------------------ referees --- */

export interface RefereeStat {
  name: string;
  games: number;
  yellows: number;
  reds: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  goals: number;
}

export function refereeStats(season: SeasonData): { refs: Map<string, RefereeStat>; league: RefereeStat } {
  const refs = new Map<string, RefereeStat>();
  const league: RefereeStat = { name: "", games: 0, yellows: 0, reds: 0, homeWins: 0, draws: 0, awayWins: 0, goals: 0 };
  const cards = new Map<string, { y: number; r: number }>();
  for (const e of season.events) {
    if (e.k !== "y" && e.k !== "r" && e.k !== "yr") continue;
    const c = cards.get(e.m) ?? { y: 0, r: 0 };
    if (e.k === "y") c.y++;
    else c.r++;
    cards.set(e.m, c);
  }
  for (const m of played(season)) {
    if (!m.det) continue;
    const c = cards.get(m.id) ?? { y: 0, r: 0 };
    const targets = [league];
    if (m.ref) {
      const r = refs.get(m.ref) ?? { name: m.ref, games: 0, yellows: 0, reds: 0, homeWins: 0, draws: 0, awayWins: 0, goals: 0 };
      refs.set(m.ref, r);
      targets.push(r);
    }
    for (const s of targets) {
      s.games++;
      s.yellows += c.y;
      s.reds += c.r;
      s.goals += m.hs! + m.as!;
      if (m.hs! > m.as!) s.homeWins++;
      else if (m.hs! < m.as!) s.awayWins++;
      else s.draws++;
    }
  }
  return { refs, league };
}

/* --------------------------------------------------------- league summary -- */

export interface LeagueSummary {
  games: number;
  goalsPerGame: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  goalless: number;
  oneGoal: number;
  over25: number;
  bothScore: number;
  cardsPerGame: number | null;
  xgPerGame: number | null;
}

export function leagueSummary(season: SeasonData): LeagueSummary | null {
  const games = played(season);
  if (!games.length) return null;
  const n = games.length;
  const cnt = (f: (m: SeasonMatch) => boolean) => games.filter(f).length / n;
  const det = games.filter((m) => m.det);
  const detIds = new Set(det.map((m) => m.id));
  const cards = season.events.filter((e) => detIds.has(e.m) && (e.k === "y" || e.k === "r" || e.k === "yr")).length;
  const withXg = games.filter((m) => m.hx !== null && m.ax !== null);
  return {
    games: n,
    goalsPerGame: games.reduce((a, m) => a + m.hs! + m.as!, 0) / n,
    homeWin: cnt((m) => m.hs! > m.as!),
    draw: cnt((m) => m.hs === m.as),
    awayWin: cnt((m) => m.hs! < m.as!),
    goalless: cnt((m) => m.hs === 0 && m.as === 0),
    oneGoal: cnt((m) => Math.abs(m.hs! - m.as!) === 1),
    over25: cnt((m) => m.hs! + m.as! > 2.5),
    bothScore: cnt((m) => m.hs! > 0 && m.as! > 0),
    cardsPerGame: det.length >= 5 ? cards / det.length : null,
    xgPerGame: withXg.length >= 5 ? withXg.reduce((a, m) => a + m.hx! + m.ax!, 0) / withXg.length : null,
  };
}

/* ----------------------------------------------------------------- xG ---- */

export function teamXg(season: SeasonData): Map<string, { xgf: number; xga: number; games: number; gf: number; ga: number }> {
  const out = new Map<string, { xgf: number; xga: number; games: number; gf: number; ga: number }>();
  for (const m of played(season)) {
    if (m.hx === null || m.ax === null) continue;
    for (const [id, xf, xa, gf, ga] of [
      [m.h, m.hx, m.ax, m.hs!, m.as!],
      [m.a, m.ax, m.hx, m.as!, m.hs!],
    ] as const) {
      const r = out.get(id) ?? { xgf: 0, xga: 0, games: 0, gf: 0, ga: 0 };
      r.xgf += xf;
      r.xga += xa;
      r.gf += gf;
      r.ga += ga;
      r.games++;
      out.set(id, r);
    }
  }
  return out;
}

/* ------------------------------------------------------- zone helpers ---- */

export interface Zone {
  from: number;
  to: number;
  label: string;
  color: string;
}

/** Build qualification/relegation bands from ESPN standings notes. */
export function zonesFromNotes(rows: { rank: number; note: { description: string } | null }[], colorOf: (d: string) => string): Zone[] {
  const zones: Zone[] = [];
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    if (!r.note) continue;
    const last = zones[zones.length - 1];
    if (last && last.label === r.note.description && last.to === r.rank - 1) last.to = r.rank;
    else zones.push({ from: r.rank, to: r.rank, label: r.note.description, color: colorOf(r.note.description) });
  }
  return zones;
}
