import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { t, tn } from "../../i18n";
import { refereeStats, type SeasonData } from "../../lib/analytics";
import type { KeyEvent, Side, SummaryData } from "../../lib/api";
import { fmtDate, fmtDayShort, fmtNum, fmtPct, fmtTime, teamTint } from "../../lib/format";
import { usePlayer } from "../../lib/hooks";
import { useDrawIn } from "../../lib/motion";
import { IconBall, IconCalendar, IconChevronRight, IconClock, IconPeople, IconPin, IconStats, IconSub, IconWhistle } from "../Icons";
import { Crest, Sheet, tsdbSize } from "../ui";
import { WatchPanel } from "../watch";
import { Legend, Swatch } from "./charts";
import { parseClock, sameName, type Kick, type Rating, type SideKey } from "./data";
import type { Probs } from "./Hero";
import { IconPlus, IconVar } from "./icons";
import { stadiumTime, tempLabel, WeatherIcon, weatherLabel, type Weather } from "./venue";

/* ------------------------------------------------------- win probability -- */

export function WinProbCard({ s, p, title }: { s: SummaryData; p: Probs; title: string }) {
  const { home, away } = s.match;
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const fav = p.h >= p.a && p.h >= p.d ? "home" : p.a >= p.d ? "away" : "draw";
  return (
    <section className="panel glass mc-winprob" ref={ref} aria-labelledby="mc-wp-t">
      <div className="mc-panel-head">
        <p className="panel-title" id="mc-wp-t">
          {title}
        </p>
        <span className="pill mc-src">{p.source}</span>
      </div>
      <div className="mc-wp-heads">
        <div className={fav === "home" ? "fav" : ""}>
          <Crest src={home.logo} size={30} alt="" />
          <b>{fmtPct(p.h)}</b>
          <span>{home.short}</span>
        </div>
        <div className={`draw${fav === "draw" ? " fav" : ""}`}>
          <b>{fmtPct(p.d)}</b>
          <span>{t("Draw")}</span>
        </div>
        <div className={fav === "away" ? "fav" : ""}>
          <Crest src={away.logo} size={30} alt="" />
          <b>{fmtPct(p.a)}</b>
          <span>{away.short}</span>
        </div>
      </div>
      <div
        className="mc-prob-bar lg"
        role="img"
        aria-label={t("Win probability: {home} {h}, draw {d}, {away} {a}", { home: home.short, away: away.short, h: fmtPct(p.h), d: fmtPct(p.d), a: fmtPct(p.a) })}
      >
        <i className="h" style={{ flexGrow: drawn ? p.h : 1 }} />
        <i className="d" style={{ flexGrow: drawn ? p.d : 1 }} />
        <i className="a" style={{ flexGrow: drawn ? p.a : 1 }} />
      </div>
      <Legend
        items={[
          { key: "h", label: home.short, swatch: <Swatch side="home" /> },
          { key: "d", label: t("Draw"), swatch: <Swatch neutral /> },
          { key: "a", label: away.short, swatch: <Swatch side="away" /> },
        ]}
      />
      <p className="mc-foot">
        {p.kind === "model"
          ? t("From each club’s Elo-style rating this season and a Poisson goals model, including home advantage.")
          : t("Implied by the bookmaker’s pre-match moneyline odds, with the margin removed.")}
      </p>
    </section>
  );
}

/* ------------------------------------------------------ player of match -- */

const SINGULAR: Record<string, string> = { Goals: "Goal", Assists: "Assist", "Shots on target": "Shot on target", Saves: "Save" };

