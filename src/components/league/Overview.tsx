import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { MINUTE_BINS, goalsByMinute, table, teamXg } from "../../lib/analytics";
import { endpoints, normaliseLeaders, type Leader } from "../../lib/api";
import { fmtNum, fmtPct } from "../../lib/format";
import { useApi, usePlayer } from "../../lib/hooks";
import { LEAGUE_BY_SLUG } from "../../lib/leagues";
import { useCountUp } from "../../lib/motion";
import { DivergingBars } from "../charts/Bars";
import { ChartCard } from "../charts/core";
import { MinuteChart } from "../charts/MinuteChart";
import { CrestScatter } from "../charts/Scatter";
import { IconStats } from "../Icons";
import { Crest, Empty, PlayerAvatar, Segmented, Skeleton, tsdbSize } from "../ui";
import { PartialNote } from "./chrome";
import { derive, teamOf, type LeagueData } from "./data";
import { xgReliable } from "./scope";

interface ClubLine {
  id: string;
  gp: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export function Overview({ data }: { data: LeagueData }) {
  const { league, season, teams, groups } = data;
  const meta = LEAGUE_BY_SLUG[league];
  const ld = useApi<unknown>(endpoints.leaders(league));
  const leaders = useMemo(() => (ld.data ? normaliseLeaders(ld.data) : { goals: [] as Leader[], assists: [] as Leader[] }), [ld.data]);

  // Authoritative per-club lines: ESPN standings, else the computed table.
  const clubs = useMemo<ClubLine[]>(() => {
    const rows = groups.flatMap((g) => g.rows);
    if (rows.length) return rows.filter((r) => r.gp > 0).map((r) => ({ id: String(r.team.id), gp: r.gp, gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts }));
    if (!season) return [];
    return derive(season, "table", () => table(season))
      .filter((r) => r.gp > 0)
      .map((r) => ({ id: r.team, gp: r.gp, gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts }));
  }, [groups, season]);


  if (data.standingsLoading && data.seasonLoading && ld.loading) {
    return (
      <div className="an-stack">
        <div className="tiles">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={118} />
          ))}
        </div>
        <Skeleton h={260} r={32} />
        <Skeleton h={420} />
      </div>
    );
  }

  if (!clubs.length && !leaders.goals.length) {
    return (
      <Empty icon={<IconStats />} title={t("No stats yet")}>
        {t("{league} hasn’t played enough matches this season for analytics.", { league: meta.name })}
      </Empty>
    );
  }

  return (
    <>
      <Kpis clubs={clubs} teams={teams} league={league} />

      {leaders.goals[0] && (
        <section className="section">
          <LeaderHero l={leaders.goals[0]} league={league} tint={meta.tint} />
        </section>
      )}

      {(leaders.goals.length > 0 || leaders.assists.length > 0) && (
        <section className="section grid-2 an-leaders">
          <LeaderList title={t("Top scorers")} list={leaders.goals} unit={t("Goals")} league={league} />
          <LeaderList title={t("Top assists")} list={leaders.assists} unit={t("Assists")} league={league} />
        </section>
      )}

      {clubs.length >= 4 && <AttackDefence data={data} clubs={clubs} />}

      {clubs.length >= 4 && (
        <ChartCard
          id="goal-difference"
          title={t("Goal difference")}
          subtitle={t("Every club, ranked by goals scored minus goals conceded.")}
        >
          <DivergingBars
            rows={[...clubs]
              .sort((a, b) => b.gd - a.gd || b.gf - a.gf)
              .map((c) => {
                const tm = teamOf(teams, c.id);
                return {
                  key: c.id,
                  label: tm.short,
                  logo: tm.logo,
                  href: `/team/${league}/${c.id}`,
                  value: c.gd,
                  detail: [
                    { label: t("Scored"), value: fmtNum(c.gf) },
                    { label: t("Conceded"), value: fmtNum(c.ga) },
                    { label: t("Played"), value: fmtNum(c.gp) },
                  ],
                };
              })}
            posLabel={t("Positive")}
            negLabel={t("Negative")}
            valueLabel={t("Goal difference")}
          />
        </ChartCard>
      )}

      {season && <GoalsByMinute data={data} />}
    </>
  );
}

/* ------------------------------------------------------------- KPIs ---- */

