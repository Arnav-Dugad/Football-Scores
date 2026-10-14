/* Player data: ESPN payload normalisers and pure season computations
   (milestones, peer percentiles, search). No React in here. */

import type { PersonRow, SeasonData, SeasonEvent, SeasonMatch, SeasonShot, SeasonTeam } from "../../../shared/season";
import { fixText, nameKey } from "../../../shared/text";
import { LEAGUES, LEAGUE_BY_SLUG } from "../../lib/leagues";

export type { PersonRow, SeasonShot };

/** ESPN athlete bio (`common/v3 … /athletes/:id`). */
export const athletePath = (league: string, id: string) => `/api/espn/web/${league}/athletes/${id}`;
/** ESPN athlete overview: per-competition stats, last-five game log, next match. */
export const overviewPath = (league: string, id: string) => `/api/espn/web/${league}/athletes/${id}/overview`;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* --------------------------------------------------------------- bio ---- */

export interface BioTeam {
  id: string;
  name: string;
  short: string;
  logo: string;
  color: string | null;
}

export interface Bio {
  id: string;
  name: string;
  jersey: string;
  pos: string; // G / D / M / F
  posName: string;
  team: BioTeam | null;
  age: number | null;
  dob: string | null; // ISO yyyy-mm-dd
  height: string | null;
  weight: string | null;
  nat: string;
  flag: string;
  /** League starts / substitute appearances from ESPN's stats summary. */
  starts: number | null;
  subs: number | null;
  injury: string | null;
}

export function parseBio(d: any): Bio | null {
  const a = d?.athlete;
  if (!a?.id) return null;
  const t = a.team;
  const team: BioTeam | null = t?.id
    ? {
        id: String(t.id),
        name: fixText(t.displayName ?? t.name ?? ""),
        short: fixText(t.shortDisplayName ?? t.displayName ?? ""),
        logo: t.logos?.[0]?.href ?? t.logo ?? "",
        color: t.color && /^[0-9a-f]{6}$/i.test(t.color) ? `#${t.color}` : null,
      }
    : null;
  let dob: string | null = null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(a.displayDOB ?? "");
  if (m) dob = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  let starts: number | null = null;
  let subs: number | null = null;
  const ss = (a.statsSummary?.statistics ?? []).find((s: any) => s.name === "starts-subIns");
  const sm = ss ? /^(\d+)\s*\((\d+)\)$/.exec(String(ss.displayValue ?? "")) : null;
  if (sm) {
    starts = Number(sm[1]);
    subs = Number(sm[2]);
  }
  const inj = a.injuries?.[0];
  return {
    id: String(a.id),
    name: fixText(a.displayName ?? a.fullName ?? ""),
    jersey: a.jersey ? String(a.jersey) : "",
    pos: String(a.position?.abbreviation ?? "").charAt(0).toUpperCase(),
    posName: a.position?.displayName ?? "",
    team,
    age: num(a.age),
    dob,
    height: a.displayHeight || null,
    weight: a.displayWeight || null,
    nat: fixText(a.citizenship ?? a.flag?.alt ?? ""),
    flag: a.flag?.href ?? "",
    starts,
    subs,
    injury: inj ? fixText(inj.status ?? inj.type?.description ?? "Injured") : null,
  };
}

/* ---------------------------------------------------------- overview ---- */

export interface StatCol {
  name: string;
  short: string;
  label: string;
}

/** Preferred column order; only columns ESPN actually returns are shown. */
export const STAT_COLS: StatCol[] = [
  { name: "appearances", short: "Apps", label: "Appearances" },
  { name: "starts", short: "GS", label: "Starts" },
  { name: "subIns", short: "Sub", label: "Substitute appearances" },
  { name: "totalGoals", short: "G", label: "Goals" },
  { name: "goalAssists", short: "A", label: "Assists" },
  { name: "totalShots", short: "Sh", label: "Shots" },
  { name: "shotsOnTarget", short: "SoT", label: "Shots on target" },
  { name: "saves", short: "Sv", label: "Saves" },
  { name: "goalsConceded", short: "GA", label: "Goals conceded" },
  { name: "cleanSheet", short: "CS", label: "Clean sheets" },
  { name: "shotsFaced", short: "SF", label: "Shots faced" },
  { name: "yellowCards", short: "YC", label: "Yellow cards" },
  { name: "redCards", short: "RC", label: "Red cards" },
];