export function PotmCard({ r, s, live, onOpen }: { r: Rating; s: SummaryData; live: boolean; onOpen: () => void }) {
  const team = r.player.side === "home" ? s.match.home : s.match.away;
  const color = teamTint(team.color, "#5e5ce6");
  const { info } = usePlayer(r.player.name, team.name);
  const cut = tsdbSize(info?.cutout, "medium");
  const photo = !cut ? tsdbSize(info?.photo, "medium") : null;
  const [why, setWhy] = useState(false);
  return (
    <section className="mc-potm glass" aria-labelledby="mc-potm-t">
      <div className="mc-potm-bg" style={{ background: `radial-gradient(90% 120% at 85% 20%, color-mix(in srgb, ${color} 75%, white 8%), ${color} 55%, color-mix(in srgb, ${color} 60%, black))` }} aria-hidden />
      <button type="button" className="mc-potm-main" onClick={onOpen} aria-label={t("Open {player}", { player: r.player.name })}>
        <div className="mc-potm-info">
          <span className="mc-potm-eyebrow" id="mc-potm-t">
            {live ? t("Top performer") : t("Player of the match")}
          </span>
          <span className="mc-potm-name">{r.player.name}</span>
          <span className="mc-potm-team">
            <span className="mc-potm-crest">
              <Crest src={team.logo} size={18} alt="" />
            </span>
            {team.short}
            {r.player.posName ? ` · ${r.player.posName}` : ""}
          </span>
          <span className="mc-potm-rating" aria-label={t("Rating {r} out of 10", { r: fmtNum(r.rating, 1) })}>
            <b>{fmtNum(r.rating, 1)}</b>
            <small>/ 10</small>
          </span>
          {r.chips.length > 0 && (
            <span className="mc-potm-chips">
              {r.chips.map((c) => (
                <span key={c.label}>
                  <b>{fmtNum(c.value)}</b> {c.value === 1 ? t(SINGULAR[c.label] ?? c.label) : t(c.label)}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="mc-potm-cut" aria-hidden>
          {cut ? <img src={cut} alt="" loading="lazy" /> : photo ? <img className="ph" src={photo} alt="" loading="lazy" /> : <span className="mc-potm-num">{r.player.jersey}</span>}
        </div>
      </button>
      <button type="button" className="mc-potm-why" aria-expanded={why} onClick={() => setWhy((v) => !v)}>
        {t("How the rating works")}
      </button>
      {why && (
        <ul className="mc-potm-parts">
          <li>
            <span>{t("Base")}</span>
            <b>6.0</b>
          </li>
          {r.parts.map((p) => (
            <li key={p.label}>
              <span>{t(p.label)}</span>
              <b className={p.delta > 0 ? "up" : "down"}>
                {p.delta > 0 ? "+" : "−"}
                {fmtNum(Math.abs(p.delta), 1)}
              </b>
            </li>
          ))}
          <li className="total">
            <span>{t("Rating")}</span>
            <b>{fmtNum(r.rating, 1)}</b>
          </li>
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ shoot-out -- */

export function ShootoutCard({ kicks, s }: { kicks: Kick[]; s: SummaryData }) {
  const { home, away } = s.match;
  const per = { home: kicks.filter((k) => k.side === "home"), away: kicks.filter((k) => k.side === "away") };
  const rounds = Math.max(per.home.length, per.away.length, 5);
  const score = (side: SideKey) => {
    const hdr = side === "home" ? home.shootout : away.shootout;
    return hdr ?? per[side].filter((k) => k.scored).length;
  };
  const first = kicks[0]?.side;
  return (
    <section className="panel glass mc-shootout" aria-labelledby="mc-so-t">
      <div className="mc-panel-head">
        <p className="panel-title" id="mc-so-t">
          {t("Penalty shoot-out")}
        </p>
        <span className="mc-so-score num">
          {score("home")}–{score("away")}
        </span>
      </div>
      {(["home", "away"] as SideKey[]).map((side) => {
        const team: Side = side === "home" ? home : away;
        return (
          <div key={side} className="mc-so-row">
            <span className="mc-so-team">
              <Crest src={team.logo} size={26} alt="" />
              <span>{team.short}</span>
              {first === side && <span className="pill">{t("First")}</span>}
            </span>
            <ol className="mc-so-kicks" aria-label={t("{team} penalties", { team: team.short })}>
              {Array.from({ length: rounds }, (_, i) => {
                const k = per[side][i];
                return (
                  <li key={i} className={k ? (k.scored ? "in" : "out") : "none"} title={k ? `${k.taker} · ${k.scored ? t("Scored") : t("Missed")}` : t("Not taken")}>
                    <span className="mark" aria-hidden>
                      {k ? (k.scored ? "✓" : "✕") : ""}
                    </span>
                    <span className="sr-only">
                      {k ? `${t("Kick {n}", { n: i + 1 })}: ${k.taker}, ${k.scored ? t("Scored") : t("Missed")}` : t("Kick {n}: not taken", { n: i + 1 })}
                    </span>
                    {k && <small aria-hidden>{k.taker.split(" ").slice(-1)[0]}</small>}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------- timeline -- */

const TL_TYPES = /goal|penalty---scored|card|substitution|halftime|end-regular-time|kickoff|end-extra|shootout|own-goal|var/;

export function Timeline({ s }: { s: SummaryData }) {
  const { home, away } = s.match;
  const events = s.events.filter((e) => TL_TYPES.test(e.type) || e.scoring);
  let h = 0;
  let a = 0;
  const hasEt = s.events.some((e) => e.period >= 3);
  return (
    <section className="panel glass" aria-labelledby="mc-tl-t">
      <p className="panel-title" id="mc-tl-t">
        {t("Timeline")}
      </p>
      {events.length === 0 ? (
        <p className="muted mc-empty-line">
          {s.match.state === "pre"
            ? t("Kick-off {date}. Key events will appear here live.", { date: `${fmtDayShort(s.match.date)} · ${fmtTime(s.match.date)}` })
            : t("No key events recorded.")}
        </p>
      ) : (
        <ol className="timeline mc-timeline">
          {events.map((e, i) => {
            if (e.scoring && !/shootout/.test(e.type)) {
              if (e.teamId === home.id) h++;
              else if (e.teamId === away.id) a++;
            }
            const sc = `${h}–${a}`;
            if (e.type === "kickoff") return <Divider key={e.id} label={t("Kick-off")} />;
            if (e.type === "halftime") return <Divider key={e.id} label={t("Half-time · {score}", { score: sc })} />;
            if (e.type === "end-regular-time") return <Divider key={e.id} label={hasEt ? t("End of normal time · {score}", { score: sc }) : t("Full time · {score}", { score: sc })} />;
            if (e.type === "halftime-extra-time") return <Divider key={e.id} label={t("Extra-time break · {score}", { score: sc })} />;
            if (e.type === "end-extra-time") return <Divider key={e.id} label={t("End of extra time · {score}", { score: sc })} />;
            if (/shootout/.test(e.type) && !e.teamId) return <Divider key={e.id} label={t("Penalty shoot-out")} />;
            if (!e.teamId || (e.teamId !== home.id && e.teamId !== away.id)) return null;
            return <EventRow key={e.id} e={e} home={e.teamId === home.id} delay={i * 25} score={e.scoring ? sc : null} />;
          })}
        </ol>
      )}
    </section>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <li className="tl-divider">
      <span>{label}</span>
    </li>
  );
}

function EventRow({ e, home, delay, score }: { e: KeyEvent; home: boolean; delay: number; score: string | null }) {
  const [p1, p2] = e.players;
  let icon: ReactNode;
  let title = p1?.name || e.text;
  let sub = "";
  let cls = "";
  if (e.scoring) {
    icon = <IconBall />;
    cls = "goal";
    sub = [score, e.ownGoal ? t("Own goal") : e.penalty ? t("Penalty") : p2 ? t("Assist: {name}", { name: p2.name }) : t("Goal")].filter(Boolean).join(" · ");
  } else if (e.type.includes("yellow")) {
    icon = <i className="card-y" />;
    sub = t("Yellow card");
  } else if (e.type.includes("red")) {
    icon = <i className="card-r" />;
    sub = /second yellow/i.test(e.text) ? t("Second yellow card") : t("Red card");
  } else if (e.type === "substitution") {
    icon = <IconSub />;
    title = p1?.name ?? t("Substitution");
    sub = p2 ? t("Off: {name}", { name: p2.name }) : t("Substitution");
  } else if (/var/.test(e.type)) {
    icon = <IconVar />;
    cls = "var";
    sub = t("VAR review");
  } else {
    icon = <IconPlus />;
    sub = e.text;
  }
  const c = parseClock(e.clock);
  const body = (
    <span className="who">
      <b>{title}</b>
      <small>{sub}</small>
    </span>
  );
  const ic = (
    <span className={`tl-icon ${cls}`} aria-hidden>
      {icon}
    </span>
  );
  return (
    <li className={`tl-row${e.scoring ? " is-goal" : ""}`} style={{ animationDelay: `${Math.min(delay, 600)}ms` }}>
      <div className="tl-ev home">{home && <>{body}{ic}</>}</div>
      <span className="tl-min">{c ? (c.added ? `${c.min}+${c.added}'` : `${c.min}'`) : e.clock}</span>
      <div className="tl-ev away">{!home && <>{ic}{body}</>}</div>
    </li>
  );
}

/* --------------------------------------------------------------- form ---- */

export function FormPanel({ s }: { s: SummaryData }) {
  const sides = [s.match.home, s.match.away].filter((tm) => s.form[tm.id]?.length);
  if (!sides.length) return null;
  return (
    <section className="panel glass" aria-labelledby="mc-form-t">
      <p className="panel-title" id="mc-form-t">
        {t("Recent form")}
      </p>
      <div className="mc-form-grid">
        {sides.map((tm) => (
          <div key={tm.id}>
            <div className="mc-form-head">
              <Crest src={tm.logo} size={22} alt="" />
              {tm.short}
            </div>
            <ul className="mc-form-list">
              {s.form[tm.id].map((g) => (
                <li key={g.id}>
                  <Link to={`/match/${s.match.league.slug}/${g.id}`} className="mc-form-row">
                    <span className={`form-dot ${g.result}`} aria-label={g.result === "W" ? t("Win") : g.result === "L" ? t("Loss") : t("Draw")}>
                      {g.result}
                    </span>
                    <Crest src={g.opponentLogo} size={20} alt="" />
                    <span className="nm">{g.opponent}</span>
                    <span className="num muted">{g.score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- match info --- */

function InfoRow({ icon, k, v, onClick }: { icon: ReactNode; k: string; v: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="mc-info-ic" aria-hidden>
        {icon}
      </span>
      <span className="mc-info-k">{k}</span>
      <span className="mc-info-v">{v}</span>
      {onClick && <IconChevronRight className="chev" />}
    </>
  );
  return onClick ? (
    <button type="button" className="mc-info-row clickable" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="mc-info-row">{inner}</div>
  );
}

export function MatchInfo({ s, referee, refAvailable, onReferee }: { s: SummaryData; referee: string | null; refAvailable: boolean; onReferee: () => void }) {
  return (
    <section className="panel glass mc-info" aria-labelledby="mc-info-t">
      <p className="panel-title" id="mc-info-t">
        {t("Match info")}
      </p>
      <InfoRow icon={<IconPin />} k={t("Venue")} v={[s.venue, s.city].filter(Boolean).join(", ") || "—"} />
      <InfoRow icon={<IconCalendar />} k={t("Kick-off")} v={`${fmtDayShort(s.match.date)} · ${fmtTime(s.match.date)}`} />
      {s.attendance > 0 && <InfoRow icon={<IconPeople />} k={t("Attendance")} v={fmtNum(s.attendance)} />}
      {referee && <InfoRow icon={<IconWhistle />} k={t("Referee")} v={referee} onClick={refAvailable ? onReferee : undefined} />}
      <InfoRow icon={<IconStats />} k={t("Competition")} v={s.match.note || s.match.league.name} />
    </section>
  );
}

/* ------------------------------------------------------------ referee ---- */

export function refereeFor(season: SeasonData | undefined, name: string | null) {
  if (!season || !name) return null;
  const { refs, league } = refereeStats(season);
  for (const [k, v] of refs) if (sameName(k, name)) return { ref: v, league, key: k };
  return null;
}

export function RefereeSheet({
  name,
  season,
  building,
  progress,
  league,
  onClose,
}: {
  name: string;
  season: SeasonData | undefined;
  building: boolean;
  progress: number;
  league: string;
  onClose: () => void;
}) {
  const found = useMemo(() => refereeFor(season, name), [season, name]);
  const teams = useMemo(() => new Map((season?.teams ?? []).map((tm) => [tm.id, tm])), [season]);
  const recent = useMemo(() => {
    if (!season || !found) return [];
    return season.matches
      .filter((m) => m.ref && sameName(m.ref, found.key) && m.s === "post" && m.hs !== null && m.as !== null)
      .sort((a, b) => b.d.localeCompare(a.d))
      .slice(0, 6);
  }, [season, found]);
  const [ref, drawn] = useDrawIn<HTMLDivElement>();

  const r = found?.ref;
  const lg = found?.league;
  const per = (n: number, g: number) => (g > 0 ? n / g : 0);
  const rows = r && lg
    ? [
        { k: t("Yellow cards per game"), v: per(r.yellows, r.games), avg: per(lg.yellows, lg.games), d: 2 },
        { k: t("Red cards per game"), v: per(r.reds, r.games), avg: per(lg.reds, lg.games), d: 2 },
        { k: t("Goals per game"), v: per(r.goals, r.games), avg: per(lg.goals, lg.games), d: 2 },
      ]
    : [];

  return (
    <Sheet onClose={onClose} label={t("Referee {name}", { name })}>
      <div className="mc-ref" ref={ref}>
        <div className="mc-ref-head">
          <span className="mc-ref-ic" aria-hidden>
            <IconWhistle />
          </span>
          <div>
            <p className="eyebrow">{t("Referee")}</p>
            <h2>{name}</h2>
            {r && <p className="muted">{tn(r.games, "{n} game this season", "{n} games this season")}</p>}
          </div>
        </div>
        {!r ? (
          <p className="muted mc-ref-empty">
            {building ? t("Season data is still syncing ({pct}). Check back shortly.", { pct: fmtPct(progress) }) : t("No refereeing record for this season yet.")}
          </p>
        ) : (
          <>
            <div className="mc-ref-tiles">
              <div className="tile">
                <div className="k">{t("Games")}</div>
                <div className="v">{fmtNum(r.games)}</div>
              </div>
              <div className="tile">
                <div className="k">{t("Home wins")}</div>
                <div className="v">{fmtPct(per(r.homeWins, r.games))}</div>
                <div className="s">{t("League {pct}", { pct: fmtPct(per(lg!.homeWins, lg!.games)) })}</div>
              </div>
            </div>
            <div className="mc-ref-bars">
              {rows.map((row) => {
                const max = Math.max(row.v, row.avg, 0.01) * 1.15;
                return (
                  <div key={row.k} className="mc-ref-bar" role="img" aria-label={t("{k}: {v}, league average {avg}", { k: row.k, v: fmtNum(row.v, row.d), avg: fmtNum(row.avg, row.d) })}>
                    <div className="mc-ref-bar-head" aria-hidden>
                      <span>{row.k}</span>
                      <b>{fmtNum(row.v, row.d)}</b>
                    </div>
                    <div className="mc-ref-track" aria-hidden>
                      <i className="me" style={{ width: drawn ? `${(row.v / max) * 100}%` : 0 }} />
                    </div>
                    <div className="mc-ref-track avg" aria-hidden>
                      <i style={{ width: drawn ? `${(row.avg / max) * 100}%` : 0 }} />
                    </div>
                    <div className="mc-ref-avg" aria-hidden>
                      <Swatch neutral shape="line" />
                      {t("League average")} {fmtNum(row.avg, row.d)}
                    </div>
                  </div>
                );
              })}
            </div>
            {recent.length > 0 && (
              <>
                <p className="panel-title mc-ref-sub">{t("Recent games")}</p>
                <ul className="mc-ref-games">
                  {recent.map((m) => {
                    const ht = teams.get(m.h);
                    const at = teams.get(m.a);
                    return (
                      <li key={m.id}>
                        <Link to={`/match/${league}/${m.id}`} onClick={onClose} className="mc-ref-game">
                          <span className="subtle">{fmtDate(m.d)}</span>
                          <span className="tm h">
                            <span className="nm">{ht?.s ?? ht?.n ?? ""}</span>
                            <Crest src={ht?.l} size={20} alt="" />
                          </span>
                          <b className="num">
                            {m.hs}–{m.as}
                          </b>
                          <span className="tm">
                            <Crest src={at?.l} size={20} alt="" />
                            <span className="nm">{at?.s ?? at?.n ?? ""}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {building && <p className="mc-foot">{t("Based on matches synced so far ({pct}).", { pct: fmtPct(progress) })}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------- kick-off card -- */

export function KickoffCard({ s, weather, loading, timezone }: { s: SummaryData; weather: Weather | null; loading: boolean; timezone: string | null }) {
  const m = s.match;
  const local = stadiumTime(m.date, timezone);
  return (
    <section className="panel glass mc-kickoff" aria-labelledby="mc-ko-t">
      <p className="panel-title" id="mc-ko-t">
        {t("Kick-off")}
      </p>
      <div className="mc-ko-times">
        <div>
          <IconClock />
          <span>
            <b>{fmtTime(m.date)}</b>
            <small>{t("Your time")}</small>
          </span>
        </div>
        {local && (
          <div>
            <IconPin />
            <span>
              <b>{local}</b>
              <small>{t("At the stadium")}</small>
            </span>
          </div>
        )}
      </div>
      {weather ? (
        <div className="mc-wx">
          <WeatherIcon code={weather.code} day={weather.day} size={56} />
          <div className="mc-wx-main">
            <b>{tempLabel(weather)}</b>
            <span>{weatherLabel(weather.code)}</span>
          </div>
          <dl className="mc-wx-facts">
            {weather.rain != null && (
              <div>
                <dt>{t("Rain")}</dt>
                <dd>{fmtPct(weather.rain / 100)}</dd>
              </div>
            )}
            {weather.wind != null && (
              <div>
                <dt>{t("Wind")}</dt>
                <dd>
                  {fmtNum(Math.round(weather.wind))} {weather.windUnit}
                </dd>
              </div>
            )}
          </dl>
        </div>
      ) : loading ? (
        <div className="skel" style={{ height: 64, borderRadius: 18 }} />
      ) : null}
      {weather && <p className="mc-foot">{t("Forecast for kick-off from Open-Meteo.")}</p>}
    </section>
  );
}

/* ---------------------------------------------------------- watch panel -- */

export function Watch({ s }: { s: SummaryData }) {
  return <WatchPanel league={s.match.league.slug} broadcasts={s.match.broadcasts} />;
}