function Kpis({ clubs, teams, league }: { clubs: ClubLine[]; teams: LeagueData["teams"]; league: string }) {
  const goals = clubs.reduce((a, c) => a + c.gf, 0);
  // Every game appears twice in the table (once per club).
  const games = Math.round(clubs.reduce((a, c) => a + c.gp, 0) / 2);
  const attack = [...clubs].sort((a, b) => b.gf / b.gp - a.gf / a.gp)[0];
  const defence = [...clubs].sort((a, b) => a.ga / a.gp - b.ga / b.gp)[0];
  const g = useCountUp(goals);
  const gpg = useCountUp(games ? goals / games : 0, { decimals: 2 });
  const att = useCountUp(attack ? attack.gf / attack.gp : 0, { decimals: 2 });
  const def = useCountUp(defence ? defence.ga / defence.gp : 0, { decimals: 2 });
  if (!clubs.length) return null;
  const at = teamOf(teams, attack.id);
  const df = teamOf(teams, defence.id);
  return (
    <div className="tiles an-kpis">
      <div className="tile glass">
        <div className="k">{t("Goals scored")}</div>
        <div className="v">{fmtNum(g)}</div>
        <div className="s">{t("in {n} matches", { n: fmtNum(games) })}</div>
      </div>
      <div className="tile glass" style={{ animationDelay: "40ms" }}>
        <div className="k">{t("Goals per match")}</div>
        <div className="v">{games ? fmtNum(gpg, 2) : "–"}</div>
        <div className="s">{t("league average")}</div>
      </div>
      <Link to={`/team/${league}/${attack.id}`} className="tile glass an-tile-link" style={{ animationDelay: "80ms" }}>
        <div className="k">{t("Best attack")}</div>
        <div className="v">{fmtNum(att, 2)}</div>
        <div className="s">
          <Crest src={at.logo} size={18} alt="" />
          {t("{club} · goals / game", { club: at.short })}
        </div>
      </Link>
      <Link to={`/team/${league}/${defence.id}`} className="tile glass an-tile-link" style={{ animationDelay: "120ms" }}>
        <div className="k">{t("Meanest defence")}</div>
        <div className="v">{fmtNum(def, 2)}</div>
        <div className="s">
          <Crest src={df.logo} size={18} alt="" />
          {t("{club} · conceded / game", { club: df.short })}
        </div>
      </Link>
    </div>
  );
}

/* ---------------------------------------------------------- leaders ---- */

function LeaderHero({ l, league, tint }: { l: Leader; league: string; tint: string }) {
  const { info } = usePlayer(l.name, l.team.name);
  const cut = tsdbSize(info?.cutout, "medium");
  const photo = !cut ? tsdbSize(info?.photo, "medium") : null;
  const v = useCountUp(l.value);
  return (
    <Link to={`/player/${league}/${l.id}`} className="leader-hero glass an-hero">
      <div
        className="glow"
        style={{ background: `radial-gradient(50% 60% at 85% 60%, ${tint}, transparent 70%), radial-gradient(40% 50% at 10% 10%, var(--series-1), transparent 70%)` }}
      />
      <div className="info">
        <div>
          <div className="rank">{t("Golden Boot leader")}</div>
          <div className="pname">{l.name}</div>
          <div className="team">
            <Crest src={l.team.logo} size={22} alt="" />
            {l.team.name}
          </div>
        </div>
        <div className="value">
          {fmtNum(v)}
          <small>{l.matches ? t("goals in {n} games", { n: l.matches }) : t("goals")}</small>
        </div>
      </div>
      <div className="cut">
        {cut ? (
          <img src={cut} alt="" />
        ) : photo ? (
          <img src={photo} alt="" style={{ objectFit: "cover", borderRadius: "24px 0 0 0", height: "100%" }} />
        ) : null}
      </div>
    </Link>
  );
}

