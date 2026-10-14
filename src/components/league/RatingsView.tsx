import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { elo, fixtureDifficulty } from "../../lib/analytics";
import { fmtNum } from "../../lib/format";
import { ChartCard, DataTable, SignedDelta } from "../charts/core";
import { DifficultyGrid, Sparkline, type FdxRow } from "../charts/Grids";
import { IconStats } from "../Icons";
import { Crest, Empty, Segmented, Skeleton } from "../ui";
import { PartialNote } from "./chrome";
import { derive, playedCount, teamOf, type LeagueData } from "./data";
import { rankedIds } from "./RaceView";

export function RatingsView({ data }: { data: LeagueData }) {
  const { season, teams, league } = data;
  const ratings = useMemo(() => (season ? derive(season, "elo", () => elo(season)) : null), [season]);

  const rows = useMemo(() => {
    if (!ratings) return [];
    return [...ratings.now.entries()]
      .map(([id, r]) => {
        const h = ratings.history.get(id) ?? [];
        const from = h[Math.max(0, h.length - 6)]?.r ?? r;
        return { id, r, d5: h.length > 1 ? r - from : 0, games: Math.max(0, h.length - 1), spark: h.map((p) => p.r) };
      })
      .sort((a, b) => b.r - a.r);
  }, [ratings]);

  if (data.seasonLoading) return <Skeleton h={640} r={32} />;
  if (!season || !ratings || !rows.length)
    return (
      <Empty icon={<IconStats />} title={t("Ratings unavailable")}>
        {t("Season data for this competition hasn’t loaded yet.")}
      </Empty>
    );

  const played = playedCount(season);
  return (
    <>
      <ChartCard
        id="elo"
        title={t("Pitch Elo ratings")}
        subtitle={t("Strength ratings that move after every result — beating a strong side away earns more than beating a weak one at home.")}
        flush
        footnote={
          <>
            {t(
              "Method: World Football Elo. Every club starts from last season’s points per game (promoted or new clubs start below average); each result moves ratings by K = {k} × a goal-margin multiplier × (result − expected result), with {ha} points of home advantage.",
              { k: 22, ha: ratings.homeAdv },
            )}{" "}
            {played < 30 ? t("Early in the season ratings still lean on last season.") : null}
            <PartialNote building={data.building} progress={data.progress} />
          </>
        }
        table={
          <DataTable
            columns={[{ label: t("Club") }, { label: t("Rating") }, { label: t("Last 5") }, { label: t("Games") }]}
            rows={rows.map((r) => [teamOf(teams, r.id).name, fmtNum(r.r), r.d5 > 0 ? `+${fmtNum(r.d5)}` : fmtNum(r.d5), fmtNum(r.games)])}
          />
        }
      >
        <div className="table-scroll">
          <table className="standings an-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col" className="club">
                  {t("Club")}
                </th>
                <th scope="col">{t("Rating")}</th>
                <th scope="col" title={t("Change over the last five games")}>
                  {t("Last 5")}
                </th>
                <th scope="col" className="hide-sm">
                  {t("Trend")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const tm = teamOf(teams, r.id);
                return (
                  <tr key={r.id} style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}>
                    <td className="pos">{i + 1}</td>
                    <td className="club">
                      <Link to={`/team/${league}/${r.id}`} className="inner">
                        <Crest src={tm.logo} size={24} alt="" />
                        <span>{tm.name}</span>
                      </Link>
                    </td>
                    <td className="pts">{fmtNum(r.r)}</td>
                    <td>
                      <SignedDelta v={r.d5} />
                    </td>
                    <td className="hide-sm an-sparkcell">
                      <Sparkline values={r.spark} label={t("{club} rating trend", { club: tm.name })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <Difficulty data={data} ratings={ratings} />
    </>
  );
}

function Difficulty({ data, ratings }: { data: LeagueData; ratings: ReturnType<typeof elo> }) {
  const { season, teams, league } = data;
  const [sort, setSort] = useState<"easy" | "hard" | "table">("easy");
  const fdx = useMemo(() => (season ? derive(season, "fdx5", () => fixtureDifficulty(season, ratings, 5)) : null), [season, ratings]);
  const order = useMemo(() => (data.groups.length ? data.groups.flatMap((_, i) => rankedIds(data, i)) : []), [data]);

  const rows = useMemo<FdxRow[]>(() => {
    if (!fdx) return [];
    const list = [...fdx.entries()].map(([id, fx]) => {
      const tm = teamOf(teams, id);
      return {
        id,
        name: tm.name,
        short: tm.short,
        logo: tm.logo,
        avg: fx.length ? fx.reduce((a, f) => a + f.difficulty, 0) / fx.length : null,
        cells: fx.map((f) => {
          const o = teamOf(teams, f.opponent);
          return {
            matchId: f.match.id,
            opp: { id: o.id, name: o.name, short: o.short, logo: o.logo },
            home: f.home,
            difficulty: f.difficulty,
            winProb: f.winProb,
            date: f.match.d,
          };
        }),
      };
    });
    const rank = new Map(order.map((id, i) => [id, i]));
    return list.sort((a, b) => {
      if (sort === "table" || a.avg === null || b.avg === null) {
        if (a.avg === null && b.avg !== null) return 1;
        if (b.avg === null && a.avg !== null) return -1;
        return (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99);
      }
      return (sort === "easy" ? a.avg - b.avg : b.avg - a.avg) || (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99);
    });
  }, [fdx, teams, sort, order]);

  const any = rows.some((r) => r.cells.length);
  return (
    <ChartCard
      id="fixture-difficulty"
      title={t("Fixture difficulty")}
      subtitle={t("Each club’s next five matches, rated 1 (easiest) to 5 (hardest) from the chance of not winning — opponent strength and venue included.")}
      actions={
        any ? (
          <Segmented
            options={[
              { value: "easy", label: t("Easiest") },
              { value: "hard", label: t("Hardest") },
              { value: "table", label: t("Table") },
            ]}
            value={sort}
            onChange={setSort}
          />
        ) : undefined
      }
      footnote={any ? t("Win probabilities come from the Elo ratings above and a Poisson goals model.") : undefined}
    >
      {any ? <DifficultyGrid rows={rows} league={league} /> : <p className="an-empty-chart">{t("No upcoming fixtures are scheduled.")}</p>}
    </ChartCard>
  );
}
