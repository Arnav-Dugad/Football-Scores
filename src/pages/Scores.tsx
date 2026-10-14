import { useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconCalendar, IconChevronRight } from "../components/Icons";
import { MatchHero } from "../components/hero";
import { MatchCard } from "../components/match";
import { NewsCard } from "../components/news";
import { Empty, ErrorState, LeagueBadge, Skeleton, SkeletonGrid } from "../components/ui";
import { endpoints, normaliseNews, type Match } from "../lib/api";
import {
  addDays,
  espnDatesFor,
  fmtDayLong,
  fmtDayShort,
  fmtDow,
  isoDay,
  parseIsoDay,
  relativeDayLabel,
  sameLocalDay,
  startOfDay,
} from "../lib/format";
import { useApi, useDocumentTitle, useStored } from "../lib/hooks";
import { LEAGUES, LEAGUE_BY_SLUG, leagueLogo, leagueOrder } from "../lib/leagues";

const ALL = LEAGUES.map((l) => l.slug);

export default function Scores() {
  useDocumentTitle("");
  const [params, setParams] = useSearchParams();
  const today = startOfDay(new Date());
  const day = parseIsoDay(params.get("d")) ?? today;
  const dayKey = isoDay(day);
  const isToday = dayKey === isoDay(today);
  const [filter, setFilter] = useStored<string>("pitch.filter", "all");

  const dates = useMemo(() => espnDatesFor(day), [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const scores = useApi<{ events: Match[] }>(endpoints.scores(dates, ALL), { refresh: isToday ? 30_000 : false });
  const calendar = useApi<{ days: Record<string, string[]> }>(endpoints.calendar(ALL));

  const all = useMemo(
    () =>
      (scores.data?.events ?? [])
        .filter((e) => sameLocalDay(e.date, day))
        .sort((a, b) => leagueOrder(a.league.slug) - leagueOrder(b.league.slug) || a.date.localeCompare(b.date)),
    [scores.data, dayKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const events = filter === "all" ? all : all.filter((e) => e.league.slug === filter);
  const live = events.filter((e) => e.state === "in");

  const featured = useMemo(() => {
    if (!events.length) return null;
    if (live.length) return live[0];
    if (isToday) {
      const next = events.find((e) => e.state === "pre");
      if (next) return next;
    }
    return events[0];
  }, [events, live, isToday]);

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
    const src = calendar.data?.days ?? {};
    for (const [slug, days] of Object.entries(src)) {
      if (filter !== "all" && slug !== filter) continue;
      days.forEach((d) => set.add(d));
    }
    return set;
  }, [calendar.data, filter]);

  const nextMatchDay = useMemo(() => {
    const sorted = [...matchDays].sort();
    return sorted.find((d) => d > dayKey) ?? null;
  }, [matchDays, dayKey]);

  const setDay = (d: Date) => {
    const k = isoDay(d);
    setParams(k === isoDay(today) ? {} : { d: k }, { replace: true });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of all) c[e.league.slug] = (c[e.league.slug] ?? 0) + 1;
    return c;
  }, [all]);

  const newsLeague = filter === "all" ? "eng.1" : filter;
  const news = useApi<any>(endpoints.news(newsLeague));
  const articles = useMemo(() => (news.data ? normaliseNews(news.data).filter((a) => a.image).slice(0, 8) : []), [news.data]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{isToday ? fmtDayLong(day) : relativeDayLabel(day) ?? (day < today ? "Results" : "Fixtures")}</p>
          <h1 className="large-title">{isToday ? "Scores" : fmtDayLong(day)}</h1>
        </div>
        {live.length > 0 && (
          <span className="pill live" style={{ marginBottom: 6 }}>
            <span className="pulse" />
            {live.length} live
          </span>
        )}
      </div>

      <DateStrip day={day} today={today} onPick={setDay} matchDays={matchDays} />

      <div className="chips" role="tablist" aria-label="Competitions" style={{ marginBottom: 18 }}>
        <button className={`chip text-only${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
          All competitions
        </button>
        {LEAGUES.map((l) => (
          <button
            key={l.slug}
            className={`chip${filter === l.slug ? " active" : ""}`}
            onClick={() => setFilter(l.slug)}
            aria-pressed={filter === l.slug}
          >
            <span className="chip-logo">
              <img src={leagueLogo(l.slug, false, 64)} alt="" loading="lazy" />
            </span>
            {l.short}
            {counts[l.slug] ? <span className="subtle num">{counts[l.slug]}</span> : null}
          </button>
        ))}
      </div>

      {scores.loading ? (
        <>
          <Skeleton h={300} r={32} style={{ marginBottom: 28 }} />
          <SkeletonGrid n={6} />
        </>
      ) : scores.error && !scores.data ? (
        <ErrorState onRetry={scores.reload} />
      ) : !events.length ? (
        <Empty
          icon={<IconCalendar />}
          title={`No matches ${isToday ? "today" : `on ${fmtDayShort(day)}`}`}
          action={
            nextMatchDay ? (
              <button className="btn" onClick={() => setDay(parseIsoDay(nextMatchDay)!)}>
                Next matchday · {fmtDayShort(parseIsoDay(nextMatchDay)!)}
                <IconChevronRight width={16} height={16} />
              </button>
            ) : undefined
          }
        >
          {filter === "all"
            ? "It’s a quiet day across the competitions we follow."
            : `${LEAGUE_BY_SLUG[filter]?.name ?? "This competition"} has no fixtures on this day.`}
        </Empty>
      ) : (
        <div className={scores.stale ? "refreshing" : ""}>
          {featured && <MatchHero m={featured} />}
          {groups.map(([slug, list]) => (
            <section className="league-group" key={slug}>
              <div className="league-head">
                <LeagueBadge slug={LEAGUE_BY_SLUG[slug] ? slug : undefined} src={list[0].league.logo} />
                <div>
                  <h2>{LEAGUE_BY_SLUG[slug]?.name ?? list[0].league.name}</h2>
                  <div className="meta">
                    {LEAGUE_BY_SLUG[slug]?.region} · {list.length} {list.length === 1 ? "match" : "matches"}
                  </div>
                </div>
                <Link to={`/tables/${slug}`} className="link">
                  Table
                  <IconChevronRight width={14} height={14} />
                </Link>
              </div>
              <div className="match-grid">
                {list.map((m, i) => (
                  <MatchCard key={m.id} m={m} index={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {articles.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Top stories</h2>
            <Link to={`/news/${newsLeague}`} className="link">
              See all
              <IconChevronRight width={14} height={14} />
            </Link>
          </div>
          <div className="rail">
            {articles.map((a, i) => (
              <NewsCard key={a.id} a={a} index={i} />
            ))}
          </div>
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
  const days = useMemo(() => {
    const base = startOfDay(day) < addDays(today, -10) || startOfDay(day) > addDays(today, 20) ? day : today;
    return Array.from({ length: 31 }, (_, i) => addDays(base, i - 10));
  }, [day, today]);
  const key = isoDay(day);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-day="${key}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [key]);

  return (
    <div className="datestrip" ref={ref} role="tablist" aria-label="Choose a day">
      {days.map((d) => {
        const k = isoDay(d);
        const rel = relativeDayLabel(d);
        return (
          <button
            key={k}
            data-day={k}
            role="tab"
            aria-selected={k === key}
            className={`day${k === key ? " active" : ""}${k === isoDay(today) ? " today" : ""}`}
            onClick={() => onPick(d)}
            title={fmtDayLong(d)}
          >
            <span className="dow">{rel === "Today" ? "Today" : fmtDow(d)}</span>
            <span className="dom">{d.getDate()}</span>
            {matchDays.has(k) && <span className="dot" />}
          </button>
        );
      })}
    </div>
  );
}
