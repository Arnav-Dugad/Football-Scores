import type { WireMatch } from "../../shared/scoreboard";
import type { PeopleData, SeasonData } from "../../shared/season";
import { fixText } from "../../shared/text";
import { ESPN_SITE, ESPN_WEB, upstream, type Env } from "../common";
import { LEAGUE_FACTS, crestUrl } from "./leagues";

/* Facts behind share cards and link previews. Runs inside the Renderer DO,
   so parsing the larger ESPN payloads never touches Worker CPU. */

export interface Side {
  id: string;
  name: string;
  short: string;
  color: string | null;
  logo: string;
}

export interface MatchFacts {
  id: string;
  league: string;
  date: string;
  state: "pre" | "in" | "post";
  status: string; // ESPN status name, e.g. STATUS_FULL_TIME
  clock: string; // live minute ("67'") when known
  home: Side;
  away: Side;
  hs: number | null;
  as: number | null;
  hp: number | null;
  ap: number | null;
  venue: string;
}

export interface TeamFacts {
  id: string;
  league: string;
  name: string;
  short: string;
  color: string | null;
  alt: string | null;
  logo: string;
  standing: string; // "9th in English Premier League"
  record: string; // "W3 D0 L1"
  points: number | null;
}

export interface PlayerFacts {
  id: string;
  league: string;
  name: string;
  position: string;
  nationality: string;
  age: number | null;
  jersey: string;
  headshot: string;
  team: Side | null;
}

