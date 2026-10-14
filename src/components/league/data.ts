import { useMemo } from "react";
import { isPlayed, type SeasonData, type SeasonTeam } from "../../lib/analytics";
import { endpoints, normaliseStandings, type StandingsData, type TableRow } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSeason } from "../../lib/season";
import { PHASE_GAMES, derive, scopeSeason } from "./scope";

export { PHASE_GAMES, derive, isUefa, scopeSeason } from "./scope";

/* ==========================================================================
   League data layer for the Stats hub and Tables.

   - Scopes the season dataset to the competition's table (UEFA league phase:
     the 36 clubs and at most 8 games each, so qualifiers and knockouts never
     leak into tables/ratings).
   - Exposes the table groups (MLS conferences, UCL league phase…) from the
     authoritative ESPN standings.
   - `derive()` memoises analytics per dataset object, so switching views
     never recomputes the same thing.
   ========================================================================== */

export interface LeagueGroup {
  name: string;
  teams: string[];
  /** ESPN rows (with zone notes) — empty if standings are unavailable. */
  rows: TableRow[];
}

export interface TeamLite {
  id: string;
  name: string;
  short: string;
  abbr: string;
  logo: string;
  color: string | null;
}

export function useStandings(league: string) {
  const q = useApi<unknown>(endpoints.standings(league));
  const data = useMemo<StandingsData | null>(() => (q.data ? normaliseStandings(q.data) : null), [q.data]);
  return { ...q, standings: data };
}

/** Everything the league hub needs, scoped and memoised. */
export function useLeagueData(league: string) {
  const season = useSeason(league);
  const st = useStandings(league);

  const groups = useMemo<LeagueGroup[]>(() => {
    const gs = (st.standings?.groups ?? []).filter((g) => g.rows.length);
    if (gs.length) return gs.map((g) => ({ name: g.name, teams: g.rows.map((r) => String(r.team.id)), rows: g.rows }));
    if (season.data?.teams.length) return [{ name: "", teams: season.data.teams.map((t) => t.id), rows: [] }];
    return [];
  }, [st.standings, season.data]);

  const idsKey = groups.map((g) => g.teams.join(",")).join("|");
  const scoped = useMemo(() => {
    if (!season.data) return undefined;
    const ids = st.standings && groups.length && groups[0].rows.length ? groups.flatMap((g) => g.teams) : null;
    return scopeSeason(season.data, ids, PHASE_GAMES[league]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.data, idsKey, league]);

  const teams = useMemo(() => {
    const map = new Map<string, TeamLite>();
    for (const g of groups)
      for (const r of g.rows)
        map.set(String(r.team.id), { id: String(r.team.id), name: r.team.name, short: r.team.short, abbr: r.team.abbr, logo: r.team.logo, color: null });
    for (const t of season.data?.teams ?? []) {
      const prev = map.get(t.id);
      map.set(t.id, fromSeason(t, prev));
    }
    return map;
  }, [groups, season.data]);

  /** Authoritative rank / zone note per club (ESPN). */
  const official = useMemo(() => {
    const map = new Map<string, TableRow>();
    for (const g of groups) for (const r of g.rows) map.set(String(r.team.id), r);
    return map;
  }, [groups]);

  return {
    league,
    season: scoped,
    raw: season.data,
    building: season.building,
    progress: season.progress,
    seasonLoading: season.loading,
    seasonError: season.error,
    seasonStale: season.stale,
    reloadSeason: season.reload,
    standings: st.standings,
    standingsLoading: st.loading,
    standingsError: st.error,
    reloadStandings: st.reload,
    groups,
    teams,
    official,
  };
}

export type LeagueData = ReturnType<typeof useLeagueData>;

function fromSeason(t: SeasonTeam, prev?: TeamLite): TeamLite {
  return {
    id: t.id,
    name: prev?.name || t.n,
    short: prev?.short || t.s || t.n,
    abbr: prev?.abbr || t.ab,
    logo: prev?.logo || t.l,
    color: t.c,
  };
}

export function teamOf(teams: Map<string, TeamLite>, id: string): TeamLite {
  return teams.get(id) ?? { id, name: id, short: id, abbr: "", logo: "", color: null };
}

/** Played-game count for a dataset (used to decide whether a chart has enough to say). */
export function playedCount(season: SeasonData | undefined): number {
  if (!season) return 0;
  return derive(season, "playedCount", () => season.matches.filter(isPlayed).length);
}
