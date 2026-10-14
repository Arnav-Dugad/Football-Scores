import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconCalendar, IconChevronRight, IconLive } from "../components/Icons";
import { MatchHero } from "../components/hero";
import { MatchCard } from "../components/match";
import { NewsCard } from "../components/news";
import { Empty, ErrorState, LeagueBadge } from "../components/ui";
import { WatchStrip } from "../components/watch";
import { t, tn } from "../i18n";
import { YourClubs } from "../interaction/following";
import { NewsRailSkeleton, ScoresSkeleton } from "../interaction/skeletons";
import { isTyping, modalOpen, rememberMatches } from "../interaction/store";
import { useAccent } from "../lib/accent";
import { endpoints, normaliseNews, type Match } from "../lib/api";
import {
  addDays,
  espnDatesFor,
  fmtDayLong,
  fmtDayShort,
  fmtDow,
  fmtNum,
  fmtTime,
  isoDay,
  parseIsoDay,
  relativeDayLabel,
  sameLocalDay,
  startOfDay,
} from "../lib/format";
import { useSwipe } from "../lib/gestures";
import { prefetch, useApi, useDocumentTitle, useStored } from "../lib/hooks";
import { LEAGUES, LEAGUE_BY_SLUG, leagueLogo, leagueOrder } from "../lib/leagues";
import { useCountUp } from "../lib/motion";
import { useSettings } from "../lib/settings";

const ALL = LEAGUES.map((l) => l.slug);
const scoresPath = (day: Date) => endpoints.scores(espnDatesFor(day), ALL);

