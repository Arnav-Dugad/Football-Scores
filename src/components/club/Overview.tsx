import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { PeopleData, SeasonData } from "../../../shared/season";
import { t, tn } from "../../i18n";
import { teamXg } from "../../lib/analytics";
import { fmtNum } from "../../lib/format";
import { IconBall, IconCalendar, IconStats } from "../Icons";
import { Empty, PlayerAvatar, Skeleton } from "../ui";
import { PositionChart } from "./charts";
import { clubPositions, gameResult, lastGame, nextGame, type ClubCore, type ClubGame, type StandingRow } from "./data";
import { CountTile, GameCard, MiniEmpty, ResultBadge, SectionHead, SkelTiles } from "./ui";

export function Overview({
  league,
  core,
  hero,
  games,
  gamesLoading,
  season,
  standing,
  people,
}: {
  league: string;
  core: ClubCore;
  hero: string;
  games: ClubGame[];
  gamesLoading: boolean;
  season: SeasonData | undefined;
  standing: StandingRow | null;
  people: PeopleData | undefined;
}) {
  const id = core.id;
  const next = nextGame(games);
  const last = lastGame(games);
  const form = games
    .map((g) => gameResult(g, id))
    .filter((r): r is "W" | "D" | "L" => !!r)
    .slice(-5);

  const positions = useMemo(() => (season ? clubPositions(season, id, standing?.groupIds) : []), [season, id, standing?.groupIds]);
  const xg = useMemo(() => (season ? teamXg(season).get(id) ?? null : null), [season, id]);

  const roster = useMemo(() => (people?.players ?? []).filter((p) => p.t === id), [people, id]);
  const scorers = [...roster].filter((p) => p.g > 0).sort((a, b) => b.g - a.g || b.a - a.a || a.apps - b.apps).slice(0, 5);
  const creators = [...roster].filter((p) => p.a > 0).sort((a, b) => b.a - a.a || b.g - a.g || a.apps - b.apps).slice(0, 5);

  return (
    <div className="cl-stack">
      {/* Next & last */}
      {gamesLoading ? (
        <div className="grid-2" aria-hidden="true">
          <Skeleton h={208} r={28} />
          <Skeleton h={208} r={28} />
        </div>
      ) : next || last ? (
        <div className="grid-2">
          {next && <GameCard g={next} teamId={id} kind="next" />}
          {last && <GameCard g={last} teamId={id} kind="last" />}
        </div>
      ) : (
        <Empty icon={<IconCalendar />} title={t("No fixtures yet")}>
          {t("The schedule for this club hasn’t been published.")}
        </Empty>
      )}

      {/* Season at a glance */}
      <section aria-labelledby="cl-glance">
        <SectionHead
          id="cl-glance"
          title={t("Season at a glance")}
          aside={
            form.length > 0 ? (
              <span className="cl-form" aria-label={t("Last {n} results", { n: form.length })}>
                {form.map((r, i) => (
                  <ResultBadge key={i} r={r} size="sm" />
                ))}
              </span>
            ) : undefined
          }
        />
        {standing ? (
          <div className="tiles">
            <CountTile
              label={t("Position")}
              value={standing.rank}
              render={(n) => (
                <>
                  {fmtNum(n)}
                  <span className="cl-of"> / {fmtNum(standing.of)}</span>
                </>
              )}
              sub={standing.note ?? standing.group ?? ""}
            />
            <CountTile
              label={t("Points")}
              value={standing.pts}
              delay={40}
              sub={t("{ppg} per game · {n} played", { ppg: fmtNum(standing.gp ? standing.pts / standing.gp : 0, 2), n: fmtNum(standing.gp) })}
            />
            <CountTile
              label={t("Won · Drawn · Lost")}
              value={standing.w}
              delay={80}
              render={(n) => (
                <span className="num">
                  {fmtNum(n)}
                  <span className="cl-sep">·</span>
                  {fmtNum(standing.d)}
                  <span className="cl-sep">·</span>
                  {fmtNum(standing.l)}
                </span>
              )}
              sub={t("{pct} win rate", { pct: `${fmtNum(standing.gp ? (standing.w / standing.gp) * 100 : 0)}%` })}
            />
            <CountTile
              label={t("Goal difference")}
              value={standing.gd}
              delay={120}
              tone={standing.gd > 0 ? "good" : standing.gd < 0 ? "bad" : undefined}
              render={(n) => (n > 0 ? `+${fmtNum(n)}` : fmtNum(n))}
              sub={t("{f} scored · {a} conceded", { f: fmtNum(standing.gf), a: fmtNum(standing.ga) })}
            />
          </div>
        ) : gamesLoading ? (
          <SkelTiles />
        ) : (
          <MiniEmpty>{t("Table position appears once the season is under way.")}</MiniEmpty>
        )}
      </section>

      <div className="cl-split">
        <section className="panel glass" aria-labelledby="cl-pos">
          <p className="panel-title" id="cl-pos">
            {t("League position by matchday")}
          </p>
          {positions.length >= 2 ? (
            <PositionChart points={positions} title={t("League position by matchday")} />
          ) : season && season.teams.length ? (
            <MiniEmpty>{t("The position trail appears after two matchdays.")}</MiniEmpty>
          ) : (
            <Skeleton h={200} r={18} />
          )}
        </section>

        <section className="panel glass" aria-labelledby="cl-xg">
          <p className="panel-title" id="cl-xg">
            {t("Expected goals")}
          </p>
          {xg && xg.games > 0 ? (
            <div className="cl-xg">
              <XgRow label={t("xG for")} xg={xg.xgf} goals={xg.gf} games={xg.games} better="over" />
              <XgRow label={t("xG against")} xg={xg.xga} goals={xg.ga} games={xg.games} better="under" />
              <p className="subtle cl-foot">{tn(xg.games, "Pitch xG model · {n} match with shot data", "Pitch xG model · {n} matches with shot data")}</p>
            </div>
          ) : season && season.teams.length ? (
            <MiniEmpty>{t("Expected goals appear once match details have synced.")}</MiniEmpty>
          ) : (
            <Skeleton h={200} r={18} />
          )}
        </section>
      </div>

      <div className="grid-2">
        <LeaderPanel title={t("Top scorers")} icon={<IconBall />} list={scorers} value={(p) => p.g} unit={(n) => tn(n, "{n} goal", "{n} goals")} league={league} team={core.name} color={hero} ready={!!people} />
        <LeaderPanel title={t("Top assists")} icon={<IconStats />} list={creators} value={(p) => p.a} unit={(n) => tn(n, "{n} assist", "{n} assists")} league={league} team={core.name} color={hero} ready={!!people} />
      </div>
    </div>
  );
}