const hex = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toLowerCase()}` : null;
};
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export const LIVE_CLOCK = (m: Pick<MatchFacts, "state" | "clock" | "status">) =>
  m.state === "in" ? (m.status === "STATUS_HALFTIME" ? "HT" : m.clock || "LIVE") : "";

export function hubStub(env: Env) {
  return env.LIVE.get(env.LIVE.idFromName("live-enam"), { locationHint: "enam" });
}
export function leagueStub(env: Env, slug: string) {
  return env.LEAGUE.get(env.LEAGUE.idFromName(slug));
}

function fromWire(m: WireMatch): MatchFacts {
  const side = (s: WireMatch["home"]): Side => ({ id: s.id, name: s.name, short: s.short || s.name, color: hex(s.color), logo: s.logo });
  return {
    id: m.id,
    league: m.league.slug,
    date: m.date,
    state: m.state,
    status: m.statusName,
    clock: m.clock,
    home: side(m.home),
    away: side(m.away),
    hs: m.home.score,
    as: m.away.score,
    hp: num(m.home.shootout),
    ap: num(m.away.shootout),
    venue: m.venue,
  };
}

/** Match facts: LeagueStore row first (cheap), live hub for the minute, ESPN summary as a last resort. */
export async function matchFacts(env: Env, league: string, id: string, snapshot: () => Promise<Map<string, WireMatch>>): Promise<MatchFacts | null> {
  let facts: MatchFacts | null = null;
  try {
    const row = JSON.parse(await leagueStub(env, league).match(league, id)) as Record<string, unknown> | null;
    if (row && row.hn && row.an) {
      const side = (tid: unknown, n: unknown, c: unknown, l: unknown): Side => ({
        id: String(tid ?? ""),
        name: fixText(String(n ?? "")),
        short: fixText(String(n ?? "")),
        color: hex(c),
        logo: String(l ?? "") || crestUrl(String(tid ?? "")),
      });
      facts = {
        id,
        league,
        date: String(row.d ?? ""),
        state: (row.s as MatchFacts["state"]) ?? "pre",
        status: String(row.st ?? ""),
        clock: "",
        home: side(row.h, row.hn, row.hc, row.hl),
        away: side(row.a, row.an, row.ac, row.al),
        hs: num(row.hs),
        as: num(row.as_ ?? row.as),
        hp: num(row.hp),
        ap: num(row.ap),
        venue: fixText(String(row.v ?? "")),
      };
    }
  } catch {
    /* fall through */
  }

  // Today's matches: the hub has the freshest score and the live minute.
  if (!facts || facts.state !== "post") {
    try {
      const live = (await snapshot()).get(id);
      if (live && live.league.slug === league) {
        const w = fromWire(live);
        facts = facts ? { ...w, home: { ...w.home, color: w.home.color ?? facts.home.color }, away: { ...w.away, color: w.away.color ?? facts.away.color } } : w;
      }
    } catch {
      /* ignore */
    }
  }
  if (facts) return facts;

  // Not synced yet (or another season): the summary header has everything we need.
  try {
    const d = await upstream<any>(`${ESPN_SITE}/${league}/summary?event=${id}`, 6000);
    const comp = d?.header?.competitions?.[0];
    if (!comp) return null;
    const cs = comp.competitors ?? [];
    const pick = (ha: string) => cs.find((c: any) => c.homeAway === ha) ?? cs[ha === "home" ? 0 : 1];
    const side = (c: any): Side => {
      const t = c?.team ?? {};
      return {
        id: String(t.id ?? ""),
        name: fixText(t.displayName ?? t.name ?? ""),
        short: fixText(t.shortDisplayName ?? t.displayName ?? ""),
        color: hex(t.color),
        logo: t.logos?.[0]?.href ?? t.logo ?? (t.id ? crestUrl(String(t.id)) : ""),
      };
    };
    const st = comp.status ?? {};
    const state = (st.type?.state ?? "pre") as MatchFacts["state"];
    const h = pick("home");
    const a = pick("away");
    return {
      id,
      league,
      date: comp.date ?? "",
      state,
      status: st.type?.name ?? "",
      clock: st.displayClock ?? "",
      home: side(h),
      away: side(a),
      hs: state === "pre" ? null : num(h?.score),
      as: state === "pre" ? null : num(a?.score),
      hp: num(h?.shootoutScore),
      ap: num(a?.shootoutScore),
      venue: fixText(d?.gameInfo?.venue?.fullName ?? ""),
    };
  } catch {
    return null;
  }
}

export async function teamFacts(league: string, id: string): Promise<TeamFacts | null> {
  try {
    const d = await upstream<any>(`${ESPN_SITE}/${league}/teams/${id}`, 6000);
    const t = d?.team;
    if (!t?.displayName) return null;
    const stats: Record<string, number> = {};
    for (const s of t.record?.items?.[0]?.stats ?? []) if (typeof s?.name === "string") stats[s.name] = Number(s.value);
    const gp = stats.gamesPlayed;
    const record = Number.isFinite(gp) && gp > 0 ? `W${stats.wins ?? 0} D${stats.ties ?? 0} L${stats.losses ?? 0}` : "";
    return {
      id,
      league,
      name: fixText(t.displayName),
      short: fixText(t.shortDisplayName || t.displayName),
      color: hex(t.color),
      alt: hex(t.alternateColor),
      logo: t.logos?.[0]?.href ?? crestUrl(id),
      standing: fixText(t.standingSummary ?? ""),
      record,
      points: Number.isFinite(stats.points) ? stats.points : null,
    };
  } catch {
    return null;
  }
}

export async function playerFacts(league: string, id: string): Promise<PlayerFacts | null> {
  try {
    const d = await upstream<any>(`${ESPN_WEB}/${league}/athletes/${id}`, 6000);
    const a = d?.athlete;
    if (!a?.displayName) return null;
    const t = a.team;
    return {
      id,
      league,
      name: fixText(a.displayName),
      position: fixText(a.position?.displayName ?? a.position?.name ?? ""),
      nationality: fixText(a.citizenship ?? a.flag?.alt ?? ""),
      age: num(a.age),
      jersey: String(a.displayJersey ?? a.jersey ?? "").replace(/^#/, ""),
      headshot: a.headshot?.href ?? "",
      team: t?.id
        ? {
            id: String(t.id),
            name: fixText(t.displayName ?? t.name ?? ""),
            short: fixText(t.shortDisplayName ?? t.displayName ?? ""),
            color: hex(t.color),
            logo: t.logos?.[0]?.href ?? crestUrl(String(t.id)),
          }
        : null,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------- local fast paths --- */

const OFF = /POSTPONED|CANCEL|ABANDON|SUSPEND/;

/** True once the LeagueStore has synced every match-day, so derived tables are complete. */
export function seasonComplete(season: SeasonData | null): season is SeasonData {
  return !!season && season.progress.dates > 0 && season.progress.datesDone >= season.progress.dates;
}

/**
 * Club facts from the synced season — no upstream request. The league
 * position is only stated when it is unambiguous (no other club on the same
 * points, where competition-specific tie-breakers would decide), and never
 * for MLS, whose table is split into conferences.
 */
export function teamFromSeason(season: SeasonData | null, league: string, id: string): TeamFacts | null {
  if (!seasonComplete(season)) return null;
  const team = season.teams.find((t) => t.id === id);
  if (!team) return null;
  const rows = new Map<string, { w: number; d: number; l: number; pts: number; gp: number }>();
  for (const m of season.matches) {
    if (m.s !== "post" || OFF.test(m.st) || m.hs === null || m.as === null) continue;
    for (const [tid, f, a] of [
      [m.h, m.hs, m.as],
      [m.a, m.as, m.hs],
    ] as const) {
      const r = rows.get(tid) ?? { w: 0, d: 0, l: 0, pts: 0, gp: 0 };
      r.gp++;
      if (f > a) (r.w++, (r.pts += 3));
      else if (f === a) (r.d++, r.pts++);
      else r.l++;
      rows.set(tid, r);
    }
  }
  const mine = rows.get(id);
  let standing = "";
  if (mine && league !== "usa.1") {
    const pts = [...rows.values()].map((r) => r.pts);
    if (pts.filter((p) => p === mine.pts).length === 1) standing = `${ordinal(1 + pts.filter((p) => p > mine.pts).length)} in ${leagueName(league)}`;
  }
  return {
    id,
    league,
    name: team.n,
    short: team.s || team.n,
    color: team.c,
    alt: null,
    logo: team.l || crestUrl(id),
    standing,
    record: mine ? `W${mine.w} D${mine.d} L${mine.l}` : "",
    points: mine ? mine.pts : null,
  };
}

/** Player facts from the LeagueStore's squad data — no upstream request. */
export function playerFromPeople(people: PeopleData | null, season: SeasonData | null, league: string, id: string): PlayerFacts | null {
  const p = people?.players.find((x) => x.id === id);
  if (!p) return null;
  const t = season?.teams.find((x) => x.id === p.t);
  return {
    id,
    league,
    name: p.n,
    position: p.posName,
    nationality: p.nat,
    age: p.age,
    jersey: p.j,
    headshot: "",
    team: t ? { id: t.id, name: t.n, short: t.s || t.n, color: t.c, logo: t.l || crestUrl(t.id) } : null,
  };
}

/** Home ground of a club, read from the season's fixtures (ESPN's team endpoint has no venue). */
export function homeVenue(season: SeasonData | null, teamId: string): string {
  if (!season) return "";
  const counts = new Map<string, number>();
  for (const m of season.matches) if (m.h === teamId && m.v) counts.set(m.v, (counts.get(m.v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/* ------------------------------------------------------------- text ---- */

export function leagueName(slug: string): string {
  return LEAGUE_FACTS[slug]?.name ?? "Football";
}

export function kickoff(iso: string, slug: string): { day: string; time: string; zone: string } {
  const f = LEAGUE_FACTS[slug];
  const tz = f?.tz ?? "UTC";
  const loc = f?.locale ?? "en-GB";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "", time: "", zone: "" };
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);
  const parts = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).formatToParts(d);
  const time = parts
    .filter((p) => p.type === "hour" || p.type === "minute" || p.type === "literal")
    .map((p) => p.value)
    .join("")
    .replace(/[^\d:]/g, "");
  const zone = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  return { day, time, zone };
}

export function statusLabel(m: MatchFacts): string {
  const s = m.status;
  if (/POSTPONED/.test(s)) return "Postponed";
  if (/CANCEL/.test(s)) return "Cancelled";
  if (/ABANDON/.test(s)) return "Abandoned";
  if (m.state === "in") return s === "STATUS_HALFTIME" ? "Half-time" : `Live${m.clock ? ` · ${m.clock}` : ""}`;
  if (m.state === "post") {
    if (m.hp !== null && m.ap !== null) return "Full time · penalties";
    if (/EXTRA|AET/.test(s)) return "Full time · after extra time";
    return "Full time";
  }
  return "Kick-off";
}


export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
