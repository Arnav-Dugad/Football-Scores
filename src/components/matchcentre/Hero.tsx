import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import type { Match, Side } from "../../lib/api";
import { fmtDayShort, fmtNum, fmtPct, fmtTime, relativeDayLabel, teamTint } from "../../lib/format";
import { useScoreFlash } from "../../lib/motion";
import { haptic, toggleFollow, useSettings } from "../../lib/settings";
import { IconCalendar, IconClock, IconPin, IconStar, IconStarFill } from "../Icons";
import { StatusBadge, scorersFor } from "../match";
import { Crest, FormDots, LeagueBadge } from "../ui";
import { useNow } from "./charts";
import { isVoid, liveProgress, type SideKey } from "./data";
import { stadiumTime, tempLabel, WeatherIcon, weatherLabel, type Weather } from "./venue";

export interface Probs {
  h: number;
  d: number;
  a: number;
  /** Display label: the bookmaker's name or "Pitch model". */
  source: string;
  kind: "odds" | "model";
}

/* ---------------------------------------------------------------- hero -- */

export function MatchCentreHero({
  m,
  heroRef,
  probs,
  weather,
  timezone,
  backdrop,
}: {
  m: Match;
  heroRef: React.RefObject<HTMLElement>;
  probs: Probs | null;
  weather: Weather | null;
  timezone: string | null;
  backdrop: string | null;
}) {
  const [settings] = useSettings();
  const hc = teamTint(m.home.color, "#0a84ff");
  const ac = teamTint(m.away.color, "#ff9f0a");
  const hs = scorersFor(m.details, m.home.id);
  const as = scorersFor(m.details, m.away.id);
  const live = m.state === "in";
  const flash = useScoreFlash(m.home.score, m.away.score);
  const [sweep, setSweep] = useState<{ side: SideKey; n: number } | null>(null);

  useEffect(() => {
    if (!flash) return;
    setSweep((s) => ({ side: flash, n: (s?.n ?? 0) + 1 }));
    const team = flash === "home" ? m.home : m.away;
    if (settings.teams.some((x) => x.id === team.id)) haptic([40, 60, 40, 60, 120]);
    const id = window.setTimeout(() => setSweep(null), 2400);
    return () => window.clearTimeout(id);
  }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps

  const stadium = m.state === "pre" ? stadiumTime(m.date, timezone) : null;
  const voided = isVoid(m);

  return (
    <section ref={heroRef} className={`hero glass mc-hero ${m.state}${backdrop && live ? " has-backdrop" : ""}`} aria-label={t("Match")}>
      {backdrop && live && (
        <div className="mc-backdrop" aria-hidden>
          <img src={backdrop} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        </div>
      )}
      <div
        className="hero-glow"
        aria-hidden
        style={{
          background: `radial-gradient(40% 50% at 18% 40%, ${hc}, transparent 70%), radial-gradient(40% 50% at 82% 40%, ${ac}, transparent 70%)`,
        }}
      />
      {sweep && (
        <div
          key={sweep.n}
          className={`mc-sweep ${sweep.side}`}
          aria-hidden
          style={{ "--sweep": sweep.side === "home" ? hc : ac } as CSSProperties}
        />
      )}

      <div className="hero-top">
        <Link to={`/tables/${m.league.slug}`} className="league mc-league">
          <LeagueBadge slug={m.league.slug} src={m.league.logo} size={26} />
          <span>{m.note || m.league.name}</span>
        </Link>
        <StatusBadge m={m} big />
      </div>

      <div className="hero-body">
        <TeamCol m={m} side={m.home} which="home" />
        <div className="hero-score mc-center">
          {m.state === "pre" || (voided && m.home.score == null) ? (
            <>
              <div className={`kick${voided ? " void" : ""}`}>{fmtTime(m.date)}</div>
              <div className="sub muted mc-day">{relativeDayLabel(new Date(m.date)) ?? fmtDayShort(m.date)}</div>
              {!voided && <Countdown iso={m.date} />}
            </>
          ) : (
            <>
              <div className="big" style={{ viewTransitionName: `vt-score-${m.id}` } as CSSProperties} aria-label={`${m.home.name} ${m.home.score ?? 0}, ${m.away.name} ${m.away.score ?? 0}`}>
                <span className={flash === "home" ? "goal-flash" : ""}>{m.home.score ?? 0}</span>
                <span className="sep">–</span>
                <span className={flash === "away" ? "goal-flash" : ""}>{m.away.score ?? 0}</span>
              </div>
              {m.home.shootout != null && m.away.shootout != null && (
                <div className="sub mc-pens">{t("Penalties {h}–{a}", { h: m.home.shootout, a: m.away.shootout })}</div>
              )}
              {live && <ProgressRing m={m} />}
            </>
          )}
        </div>
        <TeamCol m={m} side={m.away} which="away" />
      </div>

      {(hs.length > 0 || as.length > 0) && (
        <div className="hero-scorers mc-scorers">
          <ul aria-label={t("{team} scorers", { team: m.home.short })}>
            {hs.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <span className="mc-scorers-ball" aria-hidden />
          <ul aria-label={t("{team} scorers", { team: m.away.short })}>
            {as.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="hero-meta mc-meta">
        {m.venue && (
          <span>
            <IconPin />
            {m.venue}
            {m.city ? `, ${m.city}` : ""}
          </span>
        )}
        <span>
          <IconCalendar />
          {fmtDayShort(m.date)} · {fmtTime(m.date)}
        </span>
        {stadium && (
          <span title={t("Kick-off at the stadium")}>
            <IconClock />
            {t("{time} local", { time: stadium })}
          </span>
        )}
        {weather && m.state === "pre" && (
          <span className="mc-wx-chip" title={weatherLabel(weather.code)}>
            <WeatherIcon code={weather.code} day={weather.day} size={18} />
            {tempLabel(weather)}
            {weather.rain != null && weather.rain >= 20 ? ` · ${t("{n}% rain", { n: fmtNum(weather.rain) })}` : ""}
          </span>
        )}
      </div>

      {probs && m.state === "pre" && !voided && <HeroProbs m={m} p={probs} />}
    </section>
  );
}

/* -------------------------------------------------------- team column -- */

function TeamCol({ m, side, which }: { m: Match; side: Side; which: SideKey }) {
  const [settings] = useSettings();
  const following = settings.teams.some((x) => x.id === side.id);
  const [pop, setPop] = useState(0);
  return (
    <div className="hero-team mc-team">
      <Link to={`/team/${m.league.slug}/${side.id}`} className="mc-team-link">
        <span className="mc-crest" style={{ viewTransitionName: `vt-crest-${m.id}-${which}` } as CSSProperties}>
          <Crest src={side.logo} size={88} alt={side.name} style={{ width: "clamp(56px, 12vw, 96px)", height: "clamp(56px, 12vw, 96px)" }} />
        </span>
        <span className="name">{side.name}</span>
      </Link>
      {side.form ? (
        <span className="form">
          <FormDots form={side.form} />
        </span>
      ) : null}
      <button
        type="button"
        className={`mc-follow${following ? " on" : ""}${pop ? ` pop${pop % 2}` : ""}`}
        aria-pressed={following}
        aria-label={following ? t("Unfollow {team}", { team: side.name }) : t("Follow {team}", { team: side.name })}
        title={following ? t("Following") : t("Follow")}
        onClick={() => {
          const on = toggleFollow({ id: side.id, league: m.league.slug, name: side.name, logo: side.logo, color: side.color });
          if (on) {
            setPop((n) => n + 1);
            haptic(10);
          }
        }}
      >
        {following ? <IconStarFill /> : <IconStar />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------ progress ring -- */

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function ProgressRing({ m, size = 64 }: { m: Match; size?: number }) {
  const lp = liveProgress(m);
  const total = lp.segments.reduce((a, b) => a + b, 0);
  const gap = 0.16;
  const avail = Math.PI * 2 - gap * lp.segments.length;
  const r = size / 2 - 4;
  const c = size / 2;
  let a = gap / 2;
  let lastFilled = -1;
  lp.fill.forEach((x, i) => {
    if (x > 0) lastFilled = i;
  });
  const label = lp.label === "HT" ? t("HT") : lp.label === "PEN" ? t("Pens") : lp.label;
  const desc =
    lp.phase === "break"
      ? t("Break in play")
      : lp.phase === "shootout"
        ? t("Penalty shoot-out")
        : lp.added > 0
          ? t("{min}, {n} minutes of added time", { min: label, n: lp.added })
          : t("{min} played", { min: label });
  return (
    <div className={`mc-ring ${lp.phase}`} role="img" aria-label={desc}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        {lp.segments.map((len, i) => {
          const span = (len / total) * avail;
          const a0 = a;
          a += span + gap;
          const f = lp.fill[i];
          return (
            <g key={i}>
              <path d={arc(c, c, r, a0, a0 + span)} className="track" />
              {f > 0 && <path d={arc(c, c, r, a0, a0 + Math.max(0.02, span * f))} className="fill" />}
              {f >= 1 && lp.added > 0 && i === lastFilled && (
                <circle cx={c + r * Math.sin(a0 + span)} cy={c - r * Math.cos(a0 + span)} r={3.2} className="added" />
              )}
            </g>
          );
        })}
      </svg>
      <span className="mc-ring-label">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------- countdown -- */

function Countdown({ iso }: { iso: string }) {
  const target = Date.parse(iso);
  const near = Number.isFinite(target) && target - Date.now() < 40 * 86400e3;
  const now = useNow(1000, near);
  if (!near) return null;
  const diff = Math.max(0, target - now);
  if (diff <= 0) return <div className="mc-soon pill live">{t("Kick-off imminent")}</div>;
  const d = Math.floor(diff / 86400e3);
  const h = Math.floor((diff % 86400e3) / 3600e3);
  const mi = Math.floor((diff % 3600e3) / 60e3);
  const s = Math.floor((diff % 60e3) / 1000);
  const parts = [
    ...(d > 0 ? [{ v: d, l: t("days"), k: "d" }] : []),
    { v: h, l: t("hrs"), k: "h" },
    { v: mi, l: t("min"), k: "m" },
    { v: s, l: t("sec"), k: "s" },
  ];
  const spoken = t("Kick-off in {d} days, {h} hours and {m} minutes", { d, h, m: mi });
  return (
    <div className="mc-countdown" role="timer" aria-label={spoken}>
      {parts.map((p) => (
        <span key={p.k} className="mc-cd" aria-hidden>
          <b>{p.k === "d" ? fmtNum(p.v) : fmtNum(p.v).padStart(2, fmtNum(0))}</b>
          <small>{p.l}</small>
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------- compact win prob -- */

function HeroProbs({ m, p }: { m: Match; p: Probs }) {
  return (
    <div className="mc-hero-probs" role="img" aria-label={t("Win probability: {home} {h}, draw {d}, {away} {a}", { home: m.home.short, away: m.away.short, h: fmtPct(p.h), d: fmtPct(p.d), a: fmtPct(p.a) })}>
      <div className="mc-hp-labels" aria-hidden>
        <span>
          {m.home.abbr || m.home.short} <b>{fmtPct(p.h)}</b>
        </span>
        <span>
          {t("Draw")} <b>{fmtPct(p.d)}</b>
        </span>
        <span>
          {m.away.abbr || m.away.short} <b>{fmtPct(p.a)}</b>
        </span>
      </div>
      <div className="mc-prob-bar sm" aria-hidden>
        <i className="h" style={{ flexGrow: p.h }} />
        <i className="d" style={{ flexGrow: p.d }} />
        <i className="a" style={{ flexGrow: p.a }} />
      </div>
      <div className="mc-hp-src" aria-hidden>
        {p.source}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ floating chip -- */

export function LiveChip({ m, heroRef }: { m: Match; heroRef: React.RefObject<HTMLElement> }) {
  const [show, setShow] = useState(false);
  const seen = useRef(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) seen.current = true;
        setShow(!e.isIntersecting && seen.current && e.boundingClientRect.top < 0);
      },
      { rootMargin: "-80px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [heroRef, m.id]);
  const live = m.state === "in";
  const lp = live ? liveProgress(m) : null;
  const status = live
    ? lp!.label === "HT"
      ? t("HT")
      : lp!.label === "PEN"
        ? t("Pens")
        : lp!.label
    : m.state === "post"
      ? t("FT")
      : fmtTime(m.date);
  const score = m.state === "pre" ? null : `${m.home.score ?? 0}–${m.away.score ?? 0}`;
  // Portal: the animated page wrapper would otherwise become the containing block for `position: fixed`.
  return createPortal(
    <button
      type="button"
      className={`mc-chip glass-strong${show ? " show" : ""}${live ? " live" : ""}`}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      aria-label={t("Back to top: {home} {score} {away}, {status}", { home: m.home.name, away: m.away.name, score: score ?? t("v"), status })}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
    >
      <Crest src={m.home.logo} size={22} alt="" />
      <span className="mc-chip-score">{score ?? t("v")}</span>
      <Crest src={m.away.logo} size={22} alt="" />
      <span className="mc-chip-status">
        {live && <span className="pulse" />}
        {status}
      </span>
    </button>,
    document.body,
  );
}
