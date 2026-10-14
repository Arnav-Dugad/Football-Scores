/* Typed access to the edge API (worker/index.ts) + ESPN payload normalisers. */

import type { WireDetail, WireMatch, WireSide } from "../../shared/scoreboard";
import { fixText } from "../../shared/text";
export { fixText };

export type Side = WireSide;
export type MatchDetail = WireDetail;
export type Match = WireMatch;

export interface PlayerInfo {
  name: string;
  tsdbId: string | null;
  birthplace: string | null;
  weight: string | null;
  foot: string | null;
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

export interface TeamInfo {
  found: boolean;
  tsdbId?: string | null;
  venueId?: string | null;
  kits?: { season: string; type: string; image: string }[];
  website?: string | null;
  jersey?: string | null;
  name?: string;
  formed?: string | null;
  stadium?: string | null;
  capacity?: string | null;
  location?: string | null;
  stadiumPhoto?: string | null;
  fanart?: string[];
  banner?: string | null;
  description?: string | null;
}

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export const endpoints = {
  scores: (dates: string[], leagues: string[]) => `/api/scores?dates=${dates.join(",")}&leagues=${leagues.join(",")}`,
  calendar: (leagues: string[]) => `/api/calendar?leagues=${leagues.join(",")}`,
  summary: (league: string, id: string) => `/api/espn/site/${league}/summary?event=${id}`,
  standings: (league: string) => `/api/espn/v2/${league}/standings`,
  leaders: (league: string) => `/api/espn/site/${league}/statistics`,
  news: (league: string) => `/api/espn/site/${league}/news?limit=30`,
  team: (league: string, id: string) => `/api/espn/site/${league}/teams/${id}`,
  roster: (league: string, id: string) => `/api/espn/site/${league}/teams/${id}/roster`,
  results: (league: string, id: string) => `/api/espn/site/${league}/teams/${id}/schedule`,
  fixtures: (league: string, id: string) => `/api/espn/site/${league}/teams/${id}/schedule?fixture=true`,
  athlete: (league: string, id: string) => `/api/espn/web/${league}/athletes/${id}/overview`,
  athleteBio: (league: string, id: string) => `/api/espn/web/${league}/athletes/${id}`,
  player: (name: string, team?: string, full = false) =>
    `/api/player?name=${encodeURIComponent(name)}${team ? `&team=${encodeURIComponent(team)}` : ""}${full ? "&full=1" : ""}`,
  teamInfo: (id: string, name: string) => `/api/team?id=${id}&name=${encodeURIComponent(name)}`,
  career: (tsdbId: string) => `/api/player/career?id=${tsdbId}`,
  venue: (tsdbVenueId: string) => `/api/venue?id=${tsdbVenueId}`,
  h2h: (league: string, a: string, b: string) => `/api/h2h/${league}?a=${a}&b=${b}`,
  lineup: (league: string, team: string) => `/api/lineup/${league}?team=${team}`,
  teamNews: (league: string, team: string) => `/api/espn/site/${league}/news?team=${team}&limit=25`,
  snapshot: () => `/api/live/snapshot`,
  geo: () => `/api/geo`,
};

/* ------------------------------------------------------------ helpers -- */

export function sized(url: string | undefined | null, size: number): string {
  if (!url) return "";
  const m = url.match(/^https:\/\/a\.espncdn\.com(\/i\/.+\.png)$/);
  if (m) return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${size}&h=${size}`;
  return url;
}

export function darkVariant(url: string): string | null {
  if (url.includes("/teamlogos/soccer/500/")) return url.replace("/teamlogos/soccer/500/", "/teamlogos/soccer/500-dark/");
  if (url.includes("/leaguelogos/soccer/500/")) return url.replace("/leaguelogos/soccer/500/", "/leaguelogos/soccer/500-dark/");
  return null;
}

/* -------------------------------------------------------- summary ------ */

export interface KeyEvent {
  id: string;
  type: string;
  text: string;
  clock: string;
  clockValue: number;
  period: number;
  teamId: string | null;
  players: { id: string; name: string }[];
  penalty: boolean;
  ownGoal: boolean;
  scoring: boolean;
}

export interface LineupPlayer {
  id: string;
  name: string;
  short: string;
  jersey: string;
  pos: string;
  posName: string;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  subMinute: string | null;
  place: number;
  goals: number;
  yellow: boolean;
  red: boolean;
}

export interface Lineup {
  teamId: string;
  formation: string;
  players: LineupPlayer[];
}

export interface TeamStat {
  name: string;
  label: string;
  value: string;
}

export interface SummaryData {
  match: Match;
  events: KeyEvent[];
  stats: Record<string, TeamStat[]>;
  lineups: Lineup[];
  form: Record<string, { result: string; opponent: string; opponentLogo: string; score: string; date: string; id: string }[]>;
  venue: string;
  city: string;
  attendance: number;
  officials: string[];
  standings: any;
}

function sideFromHeader(c: any): Side {
  const t = c?.team ?? {};
  return {
    id: t.id,
    name: fixText(t.displayName),
    short: fixText(t.shortDisplayName || t.displayName),
    abbr: t.abbreviation,
    logo: t.logos?.[0]?.href || t.logo || "",
    color: t.color ? `#${t.color}` : null,
    altColor: t.alternateColor ? `#${t.alternateColor}` : null,
    score: c?.score === undefined || c?.score === "" ? null : Number(c.score),
    shootout: c?.shootoutScore ?? null,
    winner: !!c?.winner,
    form: c?.form || t?.form || "",
    record: c?.record?.[0]?.summary ?? "",
  };
}