export interface CompRow {
  /** Display name without the season prefix, e.g. "English Premier League". */
  name: string;
  full: string;
  slug: string | null;
  teamId: string | null;
  stats: Record<string, number | null>;
}

export interface GameRow {
  id: string;
  date: string;
  slug: string;
  league: string;
  home: boolean;
  opponent: { id: string; name: string; abbr: string; logo: string };
  result: "W" | "D" | "L" | null;
  us: number | null;
  them: number | null;
  /** started / sub / unused / played (when ESPN only says "appeared"). */
  role: "started" | "sub" | "unused" | "played";
  roleText: string;
  g: number;
  a: number;
  sh: number | null;
  sot: number | null;
  y: number;
  r: number;
}

export interface NextGame {
  id: string;
  slug: string;
  date: string;
  league: string;
  home: boolean | null;
  opponent: { id: string; name: string; logo: string } | null;
  venue: string;
}

export interface Overview {
  comps: CompRow[];
  cols: StatCol[];
  games: GameRow[];
  next: NextGame | null;
}

const stripSeason = (s: string) => s.replace(/^\d{4}(?:[-/]\d{2,4})?\s+/, "").trim();

export function parseOverview(d: any, fallbackSlug: string, teamId?: string | null): Overview {
  const st = d?.statistics ?? {};
  const names: string[] = Array.isArray(st.names) ? st.names : [];
  const splits: any[] = Array.isArray(st.splits) ? st.splits : [];
  const comps: CompRow[] = splits
    .filter((s) => Array.isArray(s?.stats))
    .map((s) => {
      const stats: Record<string, number | null> = {};
      names.forEach((n, i) => {
        if (!(n in stats)) stats[n] = num(s.stats[i]);
      });
      const full = fixText(s.displayName ?? "");
      return { name: stripSeason(full) || full, full, slug: s.leagueSlug ?? null, teamId: s.teamId ? String(s.teamId) : null, stats };
    });
  const cols = STAT_COLS.filter((c) => names.includes(c.name) && comps.some((r) => r.stats[c.name] !== null));

  const slugFor = (leagueName: string): string => {
    const key = nameKey(leagueName);
    if (!key) return fallbackSlug;
    const hit = comps.find((c) => {
      if (!c.slug) return false;
      const cn = nameKey(c.name);
      return nameKey(c.full).endsWith(key) || cn === key || (cn.length >= 5 && key.endsWith(cn));
    });
    if (hit?.slug) return hit.slug;
    const known = LEAGUES.find((l) => nameKey(l.name) === key || key.endsWith(nameKey(l.name)));
    return known?.slug ?? fallbackSlug;
  };

  const games: GameRow[] = [];
  const log = d?.gameLog;
  const logStats = Array.isArray(log?.statistics) ? log.statistics[0] : null;
  const ln: string[] = Array.isArray(logStats?.names) ? logStats.names : [];
  const at = (stats: unknown[], name: string) => {
    const i = ln.indexOf(name);
    return i >= 0 ? stats[i] : undefined;
  };
  const details = log?.events && typeof log.events === "object" ? log.events : {};
  const seen = new Set<string>();
  for (const ev of Array.isArray(logStats?.events) ? logStats.events : []) {
    const id = String(ev?.eventId ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const det = details[id];
    if (!det) continue;
    const stats: unknown[] = Array.isArray(ev.stats) ? ev.stats : [];
    const myTeam = String(det.team?.id ?? teamId ?? "");
    const home = det.homeTeamId ? String(det.homeTeamId) === myTeam : det.atVs !== "@";
    const hs = num(det.homeTeamScore);
    const as = num(det.awayTeamScore);
    const us = home ? hs : as;
    const them = home ? as : hs;
    const rawRole = String(at(stats, "appearances") ?? "");
    const role: GameRow["role"] = /start/i.test(rawRole)
      ? "started"
      : /sub/i.test(rawRole)
        ? "sub"
        : (num(rawRole) ?? 0) > 0
          ? "played"
          : "unused";
    const res = String(det.gameResult ?? "").toUpperCase();
    const opp = det.opponent ?? {};
    games.push({
      id,
      date: String(det.gameDate ?? ""),
      slug: slugFor(String(det.leagueName ?? "")),
      league: fixText(det.leagueShortName ?? det.leagueName ?? ""),
      home,
      opponent: { id: String(opp.id ?? ""), name: fixText(opp.displayName ?? ""), abbr: opp.abbreviation ?? "", logo: opp.logo ?? "" },
      result: res === "W" || res === "D" || res === "L" ? res : null,
      us,
      them,
      role,
      roleText: fixText(rawRole),
      g: num(at(stats, "totalGoals")) ?? 0,
      a: num(at(stats, "goalAssists")) ?? 0,
      sh: num(at(stats, "totalShots")),
      sot: num(at(stats, "shotsOnTarget")),
      y: num(at(stats, "yellowCards")) ?? 0,
      r: num(at(stats, "redCards")) ?? 0,
    });
  }
  games.sort((a, b) => a.date.localeCompare(b.date));

  let next: NextGame | null = null;
  const nl = d?.nextGame?.league;
  const ne = nl?.events?.[0];
  if (ne?.id && ne.date) {
    const cs: any[] = ne.competitors ?? [];
    const mine = teamId ? cs.find((c) => String(c.id) === teamId) : null;
    const opp = mine ? cs.find((c) => c !== mine) : null;
    next = {
      id: String(ne.id),
      slug: nl.slug ?? fallbackSlug,
      date: ne.date,
      league: fixText(nl.shortName ?? nl.name ?? ""),
      home: mine ? mine.homeAway === "home" : null,
      opponent: opp ? { id: String(opp.id), name: fixText(opp.displayName ?? opp.name ?? ""), logo: opp.logo ?? "" } : null,
      venue: fixText(ne.location ?? ""),
    };
  }
  return { comps, cols, games, next };
}

/* -------------------------------------------------------- text helpers -- */

/** First `n` sentences of a TheSportsDB / Wikipedia bio. */
export function shortBio(text: string | null | undefined, n = 3): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  // Split after . ! ? followed by a space and an uppercase letter / quote — avoids "Jr. " and decimals.
  const parts = clean.split(/(?<=[.!?])\s+(?=["“(\p{Lu}])/u);
  return parts.slice(0, n).join(" ").trim();
}

/** TheSportsDB heights look like "195 cm" or "1.95 m (6 ft 5 in)". */
export function metricHeight(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cm = /(\d{3})\s*cm/i.exec(raw);
  if (cm) return `${cm[1]} cm`;
  const m = /(\d)[.,](\d{2})\s*m\b/i.exec(raw);
  if (m) return `${m[1]}${m[2]} cm`;
  return raw.split("(")[0].trim() || null;
}

export type Foot = "left" | "right" | "both";
export function footOf(raw: string | null | undefined): Foot | null {
  const s = (raw ?? "").toLowerCase();
  if (!s) return null;
  if (/both|either|ambi/.test(s)) return "both";
  if (/left/.test(s)) return "left";
  if (/right/.test(s)) return "right";
  return null;
}

export function isoDob(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function ageFrom(dob: string | null | undefined): number | null {
  const iso = isoDob(dob);
  if (!iso) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) a--;
  return a >= 14 && a <= 60 ? a : null;
}

/* ------------------------------------------------------------- injury ---- */

export type Availability = { tone: "out" | "doubt" | "suspended" | "ok"; status: string };

export function availability(inj: string | null | undefined): Availability {
  const s = (inj ?? "").trim();
  if (!s) return { tone: "ok", status: "" };
  if (/suspen/i.test(s)) return { tone: "suspended", status: s };
  if (/doubt|question|day[- ]to[- ]day|probable|game[- ]time|50/i.test(s)) return { tone: "doubt", status: s };
  return { tone: "out", status: s };
}

/* ------------------------------------------------------------ position --- */

export function posGroup(pos: string | null | undefined, posName?: string | null): "G" | "D" | "M" | "F" | "" {
  const p = String(pos || posName || "").trim().toUpperCase();
  if (p.startsWith("G")) return "G";
  if (p.startsWith("D")) return "D";
  if (p.startsWith("M")) return "M";
  if (p.startsWith("F") || p.startsWith("A") || p.startsWith("S")) return "F";
  return "";
}

export const POS_NAME: Record<string, string> = { G: "Goalkeeper", D: "Defender", M: "Midfielder", F: "Forward" };

/* --------------------------------------------------------- milestones ---- */

export type MedalTier = "gold" | "silver" | "bronze";
export type MedalIcon = "ball" | "assist" | "hat" | "crown" | "target" | "flame" | "shield" | "spark" | "star" | "pen";

export interface Milestone {
  key: string;
  tier: MedalTier;
  icon: MedalIcon;
  /** English source strings + vars, translated at render time. */
  title: string;
  titleVars?: Record<string, string | number>;
  detail: string;
  detailVars?: Record<string, string | number>;
  /** ISO date for detail formatting. */
  date?: string;
  href?: string;
  /** Numeral struck on the medal face instead of a glyph (e.g. 3 for a hat-trick). */
  face?: string;
}

interface Who {
  id: string;
  name: string;
  team: string | null;
}

function mine(e: SeasonEvent, who: Who): boolean {
  if (e.pid) return e.pid === who.id;
  return nameKey(e.p) === nameKey(who.name) && (!who.team || e.t === who.team);
}
function assisted(e: SeasonEvent, who: Who): boolean {
  if (e.aid) return e.aid === who.id;
  return !!e.as && nameKey(e.as) === nameKey(who.name) && (!who.team || e.t === who.team);
}

const VOID = /POSTPONED|CANCEL|ABANDON|SUSPEND|FORFEIT|DELAYED/;
const isPlayed = (m: SeasonMatch) => m.s === "post" && m.hs !== null && m.as !== null && !VOID.test(m.st);

export interface PlayerGoal {
  e: SeasonEvent;
  m: SeasonMatch | undefined;
  opp: SeasonTeam | undefined;
}

export function playerGoals(season: SeasonData, who: Who): PlayerGoal[] {
  const ms = new Map(season.matches.map((m) => [m.id, m]));
  const ts = new Map(season.teams.map((t) => [t.id, t]));
  return season.events
    .filter((e) => (e.k === "g" || e.k === "pg") && mine(e, who))
    .map((e) => {
      const m = ms.get(e.m);
      const oppId = m ? (m.h === e.t ? m.a : m.h) : undefined;
      return { e, m, opp: oppId ? ts.get(oppId) : undefined };
    })
    .sort((a, b) => (a.m?.d ?? "").localeCompare(b.m?.d ?? "") || a.e.min - b.e.min);
}

export function computeMilestones(opts: {
  season: SeasonData | undefined;
  person: PersonRow | null;
  people: PersonRow[];
  shots: SeasonShot[];
  who: Who;
  league: string;
  teamName: string;
  /** League clean sheets (goalkeepers, from ESPN). */
  cleanSheets?: number | null;
}): Milestone[] {
  const { season, person, people, shots, who, league, teamName, cleanSheets } = opts;
  const out: Milestone[] = [];
  const goals = season ? playerGoals(season, who) : [];
  const g = Math.max(person?.g ?? 0, goals.length);
  const a = Math.max(person?.a ?? 0, season ? season.events.filter((e) => (e.k === "g" || e.k === "pg") && assisted(e, who)).length : 0);
  const leagueName = LEAGUE_BY_SLUG[league]?.name ?? "";

  // League-wide and club leaders.
  const pool = people.filter((p) => p.apps > 0 || p.g > 0 || p.a > 0);
  if (person && pool.length) {
    const topG = Math.max(...pool.map((p) => p.g));
    const topA = Math.max(...pool.map((p) => p.a));
    if (person.g > 0 && person.g === topG) {
      const joint = pool.filter((p) => p.g === topG).length > 1;
      out.push({
        key: "league-top-scorer",
        tier: "gold",
        icon: "crown",
        title: joint ? "Joint top scorer" : "Top scorer",
        detail: leagueName ? "{league} leader with {n} goals" : "League leader with {n} goals",
        detailVars: { league: leagueName, n: person.g },
      });
    }
    if (person.a > 0 && person.a === topA) {
      const joint = pool.filter((p) => p.a === topA).length > 1;
      out.push({
        key: "league-top-assists",
        tier: "gold",
        icon: "assist",
        title: joint ? "Joint assist leader" : "Assist leader",
        detail: leagueName ? "{league} leader with {n} assists" : "League leader with {n} assists",
        detailVars: { league: leagueName, n: person.a },
      });
    }
    const club = pool.filter((p) => p.t === person.t);
    const clubG = Math.max(0, ...club.map((p) => p.g));
    const clubA = Math.max(0, ...club.map((p) => p.a));
    if (person.g > 0 && person.g === clubG && person.g !== topG) {
      const joint = club.filter((p) => p.g === clubG).length > 1;
      out.push({
        key: "club-top-scorer",
        tier: "silver",
        icon: "star",
        title: joint ? "Joint club top scorer" : "Club top scorer",
        detail: "Most goals at {club} ({n})",
        detailVars: { club: teamName, n: person.g },
      });
    }
    if (person.a > 0 && person.a === clubA && person.a !== topA) {
      const joint = club.filter((p) => p.a === clubA).length > 1;
      out.push({
        key: "club-top-assists",
        tier: "silver",
        icon: "assist",
        title: joint ? "Joint club assist leader" : "Club assist leader",
        detail: "Most assists at {club} ({n})",
        detailVars: { club: teamName, n: person.a },
      });
    }
  }

  // Hat-tricks and braces.
  const byMatch = new Map<string, PlayerGoal[]>();
  for (const x of goals) {
    const arr = byMatch.get(x.e.m) ?? [];
    arr.push(x);
    byMatch.set(x.e.m, arr);
  }
  let braces = 0;
  for (const [mid, list] of byMatch) {
    if (list.length >= 3) {
      const first = list[0];
      out.push({
        key: `hat-${mid}`,
        tier: "gold",
        icon: "hat",
        face: String(list.length),
        title: list.length >= 4 ? "{n} goals in a match" : "Hat-trick",
        titleVars: { n: list.length },
        detail: first.opp ? "vs {team} · {date}" : "{date}",
        detailVars: { team: first.opp?.s || first.opp?.n || "" },
        date: first.m?.d,
        href: `/match/${league}/${mid}`,
      });
    } else if (list.length === 2) braces++;
  }
  if (braces > 0) {
    out.push({
      key: "braces",
      tier: braces >= 3 ? "silver" : "bronze",
      icon: "spark",
      face: "2",
      title: braces === 1 ? "Brace" : "{n} braces",
      titleVars: { n: braces },
      detail: braces === 1 ? "Two goals in a match" : "Two goals in a match, {n} times",
      detailVars: { n: braces },
    });
  }

  // Goal and assist thresholds.
  const gTier = [30, 25, 20, 15, 10, 5].find((n) => g >= n);
  if (gTier) {
    out.push({
      key: "goals-tier",
      tier: gTier >= 20 ? "gold" : gTier >= 10 ? "silver" : "bronze",
      icon: "ball",
      title: "{n}+ goals",
      titleVars: { n: gTier },
      detail: leagueName ? "{n} {league} goals" : "{n} league goals",
      detailVars: { n: g, league: leagueName },
    });
  }
  const aTier = [15, 10, 5].find((n) => a >= n);
  if (aTier) {
    out.push({
      key: "assists-tier",
      tier: aTier >= 15 ? "gold" : aTier >= 10 ? "silver" : "bronze",
      icon: "assist",
      title: "{n}+ assists",
      titleVars: { n: aTier },
      detail: "{n} assists this season",
      detailVars: { n: a },
    });
  }

  // First goal of the season.
  if (goals.length) {
    const f = goals[0];
    out.push({
      key: "first-goal",
      tier: "bronze",
      icon: "target",
      title: "First goal of the season",
      detail: f.opp ? "vs {team} · {date}" : "{date}",
      detailVars: { team: f.opp?.s || f.opp?.n || "", min: f.e.min },
      date: f.m?.d,
      href: f.m ? `/match/${league}/${f.m.id}` : undefined,
    });
  }

  // Scoring streak across consecutive club matches.
  if (season && who.team && goals.length >= 3) {
    const scored = new Set(goals.map((x) => x.e.m));
    const clubGames = season.matches.filter((m) => isPlayed(m) && (m.h === who.team || m.a === who.team)).sort((x, y) => x.d.localeCompare(y.d));
    let best = 0;
    let run = 0;
    for (const m of clubGames) {
      run = scored.has(m.id) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    if (best >= 3) {
      out.push({
        key: "streak",
        tier: best >= 6 ? "gold" : best >= 4 ? "silver" : "bronze",
        icon: "flame",
        title: "{n}-match scoring run",
        titleVars: { n: best },
        detail: "Scored in {n} club matches in a row",
        detailVars: { n: best },
      });
    }
  }

  // Ever-present: started every played club match (needs complete lineups).
  if (season && person && who.team) {
    const clubPlayed = season.matches.filter((m) => isPlayed(m) && (m.h === who.team || m.a === who.team));
    const synced = clubPlayed.filter((m) => m.det === 1).length;
    if (clubPlayed.length >= 3 && synced === clubPlayed.length && person.starts >= clubPlayed.length) {
      out.push({
        key: "ever-present",
        tier: clubPlayed.length >= 20 ? "gold" : "silver",
        icon: "shield",
        title: "Ever-present",
        detail: "Started all {n} league matches",
        detailVars: { n: clubPlayed.length },
      });
    }
  }

  // Clean sheets (goalkeepers).
  const csTier = cleanSheets != null ? [15, 10, 5, 3].find((n) => cleanSheets >= n) : undefined;
  if (csTier && cleanSheets != null) {
    out.push({
      key: "clean-sheets",
      tier: csTier >= 10 ? "gold" : csTier >= 5 ? "silver" : "bronze",
      icon: "shield",
      title: "{n}+ clean sheets",
      titleVars: { n: csTier },
      detail: leagueName ? "{n} {league} shut-outs" : "{n} league shut-outs",
      detailVars: { n: cleanSheets, league: leagueName },
      face: String(cleanSheets),
    });
  }

  // Penalties.
  const pens = goals.filter((x) => x.e.k === "pg").length;
  if (pens >= 2) {
    const attempts = shots.filter((s) => s.xg >= 0.75 && s.xg <= 0.77).length;
    out.push({
      key: "pens",
      tier: pens >= 5 ? "gold" : "silver",
      icon: "pen",
      title: "Penalty specialist",
      detail: attempts >= pens ? "{n} of {m} penalties scored" : "{n} penalties scored",
      detailVars: { n: pens, m: attempts },
    });
  }

  const rank: Record<MedalTier, number> = { gold: 0, silver: 1, bronze: 2 };
  return out.sort((x, y) => rank[x.tier] - rank[y.tier]);
}

/* -------------------------------------------------------- percentiles ---- */

export type MetricKey = "g" | "a" | "xg" | "sh" | "acc" | "disc" | "starts";

export interface Metric {
  key: MetricKey;
  label: string;
  short: string;
  /** Lower raw values are better (percentile is inverted). */
  invert?: boolean;
  kind: "perGame" | "pct";
}

export const METRICS: Metric[] = [
  { key: "g", label: "Goals per game", short: "Goals", kind: "perGame" },
  { key: "a", label: "Assists per game", short: "Assists", kind: "perGame" },
  { key: "xg", label: "xG per game", short: "xG", kind: "perGame" },
  { key: "sh", label: "Shots per game", short: "Shots", kind: "perGame" },
  { key: "acc", label: "Shot accuracy", short: "Accuracy", kind: "pct" },
  { key: "disc", label: "Discipline (cards per game, inverted)", short: "Discipline", kind: "perGame", invert: true },
  { key: "starts", label: "Share of appearances started", short: "Starts", kind: "pct" },
];

export const MIN_APPS = 3;

export function metricValue(p: PersonRow, key: MetricKey): number | null {
  if (!p.apps) return null;
  switch (key) {
    case "g":
      return p.g / p.apps;
    case "a":
      return p.a / p.apps;
    case "xg":
      return p.xg / p.apps;
    case "sh":
      return p.sh / p.apps;
    case "acc":
      return p.sh >= 3 ? p.sot / p.sh : null;
    case "disc":
      return (p.y + 2 * p.r) / p.apps;
    case "starts":
      return p.starts / p.apps;
  }
}

export interface Percentile {
  key: MetricKey;
  value: number | null;
  pct: number | null;
}

/** Mid-rank percentile of each metric vs league peers with ≥ MIN_APPS appearances (goalkeepers vs goalkeepers). */
export function percentiles(p: PersonRow, people: PersonRow[]): { list: Percentile[]; peers: number } {
  const gk = posGroup(p.pos, p.posName) === "G";
  const peers = people.filter((x) => x.apps >= MIN_APPS && (posGroup(x.pos, x.posName) === "G") === gk);
  const list = METRICS.map((m) => {
    const v = metricValue(p, m.key);
    if (v === null || p.apps < 1) return { key: m.key, value: v, pct: null };
    const vals = peers.map((x) => metricValue(x, m.key)).filter((x): x is number => x !== null);
    if (vals.length < 5) return { key: m.key, value: v, pct: null };
    const eps = 1e-9;
    let below = 0;
    let equal = 0;
    for (const x of vals) {
      if (Math.abs(x - v) < eps) equal++;
      else if (x < v) below++;
    }
    let pct = ((below + 0.5 * equal) / vals.length) * 100;
    if (m.invert) pct = 100 - pct;
    return { key: m.key, value: v, pct: Math.max(0, Math.min(100, pct)) };
  });
  return { list, peers: peers.length };
}

/* --------------------------------------------------------------- search -- */

export function searchPeople(players: PersonRow[], q: string, limit = 8): PersonRow[] {
  const key = nameKey(q);
  if (!key) {
    return [...players]
      .filter((p) => p.apps > 0)
      .sort((a, b) => b.g + b.a - (a.g + a.a) || b.xg - a.xg || b.apps - a.apps)
      .slice(0, limit);
  }
  const parts = key.split(" ");
  const scored: { p: PersonRow; s: number }[] = [];
  for (const p of players) {
    const n = nameKey(p.n);
    if (!parts.every((w) => n.includes(w))) continue;
    const words = n.split(" ");
    let s = 0;
    if (n === key) s += 100;
    if (n.startsWith(key)) s += 40;
    if (parts.every((w) => words.some((x) => x.startsWith(w)))) s += 20;
    if (words[words.length - 1].startsWith(parts[parts.length - 1])) s += 10;
    s += Math.min(10, p.apps / 3);
    scored.push({ p, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.p.n.localeCompare(b.p.n)).slice(0, limit).map((x) => x.p);
}

/* ------------------------------------------------------------- shots ---- */

export function shotsFor(shots: SeasonShot[], name: string): SeasonShot[] {
  const k = nameKey(name);
  return shots.filter((s) => nameKey(s.p) === k);
}

export const isPenalty = (s: SeasonShot) => s.xg >= 0.75 && s.xg <= 0.77;
