import { z } from "zod";
import {
  deriveStandings,
  teamId,
  type Match,
  type LeagueId,
  type Dataset,
} from "./model";
export const pair = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
const rawMatch = z.object({
  round: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  team1: z.string(),
  team2: z.string(),
  score: z
    .union([pair, z.object({ ft: pair.optional(), ht: pair.optional() })])
    .optional(),
});
export const rawSchema = z.object({
  name: z.string(),
  matches: z.array(rawMatch),
  provenance: z.object({ url: z.string(), retrievedAt: z.string() }).optional(),
});
export function normalizeOpen(
  raw: unknown,
  league: LeagueId,
  season: string,
  fetchedAt = new Date().toISOString(),
  stale = false,
): Dataset {
  const parsed = rawSchema.parse(raw);
  const today = new Date().toISOString().slice(0, 10);
  const matches = parsed.matches.map((m): Match => {
    const score = Array.isArray(m.score) ? m.score : (m.score?.ft ?? null);
    return {
      id: `open-${teamId(m.team1)}-${teamId(m.team2)}-${teamId(m.round ?? m.date)}`,
      date: m.date,
      kickoff: null,
      round: m.round ?? "Season fixture",
      home: { id: teamId(m.team1), name: m.team1 },
      away: { id: teamId(m.team2), name: m.team2 },
      score,
      half: !Array.isArray(m.score) ? (m.score?.ht ?? null) : null,
      status: score ? "finished" : m.date < today ? "unconfirmed" : "scheduled",
    };
  });
  return {
    league,
    season,
    matches,
    standings: deriveStandings(matches),
    meta: {
      source: "OpenFootball",
      sourceUrl:
        parsed.provenance?.url ??
        `https://github.com/openfootball/football.json/blob/master/${season}/${league}.json`,
      fetchedAt,
      sourceUpdatedAt: parsed.provenance?.retrievedAt ?? null,
      latestResult:
        matches
          .filter((x) => x.score)
          .map((x) => x.date)
          .sort()
          .at(-1) ?? null,
      mode: "community",
      stale,
      officialStandings: false,
      notice:
        "Community fixtures & results. No live feed. Kickoff timezone is unverified; only fixture dates are shown. Table calculated from recorded results; deductions and official tie-breaks are not applied.",
    },
  };
}
