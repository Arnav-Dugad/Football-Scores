import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { matchHref } from "../components/match";
import { Crest } from "../components/ui";
import { t, tn } from "../i18n";
import { endpoints, type Match } from "../lib/api";
import { useApi } from "../lib/hooks";
import { leagueOrder } from "../lib/leagues";
import { useLiveStatus } from "../lib/live";
import { prefersReducedMotion } from "../lib/motion";

/* -------------------------------------------------------- live data ----- */

/** Today's matches across leagues; live patches are merged by lib/live. */
export function useSnapshot(refresh = false) {
  return useApi<{ events: Match[] }>(endpoints.snapshot(), { refresh: refresh ? 60_000 : false });
}

export function useLiveMatches(): Match[] {
  const q = useSnapshot();
  return useMemo(
    () =>
      (q.data?.events ?? [])
        .filter((e) => e.state === "in")
        .sort((a, b) => leagueOrder(a.league.slug) - leagueOrder(b.league.slug) || a.date.localeCompare(b.date)),
    [q.data],
  );
}

function minuteLabel(m: Match): string {
  if (m.statusName === "STATUS_HALFTIME" || /^HT$/i.test(m.status)) return t("HT");
  return m.clock || m.status;
}

/* ------------------------------------------------------------ ticker ---- */

const SPEED = 38; // px per second

export function LiveTicker() {
  const { pathname } = useLocation();
  const live = useLiveMatches();
  const hidden = pathname.startsWith("/match") || live.length === 0;

  useEffect(() => {
    if (hidden) return;
    const root = document.documentElement;
    root.dataset.ticker = "on";
    return () => {
      delete root.dataset.ticker;
    };
  }, [hidden]);

  if (hidden) return null;
  return <Ticker live={live} />;
}

function Ticker({ live }: { live: Match[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [dur, setDur] = useState(30);
  const [touching, setTouching] = useState(false);
  const [tucked, setTucked] = useState(false);
  const reduce = prefersReducedMotion();
  const touchTimer = useRef<number | undefined>(undefined);

  // Marquee only when the items don't fit.
  useLayoutEffect(() => {
    const v = viewport.current;
    const tr = track.current;
    if (!v || !tr) return;
    const measure = () => {
      const set = tr.querySelector<HTMLElement>(".ix-tick-set");
      const w = set?.offsetWidth ?? 0;
      setOverflow(w > v.clientWidth + 1);
      setDur(Math.max(12, w / SPEED));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    const set = tr.querySelector(".ix-tick-set");
    if (set) ro.observe(set);
    return () => ro.disconnect();
  }, [live]);

  // Tuck the bar behind the nav while scrolling down; bring it back on the way up.
  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (y < 80) setTucked(false);
        else if (y > last + 8) setTucked(true);
        else if (y < last - 8) setTucked(false);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(touchTimer.current), []);

  const animate = overflow && !reduce;

  return (
    <div
      className={`ix-ticker glass-strong${tucked ? " tucked" : ""}${touching ? " touching" : ""}${animate ? " marquee" : ""}`}
      role="region"
      aria-label={t("Live matches")}
      onTouchStart={() => {
        window.clearTimeout(touchTimer.current);
        setTouching(true);
      }}
      onTouchEnd={() => {
        touchTimer.current = window.setTimeout(() => setTouching(false), 2500);
      }}
      onFocus={() => setTucked(false)}
    >
      <span className="ix-ticker-label">
        <span className="pulse" aria-hidden />
        <span>{t("Live")}</span>
        <span className="sr-only">{tn(live.length, "{n} match in progress", "{n} matches in progress")}</span>
      </span>
      <div className={`ix-ticker-viewport${overflow && reduce ? " scroll" : ""}`} ref={viewport}>
        <div className="ix-ticker-track" ref={track} style={{ ["--dur" as string]: `${dur}s` }}>
          <TickSet live={live} />
          {animate && <TickSet live={live} clone />}
        </div>
      </div>
    </div>
  );
}

function TickSet({ live, clone }: { live: Match[]; clone?: boolean }) {
  return (
    <ul className="ix-tick-set" aria-hidden={clone || undefined}>
      {live.map((m) => (
        <li key={m.id}>
          <Link
            to={matchHref(m)}
            className="ix-tick"
            tabIndex={clone ? -1 : undefined}
            aria-label={t("{home} {hs}, {away} {as} · {minute}", {
              home: m.home.name,
              hs: m.home.score ?? 0,
              away: m.away.name,
              as: m.away.score ?? 0,
              minute: minuteLabel(m),
            })}
          >
            <Crest src={m.home.logo} size={18} alt="" />
            <span className="abbr">{m.home.abbr || m.home.short}</span>
            <b className="num">
              {m.home.score ?? 0}–{m.away.score ?? 0}
            </b>
            <span className="abbr">{m.away.abbr || m.away.short}</span>
            <Crest src={m.away.logo} size={18} alt="" />
            <bdi className="min num" dir="ltr">
              {minuteLabel(m)}
            </bdi>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------- connection dot ------ */

/** Pulsing dot on the Scores tab while the live socket is open and matches are live. */
export function LiveDot() {
  const status = useLiveStatus();
  const live = useLiveMatches();
  if (status !== "open" || live.length === 0) return null;
  return (
    <span className="ix-live-dot" title={t("Live updates on")}>
      <span className="sr-only">{t("Live updates on")}</span>
    </span>
  );
}