function XgRow({ label, xg, goals, games, better }: { label: string; xg: number; goals: number; games: number; better: "over" | "under" }) {
  const diff = goals - xg;
  const good = better === "over" ? diff >= 0 : diff <= 0;
  const max = Math.max(xg, goals, 0.1);
  return (
    <div className="cl-xg-row">
      <div className="cl-xg-head">
        <span className="muted">{label}</span>
        <span className={`cl-delta ${Math.abs(diff) < 0.05 ? "" : good ? "good" : "bad"}`}>
          {diff > 0 ? "+" : diff < 0 ? "−" : "±"}
          {fmtNum(Math.abs(diff), 1)}
        </span>
      </div>
      <div className="cl-xg-fig">
        <b>{fmtNum(xg, 1)}</b>
        <span className="muted">{t("{n} per game", { n: fmtNum(xg / games, 2) })}</span>
      </div>
      <div className="cl-xg-bars" aria-hidden="true">
        <span className="lbl">{t("xG")}</span>
        <span className="track">
          <i className="xg" style={{ width: `${(xg / max) * 100}%` }} />
        </span>
        <span className="v num">{fmtNum(xg, 1)}</span>
        <span className="lbl">{better === "over" ? t("Scored") : t("Conceded")}</span>
        <span className="track">
          <i className="real" style={{ width: `${(goals / max) * 100}%` }} />
        </span>
        <span className="v num">{fmtNum(goals)}</span>
      </div>
      <p className="sr-only">
        {better === "over"
          ? t("{g} scored from {x} expected", { g: fmtNum(goals), x: fmtNum(xg, 1) })
          : t("{g} conceded from {x} expected", { g: fmtNum(goals), x: fmtNum(xg, 1) })}
      </p>
    </div>
  );
}

function LeaderPanel({
  title,
  icon,
  list,
  value,
  unit,
  league,
  team,
  color,
  ready,
}: {
  title: string;
  icon: React.ReactNode;
  list: { id: string; n: string; apps: number; posName: string }[];
  value: (p: any) => number;
  unit: (n: number) => string;
  league: string;
  team: string;
  color: string;
  ready: boolean;
}) {
  return (
    <section className="panel glass cl-leaders" aria-label={title}>
      <p className="panel-title cl-title-ic">
        {icon}
        {title}
      </p>
      {!ready ? (
        <Skeleton h={220} r={18} />
      ) : list.length ? (
        <ol className="cl-leader-list">
          {list.map((p, i) => (
            <li key={p.id}>
              <Link to={`/player/${league}/${p.id}`} className="cl-leader">
                <span className="rk num">{fmtNum(i + 1)}</span>
                <PlayerAvatar name={p.n} team={team} size={42} color={color} />
                <span className="who">
                  <b>{p.n}</b>
                  <small>
                    {tn(p.apps, "{n} app", "{n} apps")}
                    {p.posName ? ` · ${t(p.posName)}` : ""}
                  </small>
                </span>
                <span className="val" aria-label={unit(value(p))}>
                  {fmtNum(value(p))}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <MiniEmpty>{t("No one has registered yet this season.")}</MiniEmpty>
      )}
    </section>
  );
}