export default function Scores() {
  useDocumentTitle("");
  const [params, setParams] = useSearchParams();
  const today = startOfDay(new Date());
  const todayKey = isoDay(today);
  const day = parseIsoDay(params.get("d")) ?? today;
  const dayKey = isoDay(day);
  const isToday = dayKey === todayKey;
  const [filter, setFilter] = useStored<string>("pitch.filter", "all");
  const [settings] = useSettings();
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);

  const scores = useApi<{ events: Match[] }>(scoresPath(day), { refresh: isToday ? 30_000 : false });
  const calendar = useApi<{ days: Record<string, string[]> }>(endpoints.calendar(ALL));
  // `stale` = a new day was requested and isn't cached yet: show the skeleton, not the old day's leftovers.
  const pending = scores.loading || scores.stale;

  const all = useMemo(
    () =>
      (scores.data?.events ?? [])
        .filter((e) => sameLocalDay(e.date, day))
        .sort((a, b) => leagueOrder(a.league.slug) - leagueOrder(b.league.slug) || a.date.localeCompare(b.date)),
    [scores.data, dayKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => rememberMatches(all), [all]);

  const liveAll = useMemo(() => all.filter((e) => e.state === "in"), [all]);
  const validFilter = filter === "all" || filter === "live" || !!LEAGUE_BY_SLUG[filter] ? filter : "all";
  const events = useMemo(
    () => (validFilter === "all" ? all : validFilter === "live" ? liveAll : all.filter((e) => e.league.slug === validFilter)),
    [all, liveAll, validFilter],
  );

  const featured = useMemo(() => {
    if (!events.length) return null;
    const live = events.find((e) => e.state === "in");
    if (live) return live;
    if (isToday) {
      const next = events.find((e) => e.state === "pre");
      if (next) return next;
    }
    return events[0];
  }, [events, isToday]);
  useAccent(featured ? [featured.home.color, featured.away.color] : null);

  const followIds = useMemo(() => new Set(settings.teams.map((x) => x.id)), [settings.teams]);
  const yours = useMemo(() => events.filter((e) => followIds.has(e.home.id) || followIds.has(e.away.id)), [events, followIds]);
  const yoursIds = useMemo(() => new Set(yours.map((m) => m.id)), [yours]);

  const groups = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const e of events) {
      if (e === featured && events.length > 1) continue;
      map.set(e.league.slug, [...(map.get(e.league.slug) ?? []), e]);
    }
    return [...map.entries()];
  }, [events, featured]);

  const matchDays = useMemo(() => {
    const set = new Set<string>();
    for (const [slug, days] of Object.entries(calendar.data?.days ?? {})) {
      if (validFilter !== "all" && validFilter !== "live" && slug !== validFilter) continue;
      days.forEach((d) => set.add(d));
    }
    return set;
  }, [calendar.data, validFilter]);

  const nextMatchDay = useMemo(() => [...matchDays].sort().find((d) => d > dayKey) ?? null, [matchDays, dayKey]);

  const setDay = (d: Date) => {
    const k = isoDay(d);
    if (k === dayKey) return;
    setSlide(k > dayKey ? "next" : "prev");
    setParams(k === todayKey ? {} : { d: k }, { replace: true });
  };
  const step = (delta: 1 | -1) => setDay(addDays(day, delta));
  const stepRef = useRef(step);
  stepRef.current = step;

  // Swipe between days on the list area (direction flips automatically in RTL).
  const swipeRef = useSwipe<HTMLDivElement>((dir) => stepRef.current(dir === -1 ? 1 : -1));

  // ←/→ previous/next day.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTyping(e) || modalOpen()) return;
      const rtl = document.documentElement.dir === "rtl";
      const forward = (e.key === "ArrowRight") !== rtl;
      e.preventDefault();
      stepRef.current(forward ? 1 : -1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Warm the neighbouring days so swipes land instantly.
  useEffect(() => {
    if (pending) return;
    const id = window.setTimeout(() => {
      prefetch(scoresPath(addDays(day, 1)));
      prefetch(scoresPath(addDays(day, -1)));
    }, 600);
    return () => window.clearTimeout(id);
  }, [dayKey, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of all) c[e.league.slug] = (c[e.league.slug] ?? 0) + 1;
    return c;
  }, [all]);

  const liveCount = useCountUp(liveAll.length, { duration: 600 });

  const newsLeague = validFilter === "all" || validFilter === "live" ? "eng.1" : validFilter;
  const news = useApi<any>(endpoints.news(newsLeague));
  const articles = useMemo(() => (news.data ? normaliseNews(news.data).filter((a) => a.image).slice(0, 8) : []), [news.data]);

  const nextKickoff = isToday ? all.find((e) => e.state === "pre") : undefined;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{isToday ? fmtDayLong(day) : relativeDayLabel(day) ?? (day < today ? t("Results") : t("Fixtures"))}</p>
          <h1 className="large-title" data-compact={isToday ? undefined : fmtDayShort(day)}>
            {isToday ? t("Scores") : fmtDayLong(day)}
          </h1>
        </div>
        {liveAll.length > 0 && (
          <button
            type="button"
            className={`pill live ix-live-pill${validFilter === "live" ? " on" : ""}`}
            onClick={() => setFilter(validFilter === "live" ? "all" : "live")}
            aria-pressed={validFilter === "live"}
            aria-label={tn(liveAll.length, "{n} match live — show live only", "{n} matches live — show live only")}
          >
            <span className="pulse" aria-hidden />
            <span className="num">{t("{n} live", { n: fmtNum(liveCount) })}</span>
          </button>
        )}
      </div>

      <DateStrip day={day} today={today} onPick={setDay} matchDays={matchDays} />

      <div className="chips ix-filter-chips" role="group" aria-label={t("Competitions")}>
        {(liveAll.length > 0 || validFilter === "live") && (
          <button
            type="button"
            className={`chip text-only ix-chip-live${validFilter === "live" ? " active" : ""}`}
            onClick={() => setFilter("live")}
            aria-pressed={validFilter === "live"}
          >
            <span className="pulse" aria-hidden />
            {t("Live")}
            <span className="ix-chip-count num">{fmtNum(liveCount)}</span>
          </button>
        )}
        <button
          type="button"
          className={`chip text-only${validFilter === "all" ? " active" : ""}`}
          onClick={() => setFilter("all")}
          aria-pressed={validFilter === "all"}
        >
          {t("All competitions")}
          {all.length > 0 && <span className="ix-chip-count num">{fmtNum(all.length)}</span>}
        </button>
        {LEAGUES.map((l) => (
          <button
            type="button"
            key={l.slug}
            className={`chip${validFilter === l.slug ? " active" : ""}`}
            onClick={() => setFilter(l.slug)}
            aria-pressed={validFilter === l.slug}
          >
            <span className="chip-logo">
              <img src={leagueLogo(l.slug, false, 64)} alt="" loading="lazy" />
            </span>
            {t(l.short)}
            {counts[l.slug] ? <span className="ix-chip-count num">{fmtNum(counts[l.slug])}</span> : null}
          </button>
        ))}
      </div>

      <div ref={swipeRef} className="ix-swipe-area">
        <div key={dayKey} className={`ix-day${slide ? ` ${slide}` : ""}`}>
          {pending ? (
            <ScoresSkeleton />
          ) : scores.error && !scores.data ? (
            <ErrorState onRetry={scores.reload} />
          ) : !events.length ? (
            <>
              <YourClubs matches={[]} teams={settings.teams} />
              {validFilter === "live" ? (
                <Empty
                  icon={<IconLive />}
                  title={t("No live matches right now")}
                  action={
                    <button type="button" className="btn" onClick={() => setFilter("all")}>
                      {t("Show all matches")}
                    </button>
                  }
                >
                  {nextKickoff
                    ? t("Next kick-off at {time}: {home} v {away}.", {
                        time: fmtTime(nextKickoff.date),
                        home: nextKickoff.home.short,
                        away: nextKickoff.away.short,
                      })
                    : t("Live scores appear here the moment a match kicks off.")}
                </Empty>
              ) : (
                <Empty
                  icon={<IconCalendar />}
                  title={isToday ? t("No matches today") : t("No matches on {day}", { day: fmtDayShort(day) })}
                  action={
                    nextMatchDay ? (
                      <button type="button" className="btn" onClick={() => setDay(parseIsoDay(nextMatchDay)!)}>
                        {t("Next matchday · {day}", { day: fmtDayShort(parseIsoDay(nextMatchDay)!) })}
                        <IconChevronRight width={16} height={16} />
                      </button>
                    ) : undefined
                  }
                >
                  {validFilter === "all"
                    ? t("It’s a quiet day across the competitions we follow.")
                    : t("{league} has no fixtures on this day.", { league: t(LEAGUE_BY_SLUG[validFilter]?.name ?? "This competition") })}
                </Empty>
              )}
            </>
          ) : (
            <>
              <YourClubs matches={yours} teams={settings.teams} featuredId={featured?.id} />
              {featured && (
                <div className="ix-hero-wrap">
                  <MatchHero m={featured} />
                  {featured.state !== "post" && (
                    <div className="ix-hero-watch">
                      <WatchStrip league={featured.league.slug} max={4} />
                    </div>
                  )}
                </div>
              )}
              {groups.map(([slug, list]) => (
                <section className="league-group" key={slug} aria-labelledby={`lg-${slug}`}>
                  <div className="league-head">
                    <LeagueBadge slug={LEAGUE_BY_SLUG[slug] ? slug : undefined} src={list[0].league.logo} />
                    <div>
                      <h2 id={`lg-${slug}`}>{t(LEAGUE_BY_SLUG[slug]?.name ?? list[0].league.name)}</h2>
                      <div className="meta">
                        {LEAGUE_BY_SLUG[slug] ? `${t(LEAGUE_BY_SLUG[slug].region)} · ` : ""}
                        {tn(list.length, "{n} match", "{n} matches", { n: fmtNum(list.length) })}
                      </div>
                    </div>
                    <Link to={`/tables/${slug}`} className="link">
                      {t("Table")}
                      <IconChevronRight width={14} height={14} />
                    </Link>
                  </div>
                  <div className="match-grid">
                    {list.map((m, i) => (
                      <MatchCard key={m.id} m={m} index={i} vt={!yoursIds.has(m.id)} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {(articles.length > 0 || news.loading) && (
        <section className="section" aria-labelledby="top-stories">
          <div className="section-head">
            <h2 className="section-title" id="top-stories">
              {t("Top stories")}
            </h2>
            <Link to={`/news/${newsLeague}`} className="link">
              {t("See all")}
              <IconChevronRight width={14} height={14} />
            </Link>
          </div>
          {news.loading ? (
            <NewsRailSkeleton />
          ) : (
            <div className="rail">
              {articles.map((a, i) => (
                <NewsCard key={a.id} a={a} index={i} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DateStrip({
  day,
  today,
  onPick,
  matchDays,
}: {
  day: Date;
  today: Date;
  onPick: (d: Date) => void;
  matchDays: Set<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = isoDay(day);
  const todayKey = isoDay(today);
  const days = useMemo(() => {
    const base = startOfDay(day) < addDays(today, -10) || startOfDay(day) > addDays(today, 20) ? day : today;
    return Array.from({ length: 31 }, (_, i) => addDays(base, i - 10));
  }, [key, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = useRef(true);
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>(`[data-day="${key}"]`);
    if (!el || !strip) return;
    // Centre the chosen day by scrolling the strip only (scrollIntoView would also scroll the page).
    const a = el.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    strip.scrollBy({ left: a.left + a.width / 2 - (b.left + b.width / 2), behavior: first.current ? "auto" : "smooth" });
    first.current = false;
    // Keep keyboard focus on the selected day (roving tabindex).
    if (strip.contains(document.activeElement) && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [key]);

  return (
    <div className="datestrip" ref={ref} role="tablist" aria-label={t("Choose a day")}>
      {days.map((d) => {
        const k = isoDay(d);
        const has = matchDays.has(k);
        return (
          <button
            type="button"
            key={k}
            data-day={k}
            role="tab"
            aria-selected={k === key}
            tabIndex={k === key ? 0 : -1}
            className={`day${k === key ? " active" : ""}${k === todayKey ? " today" : ""}`}
            onClick={() => onPick(d)}
            title={fmtDayLong(d)}
            aria-label={`${fmtDayLong(d)}${has ? ` · ${t("Matches")}` : ""}`}
          >
            <span className="dow">{k === todayKey ? t("Today") : fmtDow(d)}</span>
            <span className="dom">{fmtNum(d.getDate())}</span>
            {has && <span className="dot" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
