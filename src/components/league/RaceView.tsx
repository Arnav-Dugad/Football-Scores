import { useMemo, useState } from "react";
import { t } from "../../i18n";
import { pointsRace, table } from "../../lib/analytics";
import { useSettings } from "../../lib/settings";
import { BumpChart } from "../charts/BumpChart";
import { ChartCard, highlightSlots } from "../charts/core";
import { RaceChart } from "../charts/RaceChart";
import { IconTrophy } from "../Icons";
import { Empty, Skeleton } from "../ui";
import { GroupPicker, PartialNote } from "./chrome";
import { derive, isUefa, playedCount, teamOf, type LeagueData } from "./data";
import { groupPositions } from "./scope";

/** Rank order for a group: ESPN's official order, else the computed table. */
export function rankedIds(data: LeagueData, groupIndex: number): string[] {
  const g = data.groups[groupIndex];
  if (g?.rows.length) return g.rows.map((r) => String(r.team.id));
  if (!data.season) return g?.teams ?? [];
  return derive(data.season, `table|${groupIndex}`, () => table(data.season!, g ? { teams: g.teams } : {})).map((r) => r.team);
}

export function RaceView({ data }: { data: LeagueData }) {
  const { season, teams, league, groups } = data;
  const [gi, setGi] = useState(0);
  const [settings] = useSettings();
  const followed = useMemo(() => settings.teams.map((f) => f.id), [settings.teams]);
  const group = groups[gi] ?? groups[0];
  const ids = useMemo(() => (group ? group.teams : season?.teams.map((t) => t.id) ?? []), [group, season]);

  const ranked = useMemo(() => (data.groups.length ? rankedIds(data, gi) : ids), [data, gi, ids]);
  const slots = useMemo(() => highlightSlots(ranked, followed), [ranked, followed]);

  const race = useMemo(() => {
    if (!season) return [];
    const all = derive(season, "pointsRace", () => pointsRace(season));
    return ids
      .filter((id) => all.has(id))
      .map((id) => {
        const tm = teamOf(teams, id);
        return { id, name: tm.name, short: tm.short, logo: tm.logo, pts: all.get(id)!.map((p) => p.pts) };
      });
  }, [season, ids, teams]);

  const bump = useMemo(() => {
    if (!season) return null;
    const ph = derive(season, `pos|${gi}`, () => groupPositions(season, ids));
    return {
      roundDates: ph.dates,
      series: ids
        .filter((id) => (ph.ranks.get(id)?.length ?? 0) > 0)
        .map((id) => {
          const tm = teamOf(teams, id);
          return { id, name: tm.name, short: tm.short, logo: tm.logo, ranks: ph.ranks.get(id)! };
        }),
    };
  }, [season, ids, teams, gi]);

  if (data.seasonLoading) return <Skeleton h={520} r={32} />;
  if (!season || playedCount(season) === 0)
    return (
      <Empty icon={<IconTrophy />} title={t("The race hasn’t started")}>
        {data.building ? t("Season data is still syncing — check back in a minute.") : t("No matches have been played yet this season.")}
      </Empty>
    );

  const leader = race.length ? [...race].sort((a, b) => (b.pts[b.pts.length - 1] ?? 0) - (a.pts[a.pts.length - 1] ?? 0))[0] : null;

  return (
    <>
      <GroupPicker groups={groups} value={gi} onChange={setGi} />
      <ChartCard
        id="title-race"
        title={isUefa(league) ? t("Points race") : t("Title race")}
        subtitle={t("Cumulative points by games played. The top four and the clubs you follow are highlighted — tap a crest to follow one line.")}
        footnote={
          <>
            {leader && t("{club} lead with {pts} points.", { club: leader.short, pts: leader.pts[leader.pts.length - 1] ?? 0 })}{" "}
            <PartialNote building={data.building} progress={data.progress} />
          </>
        }
      >
        <RaceChart series={race} slots={slots} league={league} />
      </ChartCard>

      {bump && bump.roundDates.length >= 2 ? (
        <ChartCard
          id="positions"
          title={t("League position over time")}
          subtitle={t("Position after every matchday. Hover or focus a club to follow its path; first place is at the top.")}
        >
          <BumpChart series={bump.series} slots={slots} league={league} roundDates={bump.roundDates} />
        </ChartCard>
      ) : (
        <ChartCard id="positions" title={t("League position over time")}>
          <p className="an-empty-chart">{t("Positions appear after the second matchday.")}</p>
        </ChartCard>
      )}
    </>
  );
}