function LeaderList({ title, list, unit, league }: { title: string; list: Leader[]; unit: string; league: string }) {
  if (!list.length) return <div />;
  const top = list.slice(0, 10);
  const max = Math.max(...top.map((l) => l.value), 1);
  return (
    <div>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="subtle an-unit">{unit}</span>
      </div>
      <ol className="list glass an-leaderlist">
        {top.map((l, i) => (
          <li key={l.id}>
            <Link to={`/player/${league}/${l.id}`} className="bar-row">
              <span className="rk">{i + 1}</span>
              <PlayerAvatar name={l.name} team={l.team.name} size={44} color="var(--series-1)" />
              <div style={{ minWidth: 0 }}>
                <div className="top">
                  <b>{l.name}</b>
                  <span className="val">{fmtNum(l.value)}</span>
                </div>
                <div className="sub">
                  <Crest src={l.team.logo} size={14} alt="" />
                  {l.team.name}
                  {l.matches ? ` · ${t("{n} apps", { n: l.matches })}` : ""}
                </div>
                <div className="track">
                  <div style={{ width: `${(l.value / max) * 100}%` }} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------- attack vs defence --- */

function AttackDefence({ data, clubs }: { data: LeagueData; clubs: ClubLine[] }) {
  const { season, teams, league } = data;
  const xg = useMemo(() => (season ? derive(season, "teamXg", () => teamXg(season)) : new Map()), [season]);
  const xgClubs = clubs.filter((c) => (xg.get(c.id)?.games ?? 0) > 0);
  const reliable = !!season && xgReliable(season);
  const hasXg = reliable && xgClubs.length >= Math.max(4, clubs.length * 0.6);
  const [mode, setMode] = useState<"goals" | "xg">("goals");
  const m = hasXg ? mode : "goals";

  const points =
    m === "goals"
      ? clubs.map((c) => {
          const tm = teamOf(teams, c.id);
          return {
            id: c.id,
            name: tm.name,
            logo: tm.logo,
            x: c.gf / c.gp,
            y: c.ga / c.gp,
            extra: [
              { label: t("Points"), value: fmtNum(c.pts) },
              { label: t("Played"), value: fmtNum(c.gp) },
            ],
          };
        })
      : xgClubs.map((c) => {
          const tm = teamOf(teams, c.id);
          const x = xg.get(c.id)!;
          return {
            id: c.id,
            name: tm.name,
            logo: tm.logo,
            x: x.xgf / x.games,
            y: x.xga / x.games,
            extra: [
              { label: t("Goals / game"), value: fmtNum(x.gf / x.games, 2) },
              { label: t("Conceded / game"), value: fmtNum(x.ga / x.games, 2) },
              { label: t("Games with xG"), value: fmtNum(x.games) },
            ],
          };
        });

  return (
    <ChartCard
      id="attack-defence"
      title={t("Attack vs defence")}
      subtitle={
        m === "goals"
          ? t("Goals scored and conceded per game. Top-right is where the best teams live.")
          : t("Expected goals created and allowed per game — the chances behind the scoreline.")
      }
      actions={
        <Segmented
          options={[
            { value: "goals", label: t("Goals") },
            ...(hasXg ? [{ value: "xg" as const, label: t("xG") }] : []),
          ]}
          value={m}
          onChange={(v) => setMode(v)}
        />
      }
      footnote={
        !hasXg
          ? season && xgClubs.length && !reliable
            ? t("xG is hidden for this competition: the provider’s shot data is incomplete, so expected goals would be misleading.")
            : t("xG appears once match details have synced for most games.")
          : m === "xg"
            ? t("Pitch xG model from shot locations and types; only matches with shot data are included.")
            : undefined
      }
    >
      <CrestScatter
        points={points}
        xLabel={m === "goals" ? t("Scored per game") : t("xG for per game")}
        yLabel={m === "goals" ? t("Fewer conceded per game") : t("Less xG against per game")}
        tableLabels={m === "goals" ? [t("Scored / game"), t("Conceded / game")] : [t("xG for / game"), t("xG against / game")]}
        invertY
        league={league}
        quadrants={[t("Strong both ends"), t("Hard to beat"), t("Open games"), t("Struggling")]}
      />
    </ChartCard>
  );
}

/* --------------------------------------------------- goals by minute --- */

function GoalsByMinute({ data }: { data: LeagueData }) {
  const { season, teams, league } = data;
  const [team, setTeam] = useState("");
  const opts = useMemo(
    () => (season ? [...season.teams].map((tm) => teamOf(teams, tm.id)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [season, teams],
  );
  const res = useMemo(() => (season ? derive(season, `gbm|${team}`, () => goalsByMinute(season, team || undefined)) : null), [season, team]);
  if (!season || !res) return null;
  const total = res.scored.reduce((a, b) => a + b, 0);
  const late = res.scored[5];
  const selected = team ? teamOf(teams, team) : null;
  return (
    <ChartCard
      id="goals-by-minute"
      title={t("Goals by minute")}
      subtitle={
        selected
          ? t("When {club} score and concede, in 15-minute blocks (stoppage time counts in the block it extends).", { club: selected.short })
          : total
            ? t("{p} of all goals arrive after the 75th minute.", { p: fmtPct(late / total) })
            : t("When goals arrive, in 15-minute blocks.")
      }
      actions={
        <label className="an-select">
          <span className="sr-only">{t("Club")}</span>
          {selected && <Crest src={selected.logo} size={18} alt="" />}
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">{t("Whole league")}</option>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      }
      footnote={<PartialNote building={data.building} progress={data.progress} />}
    >
      {total + res.conceded.reduce((a, b) => a + b, 0) === 0 ? (
        <p className="an-empty-chart">{t("Goal times appear once match details have synced.")}</p>
      ) : (
        <MinuteChart bins={MINUTE_BINS} scored={res.scored} conceded={team ? res.conceded : undefined} />
      )}
      {selected && (
        <p className="an-hint">
          <Link to={`/team/${league}/${selected.id}`} className="link">
            {t("Open {club}", { club: selected.name })}
          </Link>
        </p>
      )}
    </ChartCard>
  );
}