export function normaliseSummary(d: any, slug: string): SummaryData {
  const comp = d.header?.competitions?.[0] ?? {};
  const st = comp.status ?? {};
  const comps = comp.competitors ?? [];
  const homeC = comps.find((c: any) => c.homeAway === "home") ?? comps[0];
  const awayC = comps.find((c: any) => c.homeAway === "away") ?? comps[1];
  const state = st.type?.state ?? "pre";
  const home = sideFromHeader(homeC);
  const away = sideFromHeader(awayC);
  if (state === "pre") {
    home.score = null;
    away.score = null;
  }

  const events: KeyEvent[] = (d.keyEvents ?? []).map((k: any) => ({
    id: k.id,
    type: k.type?.type ?? "",
    text: fixText(k.text),
    clock: k.clock?.displayValue ?? "",
    clockValue: k.clock?.value ?? 0,
    period: k.period?.number ?? 0,
    teamId: k.team?.id ?? null,
    players: (k.participants ?? []).map((p: any) => ({ id: p.athlete?.id, name: fixText(p.athlete?.displayName) })),
    penalty: /penalty/i.test(k.type?.text ?? "") || /penalty/i.test(k.text ?? ""),
    ownGoal: /own goal/i.test(k.type?.text ?? "") || /own goal/i.test(k.text ?? ""),
    scoring: !!k.scoringPlay,
  }));

  const goalsBy: Record<string, number> = {};
  for (const e of events) if (e.scoring && !e.ownGoal && e.players[0]) goalsBy[e.players[0].id] = (goalsBy[e.players[0].id] ?? 0) + 1;

  const details: MatchDetail[] = events
    .filter((e) => e.scoring || e.type.includes("red-card") || e.type.includes("yellow-card"))
    .map((e) => ({
      kind: e.scoring ? "goal" : e.type.includes("red") ? "red" : "yellow",
      clock: e.clock,
      teamId: e.teamId ?? "",
      player: e.players[0]?.name ?? "",
      penalty: e.penalty,
      ownGoal: e.ownGoal,
    }));

  const stats: Record<string, TeamStat[]> = {};
  for (const t of d.boxscore?.teams ?? []) {
    stats[t.team?.id] = (t.statistics ?? []).map((s: any) => ({ name: s.name, label: s.label ?? s.name, value: s.displayValue }));
  }

  const lineups: Lineup[] = (d.rosters ?? []).map((r: any) => ({
    teamId: r.team?.id,
    formation: r.formation ?? "",
    players: (r.roster ?? []).map((p: any) => {
      const plays = p.plays ?? [];
      const sub = plays.find((x: any) => x.substitution);
      const stat = (n: string) => Number((p.stats ?? []).find((s: any) => s.name === n)?.value ?? 0);
      return {
        id: p.athlete?.id,
        name: fixText(p.athlete?.displayName),
        short: fixText(p.athlete?.shortName || p.athlete?.displayName),
        jersey: p.jersey ?? "",
        pos: p.position?.abbreviation ?? "",
        posName: p.position?.displayName ?? "",
        starter: !!p.starter,
        subbedIn: !!p.subbedIn,
        subbedOut: !!p.subbedOut,
        subMinute: sub?.clock?.displayValue ?? null,
        place: Number(p.formationPlace ?? 0),
        goals: goalsBy[p.athlete?.id] ?? stat("totalGoals"),
        yellow: plays.some((x: any) => x.yellowCard) || stat("yellowCards") > 0,
        red: plays.some((x: any) => x.redCard) || stat("redCards") > 0,
      } as LineupPlayer;
    }),
  }));

  const form: SummaryData["form"] = {};
  for (const g of d.lastFiveGames ?? []) {
    form[g.team?.id] = (g.events ?? []).map((e: any) => ({
      id: e.id,
      result: e.gameResult ?? "",
      opponent: fixText(e.opponent?.displayName),
      opponentLogo: e.opponentLogo ?? e.opponent?.logo ?? "",
      score: e.score ?? "",
      date: e.gameDate ?? "",
    }));
  }

  const match: Match = {
    id: d.header?.id ?? comp.id,
    league: {
      slug,
      name: d.header?.league?.name ?? "",
      abbr: d.header?.league?.abbreviation ?? "",
      logo: d.header?.league?.logos?.[0]?.href ?? "",
    },
    date: comp.date,
    state,
    completed: !!st.type?.completed,
    status: st.type?.shortDetail ?? "",
    statusName: st.type?.name ?? "",
    clock: st.displayClock ?? "",
    period: st.period ?? 0,
    venue: fixText(d.gameInfo?.venue?.fullName),
    city: fixText(d.gameInfo?.venue?.address?.city),
    note: fixText(comp.notes?.[0]?.headline ?? ""),
    home,
    away,
    details,
    broadcasts: (d.broadcasts ?? [])
      .map((b: any) => ({ name: b.media?.shortName || b.media?.name || "", region: String(b.region || "us").toLowerCase(), type: b.type?.shortName ?? "" }))
      .filter((b: any) => b.name),
  };

  return {
    match,
    events,
    stats,
    lineups,
    form,
    venue: match.venue,
    city: match.city,
    attendance: d.gameInfo?.attendance ?? 0,
    officials: (d.gameInfo?.officials ?? []).map((o: any) => fixText(o.displayName)),
    standings: d.standings,
  };
}

