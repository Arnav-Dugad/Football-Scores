import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { zonesFromNotes, type Zone } from "../../lib/analytics";
import { fmtNum, fmtPct } from "../../lib/format";
import { ChartCard, DataTable } from "../charts/core";
import { ProjectionHeatmap } from "../charts/Grids";
import { IconTrophy } from "../Icons";
import { zoneColor } from "../table";
import { Crest, Empty, Skeleton } from "../ui";
import { GroupPicker, PartialNote, useLeagueProjection } from "./chrome";
import { isUefa, teamOf, type LeagueData } from "./data";

/** Probability mass for positions from..to (1-based, inclusive). */
const mass = (positions: number[], from: number, to: number) => positions.slice(from - 1, to).reduce((a, p) => a + p, 0);

const pct = (p: number) => (p <= 0 ? "–" : p < 0.001 ? "<0.1%" : p > 0.999 && p < 1 ? ">99.9%" : fmtPct(p, p < 0.01 || (p > 0.99 && p < 1) ? 1 : 0));

export function ProjectionView({ data }: { data: LeagueData }) {
  const { season, groups, teams, league } = data;
  const [gi, setGi] = useState(0);
  const groupIds = useMemo(() => groups.map((g) => g.teams), [groups]);
  const { result, running } = useLeagueProjection(season, groupIds);
  const group = groups[gi] ?? groups[0];

  const zones = useMemo<Zone[]>(() => (group?.rows.length ? zonesFromNotes(group.rows, zoneColor) : []), [group]);
  const uefa = isUefa(league);
  const multi = groups.length > 1;
  // Columns: first place (domestic), up to two cumulative top zones, then the drop zone.
  const half = Math.max(1, Math.ceil((group?.teams.length ?? 0) * 0.6));
  const alive = zones.filter((z) => !/relegat|eliminat|play-?out/i.test(z.label));
  const cumulative = uefa
    ? [alive[0], alive[alive.length - 1]].filter((z, i, a) => !!z && a.indexOf(z) === i)
    : alive
        .filter((z) => z.from <= half)
        // A first-place-only zone duplicates the Title column.
        .filter((z) => z.to > 1)
        .slice(0, 2);
  const releg = zones.filter((z) => /relegat|eliminat/i.test(z.label) && !/play-?off/i.test(z.label));
  const firstLabel = multi ? t("1st") : t("Title");
  const dropShort = uefa ? t("Out") : t("Rel");
  const dropLong = uefa ? t("Eliminated") : t("Relegation");

  const rows = useMemo(() => {
    if (!result) return [];
    const ids = new Set(group?.teams ?? []);
    const known = result.teams.filter((r) => teams.has(r.team));
    if (known.length < result.teams.length * 0.8) return []; // stale result from another league
    return known.filter((r) => !ids.size || ids.has(r.team) || (result.group && result.group[r.team] === gi));
  }, [result, group, teams, gi]);

  if (data.seasonLoading) return <Skeleton h={620} r={32} />;
  if (!season)
    return (
      <Empty icon={<IconTrophy />} title={t("Projection unavailable")}>
        {t("Season data for this competition hasn’t loaded yet.")}
      </Empty>
    );

  const n = rows.length;
  const remaining = result?.remaining ?? 0;
  const firstTop = cumulative[0];

  return (
    <>
      <GroupPicker groups={groups} value={gi} onChange={setGi} />
      <ChartCard
        id="projection"
        title={t("Season projection")}
        subtitle={
          result
            ? remaining
              ? t("{sims} simulations of the {n} remaining fixtures.", { sims: fmtNum(result.sims), n: fmtNum(remaining) })
              : t("Every fixture has been played — this is the final table.")
            : t("Simulating the rest of the season…")
        }
        flush
        footnote={
          <>
            {t(
              "Method: each remaining match is simulated 10,000 times. Expected goals for both sides come from the Pitch Elo ratings and the league’s scoring rate, and scorelines are drawn from Poisson distributions. Ties are split by goal difference, then goals scored.",
            )}{" "}
            {uefa ? t("UEFA league phase: only the eight league-phase matches count.") : null}
            <PartialNote building={data.building} progress={data.progress} />
          </>
        }
        table={
          rows.length ? (
            <DataTable
              columns={[
                { label: t("Club") },
                { label: t("Points") },
                { label: t("Projected") },
                { label: t("Avg finish") },
                ...(!uefa ? [{ label: firstLabel }] : []),
                ...cumulative.map((z) => ({ label: t("Top {n}", { n: z.to }) })),
                ...(releg.length ? [{ label: dropLong }] : []),
              ]}
              rows={rows.map((r) => [
                teamOf(teams, r.team).name,
                fmtNum(r.pts),
                fmtNum(r.expPts, 1),
                fmtNum(r.expRank, 1),
                ...(!uefa ? [pct(r.positions[0])] : []),
                ...cumulative.map((z) => pct(mass(r.positions, 1, z.to))),
                ...(releg.length ? [pct(releg.reduce((a, z) => a + mass(r.positions, z.from, z.to), 0))] : []),
              ])}
            />
          ) : undefined
        }
      >
        {running && !rows.length ? (
          <div className="an-simulating" role="status">
            <span className="an-spinner" aria-hidden />
            {t("Simulating 10,000 seasons…")}
          </div>
        ) : !rows.length ? (
          <p className="an-empty-chart">{t("Not enough data to project this season yet.")}</p>
        ) : (
          <div className={`table-scroll${running ? " refreshing" : ""}`}>
            <table className="standings an-table an-proj">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col" className="club">
                    {t("Club")}
                  </th>
                  <th scope="col" className="hide-sm" title={t("Points now")}>
                    {t("Pts")}
                  </th>
                  <th scope="col" title={t("Projected final points")}>
                    {t("Proj")}
                  </th>
                  <th scope="col" className="hide-sm" title={t("Average finishing position")}>
                    {t("Avg")}
                  </th>
                  {!uefa && <th scope="col">{firstLabel}</th>}
                  {cumulative.map((z) => (
                    <th key={z.label} scope="col" className={z === firstTop ? "" : "hide-sm"} title={z.label}>
                      <span className="an-zonehead">
                        <i style={{ background: z.color }} />
                        {t("Top {n}", { n: z.to })}
                      </span>
                    </th>
                  ))}
                  {releg.length > 0 && (
                    <th scope="col" title={releg.map((z) => z.label).join(" · ")}>
                      <span className="an-zonehead">
                        <i style={{ background: releg[0].color }} />
                        {dropShort}
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const tm = teamOf(teams, r.team);
                  const z = zones.find((zz) => i + 1 >= zz.from && i + 1 <= zz.to);
                  return (
                    <tr key={r.team} style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}>
                      <td className="pos">
                        {z && <span className="zone" style={{ background: z.color }} />}
                        {i + 1}
                      </td>
                      <td className="club">
                        <Link to={`/team/${league}/${r.team}`} className="inner">
                          <Crest src={tm.logo} size={24} alt="" />
                          <span>{tm.name}</span>
                        </Link>
                      </td>
                      <td className="hide-sm">{fmtNum(r.pts)}</td>
                      <td className="pts">{fmtNum(r.expPts, 0)}</td>
                      <td className="hide-sm">{fmtNum(r.expRank, 1)}</td>
                      {!uefa && <td className="an-prob">{pct(r.positions[0])}</td>}
                      {cumulative.map((zz) => (
                        <td key={zz.label} className={`an-prob${zz === firstTop ? "" : " hide-sm"}`}>
                          {pct(mass(r.positions, 1, zz.to))}
                        </td>
                      ))}
                      {releg.length > 0 && <td className="an-prob">{pct(releg.reduce((a, zz) => a + mass(r.positions, zz.from, zz.to), 0))}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {zones.length > 0 && rows.length > 0 && (
          <div className="zones an-zones">
            {zones.map((z) => (
              <span key={`${z.label}${z.from}`}>
                <i style={{ background: z.color }} />
                {z.label}
              </span>
            ))}
          </div>
        )}
      </ChartCard>

      {rows.length > 0 && (
        <ChartCard
          id="finishing-positions"
          title={t("Finishing positions")}
          subtitle={t("How often each club finished in each place across {sims} simulated seasons. Darker means more likely.", {
            sims: fmtNum(result?.sims ?? 10000),
          })}
        >
          <ProjectionHeatmap
            teams={rows.map((r) => {
              const tm = teamOf(teams, r.team);
              return { id: r.team, name: tm.name, short: tm.short, logo: tm.logo, positions: r.positions.slice(0, n), expRank: r.expRank };
            })}
            zones={zones}
            league={league}
          />
        </ChartCard>
      )}
    </>
  );
}
