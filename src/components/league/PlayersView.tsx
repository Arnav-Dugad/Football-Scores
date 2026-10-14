import { useMemo } from "react";
import { Link } from "react-router-dom";
import { t, tn } from "../../i18n";
import { fmtNum, teamTint } from "../../lib/format";
import { usePeople } from "../../lib/season";
import { DivergingBars } from "../charts/Bars";
import { ChartCard, DataTable } from "../charts/core";
import { PlayerScatter, type PlayerPoint } from "../charts/Scatter";
import { IconPeople } from "../Icons";
import { Crest, Empty, PlayerAvatar, Skeleton } from "../ui";
import { PartialNote } from "./chrome";
import { teamOf, type LeagueData } from "./data";
import { xgReliable } from "./scope";
import type { PersonRow } from "../../../shared/season";

export function PlayersView({ data }: { data: LeagueData }) {
  const { league, teams, season } = data;
  const q = usePeople(league);
  const inScope = useMemo(() => new Set(season?.teams.map((tm) => tm.id) ?? [...teams.keys()]), [season, teams]);
  const players = useMemo(() => (q.data?.players ?? []).filter((p) => inScope.has(p.t)), [q.data, inScope]);

  const point = (p: PersonRow): PlayerPoint => {
    const tm = teamOf(teams, p.t);
    return { id: p.id, name: p.n, team: p.t, teamName: tm.name, logo: tm.logo, color: teamTint(tm.color), g: p.g, a: p.a, apps: p.apps, xg: p.sh && reliable ? p.xg : null };
  };

  const top = useMemo(
    () =>
      [...players]
        .filter((p) => p.g + p.a > 0)
        .sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g || a.apps - b.apps)
        .slice(0, 40),
    [players],
  );

  const reliable = !!season && xgReliable(season);
  const hasXg = reliable && players.some((p) => p.xg > 0);
  const xgRows = useMemo(() => {
    if (!reliable) return [];
    const pool = players.filter((p) => p.sh >= 5 || p.xg >= 1);
    const byDiff = [...pool].sort((a, b) => b.g - b.xg - (a.g - a.xg));
    const over = byDiff.slice(0, 8).filter((p) => p.g - p.xg > 0.05);
    const under = byDiff.slice(-8).filter((p) => p.g - p.xg < -0.05 && !over.includes(p));
    return [...over, ...under];
  }, [players, reliable]);

  const young = useMemo(
    () =>
      players
        .filter((p) => p.age !== null && p.age < 21 && p.apps > 0)
        .sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g || b.starts - a.starts || b.apps - a.apps)
        .slice(0, 10),
    [players],
  );

  if (q.loading) return <Skeleton h={560} r={32} />;
  if (!players.length)
    return (
      <Empty icon={<IconPeople />} title={t("Player data is on its way")}>
        {t("Squads and match details are still syncing for this competition.")}
      </Empty>
    );

  return (
    <>
      <ChartCard
        id="goals-assists"
        title={t("Goals vs assists")}
        subtitle={t("The top {n} goal contributors. Finishers sit right, creators sit high — the best do both.", { n: top.length })}
        footnote={
          <>
            {t("Counted from match events in this competition.")} <PartialNote building={data.building} progress={data.progress} />
          </>
        }
      >
        {top.length ? <PlayerScatter players={top.map(point)} league={league} /> : <p className="an-empty-chart">{t("No goals recorded yet.")}</p>}
      </ChartCard>

      <ChartCard
        id="xg-performance"
        title={t("Finishing vs xG")}
        subtitle={t("Goals scored minus expected goals. Above zero: finishing better than the chances suggest.")}
        footnote={hasXg ? t("Players with at least five shots or 1.0 xG. Pitch xG model from shot location and type.") : undefined}
      >
        {xgRows.length ? (
          <DivergingBars
            rows={xgRows.map((p) => {
              const tm = teamOf(teams, p.t);
              return {
                key: p.id,
                label: p.n,
                logo: tm.logo,
                href: `/player/${league}/${p.id}`,
                value: Math.round((p.g - p.xg) * 10) / 10,
                detail: [
                  { label: t("Goals"), value: fmtNum(p.g) },
                  { label: t("xG"), value: fmtNum(p.xg, 1) },
                  { label: t("Shots"), value: fmtNum(p.sh) },
                ],
              };
            })}
            digits={1}
            posLabel={t("Outperforming xG")}
            negLabel={t("Underperforming xG")}
            valueLabel={t("Goals − xG")}
            tableColumns={[t("Player")]}
          />
        ) : (
          <p className="an-empty-chart">
            {season && !reliable && players.some((pl) => pl.xg > 0)
              ? t("xG is hidden for this competition: the provider’s shot data is incomplete, so expected goals would be misleading.")
              : t("Shot data hasn’t synced for enough matches yet.")}
          </p>
        )}
      </ChartCard>

      <ChartCard
        id="young-players"
        title={t("Best Under-21s")}
        subtitle={t("Players aged 20 or younger, ranked by goals plus assists. Starts stand in for minutes played.")}
        table={
          young.length ? (
            <DataTable
              columns={[{ label: t("Player") }, { label: t("Club"), num: false }, { label: t("Age") }, { label: t("G+A") }, { label: t("Goals") }, { label: t("Assists") }, { label: t("Starts") }, { label: t("Apps") }]}
              rows={young.map((p) => [p.n, teamOf(teams, p.t).name, fmtNum(p.age ?? 0), fmtNum(p.g + p.a), fmtNum(p.g), fmtNum(p.a), fmtNum(p.starts), fmtNum(p.apps)])}
            />
          ) : undefined
        }
      >
        {young.length ? (
          <ol className="an-young">
            {young.map((p, i) => {
              const tm = teamOf(teams, p.t);
              const ga = p.g + p.a;
              return (
                <li key={p.id} style={{ animationDelay: `${i * 40}ms` }}>
                  <Link to={`/player/${league}/${p.id}`} className="an-young-row">
                    <span className="an-rk num">{i + 1}</span>
                    <PlayerAvatar name={p.n} team={tm.name} size={52} color={teamTint(tm.color)} />
                    <span className="an-young-who">
                      <b>{p.n}</b>
                      <span className="an-young-sub">
                        <Crest src={tm.logo} size={14} alt="" />
                        <span className="an-young-club">{tm.short}</span>
                        <span aria-hidden>·</span>
                        <span>{t("Age {n}", { n: p.age ?? "–" })}</span>
                        {p.flag && <img className="flag" src={p.flag} alt={p.nat} loading="lazy" />}
                      </span>
                      <span className="an-young-cap">
                        {t("{g} G · {a} A", { g: p.g, a: p.a })} · {tn(p.starts, "{n} start", "{n} starts")}
                        {p.starts > 0 && ga > 0 ? ` · ${t("{v} per start", { v: fmtNum(ga / p.starts, 2) })}` : ""}
                      </span>
                    </span>
                    <span className="an-young-stats">
                      <span className="an-young-ga">{fmtNum(ga)}</span>
                      <span className="an-young-galabel">{t("G+A")}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="an-empty-chart">{t("No Under-21 players have featured yet.")}</p>
        )}
      </ChartCard>
    </>
  );
}