/* ------------------------------------------------------- standings ----- */

export interface TableRow {
  rank: number;
  team: { id: string; name: string; short: string; abbr: string; logo: string };
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  note: { color: string; description: string } | null;
}

export interface TableGroup {
  name: string;
  rows: TableRow[];
}

export interface StandingsData {
  season: string;
  groups: TableGroup[];
}

export function normaliseStandings(d: any): StandingsData {
  const children = d.children?.length ? d.children : d.standings ? [{ name: d.name, standings: d.standings }] : [];
  const groups: TableGroup[] = children.map((c: any) => ({
    name: fixText(c.name),
    rows: (c.standings?.entries ?? [])
      .map((e: any) => {
        const s = (n: string) => Number(e.stats?.find((x: any) => x.name === n)?.value ?? 0);
        const t = e.team ?? {};
        return {
          rank: s("rank") || 0,
          team: {
            id: t.id,
            name: fixText(t.displayName),
            short: fixText(t.shortDisplayName || t.displayName),
            abbr: t.abbreviation,
            logo: t.logos?.[0]?.href ?? "",
          },
          gp: s("gamesPlayed"),
          w: s("wins"),
          d: s("ties"),
          l: s("losses"),
          gf: s("pointsFor"),
          ga: s("pointsAgainst"),
          gd: s("pointDifferential"),
          pts: s("points"),
          note: e.note ? { color: e.note.color, description: e.note.description } : null,
        } as TableRow;
      })
      .sort((a: TableRow, b: TableRow) => a.rank - b.rank),
  }));
  return { season: d.children?.[0]?.standings?.seasonDisplayName ?? d.seasons?.[0]?.displayName ?? "", groups };
}

/* --------------------------------------------------------- leaders ----- */

export interface Leader {
  id: string;
  name: string;
  value: number;
  display: string;
  team: { id: string; name: string; logo: string };
  matches: number | null;
}

