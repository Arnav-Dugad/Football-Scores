import { useMemo, useState } from "react";
import { t } from "../../i18n";
import { table, type Row } from "../../lib/analytics";
import { fmtNum } from "../../lib/format";
import { Dumbbell } from "../charts/Bars";
import { ChartCard } from "../charts/core";
import { IconTable } from "../Icons";
import { ComputedTable } from "../table";
import { Empty, Segmented, Skeleton } from "../ui";
import { GroupPicker, PartialNote } from "./chrome";
import { derive, playedCount, teamOf, type LeagueData } from "./data";
import { rankedIds } from "./RaceView";

/** Places a club sits above (+) or below (−) its rank in the real table. */
export function movesVsTable(rows: Row[], realOrder: string[]): Map<string, number> {
  const real = new Map(realOrder.map((id, i) => [id, i + 1]));
  return new Map(rows.map((r) => [r.team, (real.get(r.team) ?? r.rank) - r.rank]));
}

export function FormView({ data }: { data: LeagueData }) {
  const { season, groups, teams, league } = data;
  const [gi, setGi] = useState(0);
  const [n, setN] = useState<"5" | "10">("5");
  const group = groups[gi] ?? groups[0];
  const ids = group?.teams;
  const real = useMemo(() => (groups.length ? rankedIds(data, gi) : []), [data, gi, groups.length]);

  const form = useMemo(
    () => (season ? derive(season, `form${n}|${gi}`, () => table(season, { lastN: Number(n), teams: ids })) : []),
    [season, n, gi, ids],
  );
  const home = useMemo(() => (season ? derive(season, `home|${gi}`, () => table(season, { venue: "home", teams: ids })) : []), [season, gi, ids]);
  const away = useMemo(() => (season ? derive(season, `away|${gi}`, () => table(season, { venue: "away", teams: ids })) : []), [season, gi, ids]);

  if (data.seasonLoading) return <Skeleton h={640} r={32} />;
  if (!season || playedCount(season) === 0)
    return (
      <Empty icon={<IconTable />} title={t("No form yet")}>
        {t("Form tables appear once matches have been played.")}
      </Empty>
    );

  const awayById = new Map(away.map((r) => [r.team, r]));
  const dumb = home
    .map((h) => {
      const a = awayById.get(h.team);
      const tm = teamOf(teams, h.team);
      return {
        key: h.team,
        label: tm.short,
        logo: tm.logo,
        href: `/team/${league}/${h.team}`,
        a: h.gp ? h.pts / h.gp : null,
        b: a && a.gp ? a.pts / a.gp : null,
        detail: [
          { label: t("Home record"), value: `${h.w}-${h.d}-${h.l}` },
          { label: t("Away record"), value: a ? `${a.w}-${a.d}-${a.l}` : "–" },
        ],
      };
    })
    .sort((x, y) => (y.a ?? -1) - (x.a ?? -1) || (y.b ?? -1) - (x.b ?? -1));

  const homeWins = home.reduce((s, r) => s + r.w, 0);
  const awayWins = away.reduce((s, r) => s + r.w, 0);

  return (
    <>
      <GroupPicker groups={groups} value={gi} onChange={setGi} />
      <ChartCard
        id="form-table"
        title={t("Form table")}
        subtitle={t("The table over each club’s last {n} matches. Arrows show how far above or below their real position they sit.", { n })}
        actions={
          <Segmented
            options={[
              { value: "5", label: t("Last 5") },
              { value: "10", label: t("Last 10") },
            ]}
            value={n}
            onChange={setN}
          />
        }
        flush
        footnote={<PartialNote building={data.building} progress={data.progress} />}
      >
        <ComputedTable rows={form} teams={teams} league={league} moves={movesVsTable(form, real)} showForm formMax={Number(n)} />
      </ChartCard>

      <ChartCard
        id="home-away"
        title={t("Home vs away")}
        subtitle={
          homeWins + awayWins
            ? t("Points per game at home and on the road. Home sides have won {h} matches, away sides {a}.", { h: fmtNum(homeWins), a: fmtNum(awayWins) })
            : t("Points per game at home and on the road.")
        }
      >
        <Dumbbell rows={dumb} names={[t("Home"), t("Away")]} max={3} ticks={[0, 1, 2, 3]} />
      </ChartCard>

      <section className="section grid-2 an-twin">
        <div>
          <h2 className="section-title an-twin-title">{t("Home table")}</h2>
          <ComputedTable rows={home} teams={teams} league={league} compact moves={movesVsTable(home, real)} />
        </div>
        <div>
          <h2 className="section-title an-twin-title">{t("Away table")}</h2>
          <ComputedTable rows={away} teams={teams} league={league} compact moves={movesVsTable(away, real)} />
        </div>
      </section>
    </>
  );
}
