import type { WireMatch } from "../../shared/scoreboard";
import type { SeasonData, SeasonMatch, SeasonTeam } from "../../shared/season";
import { crestUrl, leagueLogoUrl, LEAGUE_FACTS } from "./leagues";

/* Compact feed for /api/widget — built in the Renderer DO from the live hub
   snapshot and the LeagueStore season, so the Worker only relays a string. */

export interface WidgetSide {
  id: string;
  name: string;
  short: string;
  abbr: string;
  logo: string;
  color: string | null;
  score: number | null;
  pens: number | null;
}

export interface WidgetMatch {
  id: string;
  league: { slug: string; name: string; logo: string };
  date: string;
  state: "pre" | "in" | "post";
  status: string; // short ESPN detail, e.g. "FT", "HT", "67'"
  clock: string;
  off: boolean; // postponed / cancelled / abandoned
  home: WidgetSide;
  away: WidgetSide;
  url: string;
}

export interface WidgetTeam {
  id: string;
  league: string;
  name: string;
  short: string;
  abbr: string;
  logo: string;
  color: string | null;
  url: string;
}

export type WidgetFeed =
  | { mode: "team"; team: WidgetTeam | null; live: WidgetMatch | null; next: WidgetMatch | null; last: WidgetMatch | null; updated: string }
  | { mode: "leagues"; leagues: string[]; matches: WidgetMatch[]; live: number; updated: string };

const OFF = /POSTPONED|CANCEL|ABANDON|SUSPEND/;

const league = (slug: string) => ({ slug, name: LEAGUE_FACTS[slug]?.name ?? slug, logo: leagueLogoUrl(slug, 96) });

export function fromWire(m: WireMatch): WidgetMatch {
  const side = (s: WireMatch["home"]): WidgetSide => ({
    id: s.id,
    name: s.name,
    short: s.short || s.name,
    abbr: s.abbr,
    logo: s.logo || (s.id ? crestUrl(s.id, 96) : ""),
    color: s.color,
    score: s.score,
    pens: s.shootout === null || s.shootout === undefined ? null : Number(s.shootout),
  });
  return {
    id: m.id,
    league: league(m.league.slug),
    date: m.date,
    state: m.state,
    status: m.status,
    clock: m.clock,
    off: OFF.test(m.statusName),
    home: side(m.home),
    away: side(m.away),
    url: `/match/${m.league.slug}/${m.id}`,
  };
}

function fromSeason(m: SeasonMatch, slug: string, teams: Map<string, SeasonTeam>): WidgetMatch {
  const side = (id: string, score: number | null, pens: number | null): WidgetSide => {
    const t = teams.get(id);
    return {
      id,
      name: t?.n ?? "",
      short: t?.s || t?.n || "",
      abbr: t?.ab ?? "",
      logo: t?.l || crestUrl(id, 96),
      color: t?.c ?? null,
      score: m.s === "pre" ? null : score,
      pens,
    };
  };
  return {
    id: m.id,
    league: league(slug),
    date: m.d,
    state: m.s,
    status: m.s === "post" ? "FT" : "",
    clock: "",
    off: OFF.test(m.st),
    home: side(m.h, m.hs, m.hp),
    away: side(m.a, m.as, m.ap),
    url: `/match/${slug}/${m.id}`,
  };
}

export function teamFeed(teamId: string, slug: string, snapshot: WireMatch[], season: SeasonData | null, now = Date.now()): WidgetFeed {
  const teams = new Map((season?.teams ?? []).map((t) => [t.id, t]));
  const involved = (m: { home: { id: string }; away: { id: string } }) => m.home.id === teamId || m.away.id === teamId;

  // Fresh state for today's matches comes from the hub.
  const today = snapshot.filter((m) => involved(m)).map(fromWire);
  const byId = new Map(today.map((m) => [m.id, m]));

  const fromDb = (season?.matches ?? []).filter((m) => m.h === teamId || m.a === teamId).map((m) => byId.get(m.id) ?? fromSeason(m, slug, teams));
  for (const m of today) if (!fromDb.some((x) => x.id === m.id)) fromDb.push(m);
  const all = fromDb.filter((m) => !m.off).sort((a, b) => a.date.localeCompare(b.date));

  const live = all.find((m) => m.state === "in") ?? null;
  const next = all.find((m) => m.state === "pre" && Date.parse(m.date) > now - 3 * 3600e3) ?? null;
  const last = [...all].reverse().find((m) => m.state === "post") ?? null;

  let team: WidgetTeam | null = null;
  const url = `/team/${slug}/${teamId}`;
  const st = teams.get(teamId);
  if (st) {
    team = { id: teamId, league: slug, name: st.n, short: st.s || st.n, abbr: st.ab, logo: st.l || crestUrl(teamId, 96), color: st.c, url };
  } else {
    const any = [live, next, last, ...today].find((m): m is WidgetMatch => !!m);
    const s = any ? (any.home.id === teamId ? any.home : any.away) : null;
    if (s) team = { id: teamId, league: slug, name: s.name, short: s.short, abbr: s.abbr, logo: s.logo, color: s.color, url };
  }
  return { mode: "team", team, live, next, last, updated: new Date(now).toISOString() };
}

export function leaguesFeed(slugs: string[], snapshot: WireMatch[], now = Date.now()): WidgetFeed {
  const want = new Set(slugs);
  const order = Object.keys(LEAGUE_FACTS);
  const rank = (m: WidgetMatch) => (m.state === "in" ? 0 : m.state === "pre" ? 1 : 2);
  const matches = snapshot
    .filter((m) => want.has(m.league.slug))
    .map(fromWire)
    .filter((m) => {
      const t = Date.parse(m.date);
      if (m.state === "in") return true;
      if (m.state === "pre") return t > now - 3 * 3600e3 && t < now + 24 * 3600e3;
      return t > now - 14 * 3600e3;
    })
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r) return r;
      if (a.state === "post") return b.date.localeCompare(a.date);
      const d = a.date.localeCompare(b.date);
      return d || order.indexOf(a.league.slug) - order.indexOf(b.league.slug);
    })
    .slice(0, 20);
  return { mode: "leagues", leagues: slugs, matches, live: matches.filter((m) => m.state === "in").length, updated: new Date(now).toISOString() };
}
