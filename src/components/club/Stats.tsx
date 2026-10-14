import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { SeasonData, SeasonMatch } from "../../../shared/season";
import { t, tn } from "../../i18n";
import { biggestResults, discipline, goalsByMinute, played, table, teamMap } from "../../lib/analytics";
import { fmtDayShort, fmtNum } from "../../lib/format";
import { IconStats } from "../Icons";
import { Crest, Empty, Skeleton } from "../ui";
import { MinuteChart, RecordBar } from "./charts";
import { MiniEmpty, ResultBadge } from "./ui";

export function Stats({ league, teamId, season, loading }: { league: string; teamId: string; season: SeasonData | undefined; loading: boolean }) {
  const inLeague = !!season?.teams.some((x) => x.id === teamId);
  const data = useMemo(() => {
    if (!season || !inLeague) return null;
    const games = played(season).filter((m) => m.h === teamId || m.a === teamId);
    const detailed = games.filter((m) => m.det);
    const big = biggestResults(season, teamId, 5);
    const minutes = goalsByMinute(season, teamId);
    const home = table(season, { venue: "home" }).find((r) => r.team === teamId) ?? null;
    const away = table(season, { venue: "away" }).find((r) => r.team === teamId) ?? null;
    const disc = discipline(season);
    const cards = { y: 0, r: 0 };
    const detIds = new Set(detailed.map((m) => m.id));
    for (const e of season.events) {
      if (!detIds.has(e.m) || e.t !== teamId) continue;
      if (e.k === "y") cards.y++;
      else if (e.k === "r" || e.k === "yr") cards.r++;
    }
    const booked = disc.players.filter((p) => p.team === teamId).slice(0, 5);
    return { games, detailed, big, minutes, home, away, cards, booked, teams: teamMap(season) };
  }, [season, inLeague, teamId]);

  // No season yet, or the background build hasn't produced teams: hold the layout.
  if ((loading && !season) || (season && !season.teams.length)) {
    return (
      <div className="cl-stack" aria-busy="true">
        <div className="grid-2">
          <Skeleton h={300} r={24} />
          <Skeleton h={300} r={24} />
        </div>
        <Skeleton h={320} r={24} />
      </div>
    );
  }
  if (!data || !data.games.length) {
    return (
      <Empty icon={<IconStats />} title={t("No stats yet")}>
        {season && !inLeague ? t("Season statistics are only available for league clubs.") : t("Statistics appear after this club’s first league match.")}
      </Empty>
    );
  }

  const { big, minutes, home, away, cards, booked, detailed, teams } = data;
  const totalGoals = minutes.scored.reduce((a, b) => a + b, 0) + minutes.conceded.reduce((a, b) => a + b, 0);

  const resultRow = (m: SeasonMatch) => {
    const isHome = m.h === teamId;
    const opp = teams.get(isHome ? m.a : m.h);
    const us = isHome ? m.hs! : m.as!;
    const them = isHome ? m.as! : m.hs!;
    const r = us > them ? "W" : us < them ? "L" : "D";
    return (
      <li key={m.id}>
        <Link to={`/match/${league}/${m.id}`} className="row clickable">
          <Crest src={opp?.l} size={30} alt="" />
          <span className="grow">
            <span className="title">
              <span className={`cl-ha ${isHome ? "h" : "a"}`} aria-label={isHome ? t("Home") : t("Away")}>
                {isHome ? t("H") : t("A")}
              </span>
              {opp?.n ?? t("Opponent")}
            </span>
            <span className="caption">{fmtDayShort(m.d)}</span>
          </span>
          <span className="num cl-score">
            {fmtNum(us)}–{fmtNum(them)}
          </span>
          <ResultBadge r={r} />
        </Link>
      </li>
    );
  };

  return (
    <div className="cl-stack">
      <div className="grid-2">
        <section className="panel glass" aria-labelledby="cl-bigw">
          <p className="panel-title" id="cl-bigw">
            {t("Biggest wins")}
          </p>
          {big.wins.length ? <ul className="cl-rows cl-flat">{big.wins.map(resultRow)}</ul> : <MiniEmpty>{t("No wins yet this season.")}</MiniEmpty>}
        </section>
        <section className="panel glass" aria-labelledby="cl-bigl">
          <p className="panel-title" id="cl-bigl">
            {t("Heaviest defeats")}
          </p>
          {big.losses.length ? <ul className="cl-rows cl-flat">{big.losses.map(resultRow)}</ul> : <MiniEmpty>{t("Unbeaten so far this season.")}</MiniEmpty>}
        </section>
      </div>

      <section className="panel glass" aria-labelledby="cl-minutes">
        <p className="panel-title" id="cl-minutes">
          {t("Goals by minute")}
        </p>
        {totalGoals > 0 ? (
          <>
            <MinuteChart scored={minutes.scored} conceded={minutes.conceded} />
            <p className="subtle cl-foot">{tn(detailed.length, "From {n} match with goal times", "From {n} matches with goal times")}</p>
          </>
        ) : (
          <MiniEmpty>{t("Goal times appear once match details have synced.")}</MiniEmpty>
        )}
      </section>

      <div className="grid-2">
        <section className="panel glass" aria-labelledby="cl-ha">
          <p className="panel-title" id="cl-ha">
            {t("Home and away")}
          </p>
          <div className="cl-venues">
            {[
              { k: t("Home"), r: home },
              { k: t("Away"), r: away },
            ].map(({ k, r }) => (
              <div className="cl-venue-rec" key={k}>
                <div className="cl-venue-head">
                  <b>{k}</b>
                  {r && r.gp > 0 ? (
                    <span className="muted num">
                      {tn(r.pts, "{n} pt", "{n} pts")} · {t("{ppg} per game", { ppg: fmtNum(r.pts / r.gp, 2) })}
                    </span>
                  ) : (
                    <span className="subtle">{t("Not played yet")}</span>
                  )}
                </div>
                <RecordBar w={r?.w ?? 0} d={r?.d ?? 0} l={r?.l ?? 0} label={k} />
              </div>
            ))}
          </div>
          <table className="mini-table cl-ha-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">{t("Venue")}</span>
                </th>
                <th title={t("Played")}>{t("P")}</th>
                <th title={t("Won")}>{t("W")}</th>
                <th title={t("Drawn")}>{t("D")}</th>
                <th title={t("Lost")}>{t("L")}</th>
                <th title={t("Goals for")}>{t("GF")}</th>
                <th title={t("Goals against")}>{t("GA")}</th>
                <th title={t("Points")}>{t("Pts")}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { k: t("Home"), r: home },
                { k: t("Away"), r: away },
              ].map(({ k, r }) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{fmtNum(r?.gp ?? 0)}</td>
                  <td>{fmtNum(r?.w ?? 0)}</td>
                  <td>{fmtNum(r?.d ?? 0)}</td>
                  <td>{fmtNum(r?.l ?? 0)}</td>
                  <td>{fmtNum(r?.gf ?? 0)}</td>
                  <td>{fmtNum(r?.ga ?? 0)}</td>
                  <td>
                    <b>{fmtNum(r?.pts ?? 0)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel glass" aria-labelledby="cl-disc">
          <p className="panel-title" id="cl-disc">
            {t("Discipline")}
          </p>
          {detailed.length ? (
            <>
              <div className="cl-disc-figs">
                <div>
                  <span className="cl-bk y" aria-hidden="true" />
                  <b>{fmtNum(cards.y)}</b>
                  <span className="muted">{t("Yellow cards")}</span>
                  <small className="subtle">{t("{n} per game", { n: fmtNum(cards.y / detailed.length, 1) })}</small>
                </div>
                <div>
                  <span className="cl-bk r" aria-hidden="true" />
                  <b>{fmtNum(cards.r)}</b>
                  <span className="muted">{t("Red cards")}</span>
                  <small className="subtle">{tn(detailed.length, "in {n} match", "in {n} matches")}</small>
                </div>
              </div>
              {booked.length > 0 && (
                <ul className="cl-booked">
                  {booked.map((p) => {
                    const body = (
                      <>
                        <span className="grow">{p.name}</span>
                        <span className="cl-cards-mini" aria-label={t("{y} yellow, {r} red", { y: p.y, r: p.r })}>
                          {p.y > 0 && (
                            <span aria-hidden="true">
                              <span className="cl-bk y sm" />
                              {fmtNum(p.y)}
                            </span>
                          )}
                          {p.r > 0 && (
                            <span aria-hidden="true">
                              <span className="cl-bk r sm" />
                              {fmtNum(p.r)}
                            </span>
                          )}
                        </span>
                      </>
                    );
                    return <li key={p.pid ?? p.name}>{p.pid ? <Link to={`/player/${league}/${p.pid}`}>{body}</Link> : <span>{body}</span>}</li>;
                  })}
                </ul>
              )}
            </>
          ) : (
            <MiniEmpty>{t("Cards appear once match details have synced.")}</MiniEmpty>
          )}
        </section>
      </div>
    </div>
  );
}
