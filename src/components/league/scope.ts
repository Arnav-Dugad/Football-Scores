import { isLive, isPlayed, isUpcoming, table, type SeasonData } from "../../lib/analytics";

/* Pure, React-free helpers shared by the league hub, tables and tests. */

/** Max games per club in a league phase (new UEFA format). */
export const PHASE_GAMES: Record<string, number> = { "uefa.champions": 8, "uefa.europa": 8 };

export const isUefa = (league: string) => league.startsWith("uefa.");

const memo = new WeakMap<object, Map<string, unknown>>();

/** Memoise a derived value per dataset object. */
export function derive<T>(owner: object, key: string, fn: () => T): T {
  let m = memo.get(owner);
  if (!m) memo.set(owner, (m = new Map()));
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

const counts = (m: SeasonData["matches"][number]) => isPlayed(m) || isUpcoming(m) || isLive(m);

export function scopeSeason(season: SeasonData, teamIds: string[] | null, cap?: number): SeasonData {
  if (!teamIds?.length && !cap) return season;
  const ids = teamIds?.length ? new Set(teamIds) : null;
  let matches = season.matches.filter((m) => !ids || (ids.has(m.h) && ids.has(m.a)));
  if (cap) {
    matches = [...matches].sort((a, b) => a.d.localeCompare(b.d));
    const n = new Map<string, number>();
    matches = matches.filter((m) => {
      if (!counts(m)) return true; // void fixtures don't use a slot
      const nh = n.get(m.h) ?? 0;
      const na = n.get(m.a) ?? 0;
      if (nh >= cap || na >= cap) return false;
      n.set(m.h, nh + 1);
      n.set(m.a, na + 1);
      return true;
    });
  }
  const keep = new Set(matches.map((m) => m.id));
  const teams = ids ? season.teams.filter((t) => ids.has(t.id)) : season.teams;
  return { ...season, teams, matches, events: season.events.filter((e) => keep.has(e.m)) };
}


/**
 * League position after every matchday, ranked within `teamIds`.
 *
 * A match belongs to matchday max(game number of either club), so a full
 * round counts as one step even when it spans several days or runs into the
 * next one, and rearranged games count where they were actually played.
 * The final matchday therefore equals the current table.
 */
export function groupPositions(season: SeasonData, teamIds: string[]): { dates: string[]; ranks: Map<string, number[]> } {
  const games = season.matches.filter(isPlayed).sort((a, b) => a.d.localeCompare(b.d));
  const count = new Map<string, number>();
  const day = new Map<string, number>();
  const dates: string[] = [];
  for (const m of games) {
    const h = (count.get(m.h) ?? 0) + 1;
    const a = (count.get(m.a) ?? 0) + 1;
    count.set(m.h, h);
    count.set(m.a, a);
    const k = Math.max(h, a);
    day.set(m.id, k);
    if (!dates[k - 1] || m.d > dates[k - 1]) dates[k - 1] = m.d;
  }
  const ranks = new Map<string, number[]>(teamIds.map((id) => [id, []]));
  for (let k = 1; k <= dates.length; k++) {
    const sub = { ...season, matches: games.filter((m) => day.get(m.id)! <= k) };
    for (const row of table(sub, { teams: teamIds })) ranks.get(row.team)?.push(row.rank);
  }
  // Matchdays with no games of their own (gaps) inherit the previous date.
  for (let k = 0; k < dates.length; k++) if (!dates[k]) dates[k] = dates[k - 1] ?? "";
  return { dates, ranks };
}

/**
 * Is the shot-based xG trustworthy for this dataset? When the provider omits
 * shot locations for many matches, xG collapses far below actual goals
 * (e.g. 1.5 xG vs 3.3 goals a game). Require xG to account for at least 60%
 * of the goals scored in the same matches, over a minimum sample.
 */
export function xgReliable(season: SeasonData): boolean {
  return derive(season, "xgReliable", () => {
    let xg = 0;
    let goals = 0;
    let n = 0;
    for (const m of season.matches) {
      if (!isPlayed(m) || m.hx === null || m.ax === null) continue;
      xg += m.hx + m.ax;
      goals += m.hs! + m.as!;
      n++;
    }
    return n >= 5 && (goals === 0 || xg / goals >= 0.6);
  });
}
