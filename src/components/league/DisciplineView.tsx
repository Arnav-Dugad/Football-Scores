import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { discipline, refereeStats } from "../../lib/analytics";
import { fmtNum, fmtPct } from "../../lib/format";
import { CardBars } from "../charts/Bars";
import { ChartCard, DataTable, SignedDelta } from "../charts/core";
import { IconWhistle } from "../Icons";
import { Crest, Empty, Segmented, Skeleton } from "../ui";
import { PartialNote } from "./chrome";
import { derive, teamOf, type LeagueData } from "./data";

export function DisciplineView({ data }: { data: LeagueData }) {
  const { season, teams, league } = data;
  const disc = useMemo(() => (season ? derive(season, "discipline", () => discipline(season)) : null), [season]);
  const refs = useMemo(() => (season ? derive(season, "refs", () => refereeStats(season)) : null), [season]);
  const [sort, setSort] = useState<"total" | "pg">("total");

  if (data.seasonLoading) return <Skeleton h={560} r={32} />;
  if (!season || !disc || !refs)
    return (
      <Empty icon={<IconWhistle />} title={t("Discipline unavailable")}>
        {t("Season data for this competition hasn’t loaded yet.")}
      </Empty>
    );

  const clubRows = [...disc.teams.entries()]
    .filter(([id]) => teams.has(id))
    .map(([id, c]) => {
      const tm = teamOf(teams, id);
      return { key: id, label: tm.short, logo: tm.logo, href: `/team/${league}/${id}`, y: c.y, r: c.r, gp: c.gp };
    })
    .sort((a, b) =>
      sort === "pg"
        ? (b.gp ? (b.y + 3 * b.r) / b.gp : 0) - (a.gp ? (a.y + 3 * a.r) / a.gp : 0)
        : b.y + 3 * b.r - (a.y + 3 * a.r) || b.r - a.r,
    );
  const anyCards = clubRows.some((r) => r.y + r.r > 0);
  const booked = disc.players.slice(0, 12);

  const L = refs.league;
  const lgY = L.games ? L.yellows / L.games : 0;
  const lgR = L.games ? L.reds / L.games : 0;
  const lgH = L.games ? L.homeWins / L.games : 0;
  const refRows = [...refs.refs.values()].filter((r) => r.games >= 1).sort((a, b) => b.games - a.games || b.yellows / b.games - a.yellows / a.games);

  return (
    <>
      <ChartCard
        id="cards"
        title={t("Cards per club")}
        subtitle={t("Yellow and red cards in this competition. A red counts three times when ranking.")}
        actions={
          <Segmented
            options={[
              { value: "total", label: t("Total") },
              { value: "pg", label: t("Per game") },
            ]}
            value={sort}
            onChange={setSort}
          />
        }
        footnote={
          <>
            {t("Second yellows are counted as reds.")} <PartialNote building={data.building} progress={data.progress} />
          </>
        }
      >
        {anyCards ? <CardBars rows={clubRows} /> : <p className="an-empty-chart">{t("Card data appears once match details have synced.")}</p>}
      </ChartCard>

      {booked.length > 0 && (
        <ChartCard
          id="booked"
          title={t("Most booked players")}
          subtitle={t("Ranked by cards, with a red worth three yellows.")}
          flush
          table={
            <DataTable
              columns={[{ label: t("Player") }, { label: t("Club"), num: false }, { label: t("Yellow") }, { label: t("Red") }]}
              rows={booked.map((p) => [p.name, teamOf(teams, p.team).name, fmtNum(p.y), fmtNum(p.r)])}
            />
          }
        >
          <ol className="an-booked">
            {booked.map((p, i) => {
              const tm = teamOf(teams, p.team);
              const body = (
                <>
                  <span className="an-rk num">{i + 1}</span>
                  <Crest src={tm.logo} size={22} alt="" />
                  <span className="an-booked-who">
                    <b>{p.name}</b>
                    <small>{tm.short}</small>
                  </span>
                  <span className="an-booked-cards" aria-label={t("{y} yellow, {r} red", { y: p.y, r: p.r })}>
                    <span className="an-cardcount">
                      <i className="an-cardglyph y" aria-hidden />
                      <span className="num">{p.y}</span>
                    </span>
                    <span className={`an-cardcount${p.r ? "" : " zero"}`}>
                      <i className="an-cardglyph r" aria-hidden />
                      <span className="num">{p.r}</span>
                    </span>
                  </span>
                </>
              );
              return (
                <li key={`${p.pid ?? p.name}${p.team}`}>
                  {p.pid ? (
                    <Link to={`/player/${league}/${p.pid}`} className="an-booked-row">
                      {body}
                    </Link>
                  ) : (
                    <div className="an-booked-row">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </ChartCard>
      )}

      <ChartCard
        id="referees"
        title={t("Referees")}
        subtitle={
          L.games
            ? t("League average: {y} yellows and {r} reds per game; home sides win {h}.", { y: fmtNum(lgY, 2), r: fmtNum(lgR, 2), h: fmtPct(lgH) })
            : t("Referee assignments appear once match details have synced.")
        }
        flush
        footnote={refRows.length ? t("Differences are against the league average. Small samples swing a lot — treat referees with few games with care.") : undefined}
        table={
          refRows.length ? (
            <DataTable
              columns={[{ label: t("Referee") }, { label: t("Games") }, { label: t("Yellows / game") }, { label: t("Reds / game") }, { label: t("Home win %") }]}
              rows={refRows.map((r) => [r.name, fmtNum(r.games), fmtNum(r.yellows / r.games, 2), fmtNum(r.reds / r.games, 2), fmtPct(r.homeWins / r.games)])}
            />
          ) : undefined
        }
      >
        {refRows.length ? (
          <div className="table-scroll">
            <table className="standings an-table an-refs">
              <thead>
                <tr>
                  <th scope="col" className="club">
                    {t("Referee")}
                  </th>
                  <th scope="col" title={t("Games")}>
                    {t("G")}
                  </th>
                  <th scope="col">{t("Yellows / game")}</th>
                  <th scope="col">{t("Reds / game")}</th>
                  <th scope="col" className="hide-sm">
                    {t("Home win %")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {refRows.map((r, i) => {
                  const y = r.yellows / r.games;
                  const rd = r.reds / r.games;
                  const hw = r.homeWins / r.games;
                  return (
                    <tr key={r.name} style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}>
                      <td className="club">
                        <span className="inner an-refname">{r.name}</span>
                      </td>
                      <td>{r.games}</td>
                      <td>
                        <span className="an-vs">
                          <b className="num">{fmtNum(y, 2)}</b>
                          <SignedDelta v={y - lgY} digits={2} neutral />
                        </span>
                      </td>
                      <td>
                        <span className="an-vs">
                          <b className="num">{fmtNum(rd, 2)}</b>
                          <SignedDelta v={rd - lgR} digits={2} neutral />
                        </span>
                      </td>
                      <td className="hide-sm">
                        <span className="an-vs">
                          <b className="num">{fmtPct(hw)}</b>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="an-empty-chart">{t("No referee data yet.")}</p>
        )}
      </ChartCard>
    </>
  );
}
