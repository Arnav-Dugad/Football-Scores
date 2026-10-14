import { normalizeOpen } from "../shared/normalize";
import { z } from "zod";
import {
  deriveStandings,
  teamId,
  leagues,
  type Dataset,
  type LeagueId,
  type Match,
} from "../shared/model";
import { cached, distributed, limitedFetch, type Env } from "./cache";
export interface FootballProvider {
  load(league: LeagueId, season: string): Promise<Dataset>;
}
export class OpenFootball implements FootballProvider {
  async load(league: LeagueId, season: string) {
    return cached(`open:${league}:${season}`, 3600, async () =>
      normalizeOpen(
        await limitedFetch(
          `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${league}.json`,
        ),
        league,
        season,
      ),
    );
  }
}
const fdTeam = z.object({ name: z.string() });
const fdSchema = z.object({
  matches: z.array(
    z.object({
      id: z.number(),
      utcDate: z.string().datetime(),
      status: z.string(),
      matchday: z.number().nullable().optional(),
      homeTeam: fdTeam,
      awayTeam: fdTeam,
      score: z.object({
        fullTime: z.object({
          home: z.number().nullable(),
          away: z.number().nullable(),
        }),
        halfTime: z.object({
          home: z.number().nullable(),
          away: z.number().nullable(),
        }),
      }),
      venue: z.string().nullable().optional(),
    }),
  ),
});
export class FootballData implements FootballProvider {
  constructor(private env: Env) {}
  async load(league: LeagueId, season: string): Promise<Dataset> {
    const code = leagues.find((x) => x.id === league)!.code;
    return cached(`fd:${league}:${season}`, 600, () =>
      distributed(this.env, `${league}:${season}`, async () => {
        const raw = fdSchema.parse(
          await limitedFetch(
            `https://api.football-data.org/v4/competitions/${code}/matches?season=${season.slice(0, 4)}`,
            { "X-Auth-Token": this.env.FOOTBALL_DATA_TOKEN! },
            this.env,
          ),
        );
        const matches = raw.matches.map((m): Match => {
          const ft = m.score.fullTime,
            ht = m.score.halfTime;
          const status: Match["status"] =
            m.status === "FINISHED"
              ? "finished"
              : m.status === "IN_PLAY"
                ? "in-play"
                : m.status === "PAUSED"
                  ? "paused"
                  : m.status === "POSTPONED"
                    ? "postponed"
                    : m.status === "CANCELLED"
                      ? "cancelled"
                      : ["SCHEDULED", "TIMED"].includes(m.status)
                        ? "scheduled"
                        : "unconfirmed";
          return {
            id: `fd-${m.id}`,
            date: m.utcDate.slice(0, 10),
            kickoff: m.utcDate,
            round: m.matchday ? `Matchday ${m.matchday}` : "Fixture",
            status,
            home: { id: teamId(m.homeTeam.name), name: m.homeTeam.name },
            away: { id: teamId(m.awayTeam.name), name: m.awayTeam.name },
            score:
              ft.home !== null && ft.away !== null ? [ft.home, ft.away] : null,
            half:
              ht.home !== null && ht.away !== null ? [ht.home, ht.away] : null,
            venue: m.venue ?? undefined,
          };
        });
        return {
          league,
          season,
          matches,
          standings: deriveStandings(matches),
          meta: {
            source: "football-data.org",
            sourceUrl: "https://www.football-data.org/",
            fetchedAt: new Date().toISOString(),
            sourceUpdatedAt: null,
            latestResult:
              matches
                .filter((x) => x.status === "finished")
                .map((x) => x.date)
                .sort()
                .at(-1) ?? null,
            mode: "delayed",
            stale: false,
            officialStandings: false,
            notice:
              "Delayed scores from the free tier; refresh every 10 minutes. In-play status is provider-reported and may be delayed. Table is calculated from completed results, not an official league table.",
          },
        };
      }),
    );
  }
}
const playerSchema = z.object({
  player: z
    .array(
      z.object({
        idPlayer: z.string(),
        strPlayer: z.string(),
        strSport: z.string().nullish(),
        strTeam: z.string().nullish(),
        strNationality: z.string().nullish(),
        strPosition: z.string().nullish(),
        dateBorn: z.string().nullish(),
        strDescriptionEN: z.string().nullish(),
      }),
    )
    .nullish(),
});
export async function players(query: string) {
  return cached(`players:${query.toLowerCase()}`, 3600, async () => {
    const raw = playerSchema.parse(
      await limitedFetch(
        `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=${encodeURIComponent(query)}`,
      ),
    );
    return {
      players: (raw.player ?? [])
        .filter((p) => p.strSport === "Soccer")
        .map((p) => ({
          id: p.idPlayer,
          name: p.strPlayer,
          team: p.strTeam ?? null,
          nationality: p.strNationality ?? null,
          position: p.strPosition ?? null,
          born: p.dateBorn ?? null,
          bio: p.strDescriptionEN?.slice(0, 1200) ?? null,
        })),
      fetchedAt: new Date().toISOString(),
      source: "TheSportsDB",
      notice:
        "Free name lookup is limited by the provider. Career and season statistics are not available. Photographs are omitted pending image-specific licensing verification.",
    };
  });
}
