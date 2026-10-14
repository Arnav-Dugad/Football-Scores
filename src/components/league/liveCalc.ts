import type { WireMatch } from "../../../shared/scoreboard";
import { table, type Row, type SeasonData, type SeasonMatch } from "../../lib/analytics";
import type { TableGroup, TableRow } from "../../lib/api";
import type { LiveCell } from "../table";
import { derive } from "./scope";

/* ==========================================================================
   Live table (pure). ESPN standings stay authoritative (deductions,
   head-to-head tie-breaks, zone notes); while matches are in play each live
   result is added on top — computed with analytics.table({ overrides }) —
   then the table is re-ranked and movement since kick-off reported.
   ========================================================================== */

export function toSeasonMatch(m: WireMatch): SeasonMatch {
  return {
    id: m.id,
    d: m.date,
    s: m.state,
    st: m.statusName,
    h: String(m.home.id),
    a: String(m.away.id),
    hs: null,
    as: null,
    hp: null,
    ap: null,
    v: m.venue,
    ref: null,
    att: null,
    hx: null,
    ax: null,
    hsh: null,
    ash: null,
    det: 0,
  };
}

/** Table rows contributed by just these matches (gp/w/d/l/gf/ga/pts per club). */
export function deltas(matches: WireMatch[], teamIds: string[]): Map<string, Row> {
  if (!matches.length) return new Map();
  const shell: SeasonData = {
    league: "",
    season: null,
    teams: teamIds.map((id) => ({ id, n: id, s: id, ab: "", l: "", c: null })),
    matches: matches.map(toSeasonMatch),
    events: [],
    seed: {},
    progress: { dates: 0, datesDone: 0, details: 0, detailsDone: 0 },
    updated: 0,
  };
  const overrides = matches.map((m) => ({ ...toSeasonMatch(m), hs: m.home.score, as: m.away.score }));
  return new Map(table(shell, { overrides, teams: teamIds }).map((r) => [r.team, r]));
}

export interface LiveGroup {
  group: TableGroup;
  moves: Map<string, number>;
  live: Map<string, LiveCell>;
}

function applyDeltas(rows: TableRow[], add: Map<string, Row>): TableRow[] {
  return rows.map((r) => {
    const d = add.get(String(r.team.id));
    if (!d || !d.gp) return { ...r };
    return { ...r, gp: r.gp + d.gp, w: r.w + d.w, d: r.d + d.d, l: r.l + d.l, gf: r.gf + d.gf, ga: r.ga + d.ga, gd: r.gd + d.gf - d.ga, pts: r.pts + d.pts };
  });
}

/** Points, goal difference, goals for — then the official order (a proxy for head-to-head and other tie-breaks). */
function rerank(rows: TableRow[]): TableRow[] {
  const sorted = [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.rank - b.rank);
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * @param live      matches in play (state "in") for this competition
 * @param finished  recently finished matches — added only where ESPN's table
 *                  hasn't caught up yet (its games-played lags the season data)
 */
export function computeLiveTables(groups: TableGroup[], live: WireMatch[], finished: WireMatch[], season: SeasonData | undefined): LiveGroup[] | null {
  if (!live.length) return null;
  const seasonGp = season
    ? derive(season, `gp|${finished.map((m) => m.id).join(",")}`, () => {
        const ov = finished.map((m) => ({ ...toSeasonMatch(m), s: "post" as const, hs: m.home.score, as: m.away.score }));
        return new Map(table(season, { overrides: ov }).map((r) => [r.team, r.gp]));
      })
    : null;

  return groups.map((g) => {
    const ids = g.rows.map((r) => String(r.team.id));
    const inGroup = new Set(ids);
    const touches = (m: WireMatch) => inGroup.has(String(m.home.id)) || inGroup.has(String(m.away.id));
    const lag = seasonGp
      ? finished.filter(
          (m) =>
            touches(m) &&
            [m.home, m.away].some((s) => {
              const row = g.rows.find((r) => String(r.team.id) === String(s.id));
              const sg = seasonGp.get(String(s.id));
              return !!row && sg !== undefined && row.gp < sg;
            }),
        )
      : [];
    // Pre-live table: ESPN (+ any result it hasn't caught up with yet).
    const base = lag.length ? rerank(applyDeltas(g.rows, deltas(lag, ids))) : g.rows.map((r) => ({ ...r }));
    const now = rerank(applyDeltas(base, deltas(live.filter(touches), ids)));
    // Zone notes belong to positions, not clubs.
    const noteAt = new Map(g.rows.map((r) => [r.rank, r.note]));
    for (const r of now) r.note = noteAt.get(r.rank) ?? null;
    const before = new Map(base.map((r) => [String(r.team.id), r.rank]));
    const moves = new Map(now.map((r) => [String(r.team.id), (before.get(String(r.team.id)) ?? r.rank) - r.rank]));

    const cells = new Map<string, LiveCell>();
    for (const m of live) {
      for (const [us, them] of [
        [m.home, m.away],
        [m.away, m.home],
      ] as const) {
        if (!inGroup.has(String(us.id))) continue;
        const a = us.score ?? 0;
        const b = them.score ?? 0;
        cells.set(String(us.id), {
          score: `${a}–${b}`,
          result: a > b ? "W" : a < b ? "L" : "D",
          opponent: { name: them.name, logo: them.logo },
          clock: m.status || m.clock,
          matchId: m.id,
        });
      }
    }
    return { group: { name: g.name, rows: now }, moves, live: cells };
  });
}
