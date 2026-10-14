import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SeasonData } from "../../../shared/season";
import { t } from "../../i18n";
import { elo, fixtureDifficulty, teamMap } from "../../lib/analytics";
import { addDays, fmtDayLong, fmtDayShort, fmtDow, fmtMonth, fmtNum, fmtPct, fmtTime, isoDay, startOfDay } from "../../lib/format";
import { useSwipe } from "../../lib/gestures";
import { useStored } from "../../lib/hooks";
import { localeTag } from "../../lib/settings";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "../Icons";
import { Crest, Empty, Skeleton } from "../ui";
import { gameResult, opponentOf, type ClubGame } from "./data";
import { IconGrid, IconList } from "./icons";
import { gameAria, MiniEmpty, ResultBadge, scoreLine, SectionHead, SkelRows } from "./ui";

type View = "calendar" | "list";

export function Fixtures({ teamId, games, loading, season }: { teamId: string; games: ClubGame[]; loading: boolean; season: SeasonData | undefined }) {
  const [view, setView] = useStored<View>("pitch.club.fixturesView", "calendar");

  if (loading) {
    return (
      <div className="cl-stack" aria-busy="true">
        <Skeleton h={460} r={28} />
        <SkelRows n={5} />
      </div>
    );
  }
  if (!games.length) {
    return (
      <Empty icon={<IconCalendar />} title={t("No fixtures yet")}>
        {t("The schedule for this club hasn’t been published.")}
      </Empty>
    );
  }

  return (
    <div className="cl-stack">
      <section aria-labelledby="cl-season-fx">
        <SectionHead
          id="cl-season-fx"
          title={t("Season")}
          aside={
            <div className="cl-toggle" role="group" aria-label={t("View")}>
              <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>
                <IconGrid />
                <span>{t("Calendar")}</span>
              </button>
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
                <IconList />
                <span>{t("List")}</span>
              </button>
            </div>
          }
        />
        {view === "calendar" ? <Calendar teamId={teamId} games={games} /> : <GameList teamId={teamId} games={games} />}
      </section>
      <Upcoming teamId={teamId} season={season} />
    </div>
  );
}

/* ------------------------------------------------------------ calendar -- */

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();