export function normaliseLeaders(d: any): { goals: Leader[]; assists: Leader[] } {
  const pick = (name: string): Leader[] => {
    const cat = (d.stats ?? []).find((s: any) => s.name === name);
    return (cat?.leaders ?? []).map((l: any) => {
      const a = l.athlete ?? {};
      const team = a.team ?? {};
      const m = /Matches:\s*(\d+)/.exec(l.displayValue ?? "");
      return {
        id: a.id,
        name: fixText(a.displayName),
        value: Number(l.value ?? 0),
        display: l.displayValue ?? "",
        team: { id: team.id, name: fixText(team.displayName ?? team.name), logo: team.logos?.[0]?.href ?? "" },
        matches: m ? Number(m[1]) : null,
      };
    });
  };
  return { goals: pick("goalsLeaders"), assists: pick("assistsLeaders") };
}

/* ------------------------------------------------------------ news ----- */

export interface Article {
  id: string;
  headline: string;
  description: string;
  image: string;
  url: string;
  published: string;
  byline: string;
}

export function normaliseNews(d: any): Article[] {
  return (d.articles ?? [])
    .filter((a: any) => a.links?.web?.href)
    .map((a: any) => ({
      id: String(a.id ?? a.headline),
      headline: fixText(a.headline),
      description: fixText(a.description),
      image: a.images?.find((i: any) => i.type === "header" || i.ratio === "16x9")?.url ?? a.images?.[0]?.url ?? "",
      url: a.links.web.href,
      published: a.published ?? a.lastModified ?? "",
      byline: fixText(a.byline ?? ""),
    }));
}

/* ----------------------------------------------------- team schedule --- */

export interface TeamGame {
  id: string;
  date: string;
  league: string;
  leagueSlug: string;
  state: "pre" | "in" | "post";
  status: string;
  home: Side;
  away: Side;
}

export function normaliseSchedule(d: any): TeamGame[] {
  return (d.events ?? []).map((e: any) => {
    const comp = e.competitions?.[0] ?? {};
    const st = comp.status ?? e.status ?? {};
    const comps = comp.competitors ?? [];
    const mk = (c: any): Side => {
      const t = c?.team ?? {};
      const score = c?.score;
      return {
        id: t.id,
        name: fixText(t.displayName),
        short: fixText(t.shortDisplayName || t.displayName),
        abbr: t.abbreviation,
        logo: t.logos?.[0]?.href ?? t.logo ?? "",
        color: null,
        altColor: null,
        score: score === undefined ? null : Number(typeof score === "object" ? score.value ?? score.displayValue : score),
        shootout: null,
        winner: !!c?.winner,
        form: "",
        record: "",
      };
    };
    const home = mk(comps.find((c: any) => c.homeAway === "home") ?? comps[0]);
    const away = mk(comps.find((c: any) => c.homeAway === "away") ?? comps[1]);
    const state = st.type?.state ?? "pre";
    if (state === "pre") {
      home.score = null;
      away.score = null;
    }
    return {
      id: e.id,
      date: e.date,
      league: e.league?.abbreviation ?? e.league?.name ?? e.season?.displayName ?? "",
      leagueSlug: e.league?.slug ?? "",
      state,
      status: st.type?.shortDetail ?? "",
      home,
      away,
    };
  });
}

/* ------------------------------------------------------------- squad --- */

export interface SquadPlayer {
  id: string;
  name: string;
  jersey: string;
  position: string;
  group: "Goalkeepers" | "Defenders" | "Midfielders" | "Forwards" | "Squad";
  age: number | null;
  height: string;
  nationality: string;
  flag: string;
  dob: string;
}

export function normaliseRoster(d: any): SquadPlayer[] {
  const groupOf = (abbr: string, name: string): SquadPlayer["group"] => {
    const a = (abbr || name || "").toUpperCase();
    if (a.startsWith("G")) return "Goalkeepers";
    if (a.startsWith("D")) return "Defenders";
    if (a.startsWith("M")) return "Midfielders";
    if (a.startsWith("F")) return "Forwards";
    return "Squad";
  };
  return (d.athletes ?? []).map((a: any) => ({
    id: a.id,
    name: fixText(a.displayName),
    jersey: a.jersey ?? "",
    position: a.position?.displayName ?? "",
    group: groupOf(a.position?.abbreviation, a.position?.name),
    age: a.age ?? null,
    height: a.displayHeight ?? "",
    nationality: a.citizenship ?? a.flag?.alt ?? "",
    flag: a.flag?.href ?? "",
    dob: a.dateOfBirth ?? "",
  }));
}