function Calendar({ teamId, games }: { teamId: string; games: ClubGame[] }) {
  const nav = useNavigate();
  const byDay = useMemo(() => {
    const m = new Map<string, ClubGame[]>();
    for (const g of games) {
      const k = isoDay(new Date(g.date));
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    return m;
  }, [games]);

  const first = monthStart(new Date(games[0].date));
  const last = monthStart(new Date(games[games.length - 1].date));
  const initial = useMemo(() => {
    const now = Date.now();
    const upcoming = games.find((g) => Date.parse(g.date) >= now - 3 * 3600e3);
    const target = upcoming ?? games[games.length - 1];
    return monthStart(new Date(target.date));
  }, [games]);

  const [month, setMonth] = useState(initial);
  const [focusDay, setFocusDay] = useState<string>(() => {
    const k = [...byDay.keys()].find((d) => d.startsWith(isoDay(initial).slice(0, 7)));
    return k ?? isoDay(initial);
  });
  const moveFocus = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const canPrev = monthKey(month) > monthKey(first);
  const canNext = monthKey(month) < monthKey(last);

  const go = (n: number) => {
    const next = addMonths(month, n);
    if (monthKey(next) < monthKey(first) || monthKey(next) > monthKey(last)) return;
    setMonth(next);
    const k = [...byDay.keys()].find((d) => d.startsWith(isoDay(next).slice(0, 7)));
    setFocusDay(k ?? isoDay(next));
  };

  const swipeRef = useSwipe<HTMLDivElement>((dir) => go(dir === -1 ? 1 : -1));

  // Grid cells: Monday-first weeks covering the month.
  const offset = (month.getDay() + 6) % 7;
  const gridStart = addDays(month, -offset);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const today = isoDay(startOfDay(new Date()));
  // Locale-aware weekday names starting Monday (1 Jan 2024 was a Monday).
  const dows = useMemo(() => {
    const long = new Intl.DateTimeFormat(localeTag(), { weekday: "long" });
    return Array.from({ length: 7 }, (_, i) => ({ short: fmtDow(new Date(2024, 0, 1 + i)), long: long.format(new Date(2024, 0, 1 + i)) }));
  }, []);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = new Date(`${focusDay}T12:00:00`);
    if (Number.isNaN(cur.getTime())) return;
    const rtl = document.documentElement.dir === "rtl";
    let next: Date | null = null;
    switch (e.key) {
      case "ArrowRight":
        next = addDays(cur, rtl ? -1 : 1);
        break;
      case "ArrowLeft":
        next = addDays(cur, rtl ? 1 : -1);
        break;
      case "ArrowDown":
        next = addDays(cur, 7);
        break;
      case "ArrowUp":
        next = addDays(cur, -7);
        break;
      case "Home":
        next = addDays(cur, -((cur.getDay() + 6) % 7));
        break;
      case "End":
        next = addDays(cur, 6 - ((cur.getDay() + 6) % 7));
        break;
      case "PageDown":
        next = new Date(cur.getFullYear(), cur.getMonth() + 1, Math.min(cur.getDate(), 28));
        break;
      case "PageUp":
        next = new Date(cur.getFullYear(), cur.getMonth() - 1, Math.min(cur.getDate(), 28));
        break;
      case "Enter":
      case " ": {
        const g = byDay.get(focusDay)?.[0];
        if (g && e.key === " ") {
          e.preventDefault();
          nav(`/match/${g.slug}/${g.id}`);
        }
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    const nm = monthStart(next);
    if (monthKey(nm) < monthKey(first) || monthKey(nm) > monthKey(last)) return;
    moveFocus.current = true;
    if (monthKey(nm) !== monthKey(month)) setMonth(nm);
    setFocusDay(isoDay(next));
  };

  const monthGames = games.filter((g) => {
    const d = new Date(g.date);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  });
  const titleId = "cl-cal-title";

  return (
    <div className="cl-cal-wrap">
      <div className="cl-cal glass" ref={swipeRef} data-no-swipe="">
        <div className="cl-cal-head">
          <button type="button" className="icon-btn cl-flip" onClick={() => go(-1)} disabled={!canPrev} aria-label={t("Previous month")}>
            <IconChevronLeft />
          </button>
          <h3 id={titleId} aria-live="polite">
            {fmtMonth(month)}
          </h3>
          <button type="button" className="icon-btn cl-flip" onClick={() => go(1)} disabled={!canNext} aria-label={t("Next month")}>
            <IconChevronRight />
          </button>
        </div>
        <div className="cl-cal-grid" role="grid" aria-labelledby={titleId} ref={gridRef} onKeyDown={onKey}>
          <div role="row" className="cl-cal-row dows">
            {dows.map((d) => (
              <span role="columnheader" key={d.short} className="dow" title={d.long}>
                <abbr title={d.long}>{d.short}</abbr>
              </span>
            ))}
          </div>
          {Array.from({ length: weeks }, (_, w) => (
            <div role="row" className="cl-cal-row" key={w}>
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(gridStart, w * 7 + i);
                const k = isoDay(day);
                const inMonth = day.getMonth() === month.getMonth();
                if (!inMonth) return <span role="gridcell" key={k} className="cl-day out" aria-hidden="true" />;
                const g = byDay.get(k)?.[0];
                const focusable = k === focusDay;
                const cls = `cl-day${k === today ? " today" : ""}${g ? " has" : ""}`;
                if (!g) {
                  return (
                    <span role="gridcell" key={k} className={cls}>
                      <span
                        className="cl-day-in"
                        data-day={k}
                        tabIndex={focusable ? 0 : -1}
                        aria-label={`${fmtDayLong(day)}, ${t("no match")}`}
                        onFocus={() => setFocusDay(k)}
                      >
                        <span className="dn num" aria-hidden="true">
                          {fmtNum(day.getDate())}
                        </span>
                      </span>
                    </span>
                  );
                }
                const { side, home } = opponentOf(g, teamId);
                const r = gameResult(g, teamId);
                return (
                  <span role="gridcell" key={k} className={`${cls}${r ? ` r${r}` : ""}${g.void ? " void" : ""}`}>
                    <Link
                      to={`/match/${g.slug}/${g.id}`}
                      className="cl-day-in"
                      data-day={k}
                      tabIndex={focusable ? 0 : -1}
                      aria-label={`${fmtDayLong(day)}: ${gameAria(g, teamId)}`}
                      onFocus={() => setFocusDay(k)}
                    >
                      <span className="dn num" aria-hidden="true">
                        {fmtNum(day.getDate())}
                      </span>
                      <span className="ha" aria-hidden="true">
                        {home ? t("H") : t("A")}
                      </span>
                      <span className="crest-slot" aria-hidden="true">
                        <Crest src={side.logo} size={26} alt={side.name} />
                      </span>
                      <span className="foot" aria-hidden="true">
                        {r ? (
                          <>
                            <ResultBadge r={r} size="sm" />
                            <span className="sc num">{scoreLine(g)}</span>
                          </>
                        ) : g.void ? (
                          <span className="pp">{t("PP")}</span>
                        ) : g.state === "in" ? (
                          <span className="pill live">{t("Live")}</span>
                        ) : (
                          <span className="tm num">{fmtTime(g.date)}</span>
                        )}
                      </span>
                    </Link>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cl-cal-key" aria-hidden="true">
          <span>
            <ResultBadge r="W" size="sm" /> {t("Win")}
          </span>
          <span>
            <ResultBadge r="D" size="sm" /> {t("Draw")}
          </span>
          <span>
            <ResultBadge r="L" size="sm" /> {t("Loss")}
          </span>
          <span>
            <b className="ha-key">{t("H")}</b> {t("Home")}
          </span>
          <span>
            <b className="ha-key">{t("A")}</b> {t("Away")}
          </span>
        </div>
      </div>
      <div className="cl-cal-month">
        <p className="panel-title">{t("Matches in {month}", { month: fmtMonth(month) })}</p>
        {monthGames.length ? <Rows teamId={teamId} games={monthGames} /> : <MiniEmpty>{t("No matches this month.")}</MiniEmpty>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- list -- */

function GameList({ teamId, games }: { teamId: string; games: ClubGame[] }) {
  const months = useMemo(() => {
    const out: { key: string; label: string; games: ClubGame[] }[] = [];
    for (const g of games) {
      const d = new Date(g.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let m = out[out.length - 1];
      if (!m || m.key !== key) {
        m = { key, label: fmtMonth(monthStart(d)), games: [] };
        out.push(m);
      }
      m.games.push(g);
    }
    return out;
  }, [games]);
  return (
    <div className="cl-months">
      {months.map((m) => (
        <section key={m.key} aria-label={m.label}>
          <p className="panel-title cl-month-title">{m.label}</p>
          <Rows teamId={teamId} games={m.games} />
        </section>
      ))}
    </div>
  );
}

function Rows({ teamId, games }: { teamId: string; games: ClubGame[] }) {
  return (
    <ul className="list glass cl-rows">
      {games.map((g) => {
        const { side, home } = opponentOf(g, teamId);
        const r = gameResult(g, teamId);
        const d = new Date(g.date);
        return (
          <li key={g.id}>
            <Link to={`/match/${g.slug}/${g.id}`} className="row clickable cl-grow" aria-label={gameAria(g, teamId)}>
              <span className="cl-date" aria-hidden="true">
                <b className="num">{fmtNum(d.getDate())}</b>
                <small>{fmtDow(d)}</small>
              </span>
              <Crest src={side.logo} size={30} alt="" />
              <span className="grow" aria-hidden="true">
                <span className="title">
                  <span className={`cl-ha ${home ? "h" : "a"}`}>{home ? t("H") : t("A")}</span>
                  {side.name}
                </span>
                <span className="caption">
                  {[g.comp, g.venue].filter(Boolean).join(" · ") || fmtDayShort(g.date)}
                </span>
              </span>
              <span className="cl-right" aria-hidden="true">
                {r ? (
                  <>
                    <span className="num cl-score">{scoreLine(g)}</span>
                    <ResultBadge r={r} />
                  </>
                ) : g.void ? (
                  <span className="pill">{t("Postponed")}</span>
                ) : g.state === "in" ? (
                  <span className="pill live">{t("Live")}</span>
                ) : (
                  <span className="pill num">{fmtTime(g.date)}</span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------ upcoming -- */

const DIFF_LABEL = ["Favourable", "Fair", "Even", "Tough", "Very tough"];

function Upcoming({ teamId, season }: { teamId: string; season: SeasonData | undefined }) {
  const list = useMemo(() => {
    if (!season || !season.teams.some((x) => x.id === teamId)) return null;
    return fixtureDifficulty(season, elo(season), 5).get(teamId) ?? [];
  }, [season, teamId]);
  const teams = useMemo(() => (season ? teamMap(season) : new Map()), [season]);
  if (list === null) return null;
  return (
    <section aria-labelledby="cl-next5">
      <SectionHead id="cl-next5" title={t("Next five")} aside={<span className="subtle cl-aside">{t("Difficulty from Pitch Elo ratings")}</span>} />
      {list.length ? (
        <ul className="list glass cl-rows">
          {list.map((f) => {
            const opp = teams.get(f.opponent);
            const label = t(DIFF_LABEL[f.difficulty - 1] ?? "Even");
            return (
              <li key={f.match.id}>
                <Link to={`/match/${season!.league}/${f.match.id}`} className="row clickable cl-grow">
                  <span className="cl-date" aria-hidden="true">
                    <b className="num">{fmtNum(new Date(f.match.d).getDate())}</b>
                    <small>{fmtDow(new Date(f.match.d))}</small>
                  </span>
                  <Crest src={opp?.l} size={30} alt="" />
                  <span className="grow">
                    <span className="title">
                      <span className={`cl-ha ${f.home ? "h" : "a"}`} aria-label={f.home ? t("Home") : t("Away")}>
                        {f.home ? t("H") : t("A")}
                      </span>
                      {opp?.n ?? t("Opponent")}
                    </span>
                    <span className="caption">
                      {fmtDayShort(f.match.d)} · {t("{p} win chance", { p: fmtPct(f.winProb) })}
                    </span>
                  </span>
                  <span className="cl-diff" role="img" aria-label={t("Difficulty {n} of 5: {label}", { n: f.difficulty, label })}>
                    <span className="meter" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <i key={i} className={i <= f.difficulty ? `on d${f.difficulty}` : ""} />
                      ))}
                    </span>
                    <small aria-hidden="true">{label}</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <MiniEmpty>{t("No league fixtures left to rate.")}</MiniEmpty>
      )}
    </section>
  );
}
