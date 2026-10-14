import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { t } from "../i18n";
import { darkVariant, sized } from "../lib/api";
import { fmtDayShort, fmtTime, initials, relativeDayLabel } from "../lib/format";
import { useApi } from "../lib/hooks";
import { LEAGUE_BY_SLUG, leagueLogo } from "../lib/leagues";

/* Embeddable widget (/widget) — no app chrome, transparent page, one glass card.
   Query: team & league | leagues=a,b · theme=light|dark|auto · accent=hex */

interface WSide {
  id: string;
  name: string;
  short: string;
  abbr: string;
  logo: string;
  color: string | null;
  score: number | null;
  pens: number | null;
}
interface WMatch {
  id: string;
  league: { slug: string; name: string; logo: string };
  date: string;
  state: "pre" | "in" | "post";
  status: string;
  clock: string;
  off: boolean;
  home: WSide;
  away: WSide;
  url: string;
}
interface WTeam {
  id: string;
  league: string;
  name: string;
  short: string;
  logo: string;
  color: string | null;
  url: string;
}
type Feed =
  | { mode: "team"; team: WTeam | null; live: WMatch | null; next: WMatch | null; last: WMatch | null; updated: string }
  | { mode: "leagues"; leagues: string[]; matches: WMatch[]; live: number; updated: string };

const abs = (path: string) => `${location.origin}${path}`;

/* The widget's theme comes from its URL, not the app preference (which it must
   never overwrite), so crests pick light/dark artwork from this context. */
const DarkContext = createContext(false);

const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function useSystemDark() {
  return useSyncExternalStore(
    (cb) => {
      darkQuery?.addEventListener("change", cb);
      return () => darkQuery?.removeEventListener("change", cb);
    },
    () => !!darkQuery?.matches,
    () => false,
  );
}

function Crest({ src, size, alt }: { src: string; size: number; alt: string }) {
  const dark = useContext(DarkContext);
  const px = Math.min(240, Math.round(size * 2.2));
  const list = useMemo(() => {
    if (!src) return [];
    const d = dark ? darkVariant(src) : null;
    return [...(d ? [sized(d, px)] : []), sized(src, px)];
  }, [src, dark, px]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [list]);
  if (i >= list.length)
    return (
      <span className="wg-crest-fallback" style={{ width: size, height: size, fontSize: size * 0.34 }} role="img" aria-label={alt}>
        {initials(alt || "?")}
      </span>
    );
  return <img className="wg-crest" src={list[i]} width={size} height={size} alt={alt} loading="lazy" decoding="async" onError={() => setI((n) => n + 1)} />;
}

function ext(path: string, children: ReactNode, className?: string, label?: string) {
  return (
    <a className={className} href={abs(path)} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {children}
    </a>
  );
}

function liveLabel(m: WMatch): string {
  if (/half/i.test(m.status) || m.status === "HT") return t("HT");
  return m.clock && m.clock !== "0'" ? m.clock : t("Live");
}

function when(m: WMatch): string {
  const d = new Date(m.date);
  const rel = relativeDayLabel(d);
  return `${rel ?? fmtDayShort(d)} · ${fmtTime(d)}`;
}

function StatusLine({ m }: { m: WMatch }) {
  if (m.off) return <span className="wg-status">{m.status || t("Postponed")}</span>;
  if (m.state === "in")
    return (
      <span className="wg-status live">
        <span className="pulse" aria-hidden />
        {liveLabel(m)}
      </span>
    );
  if (m.state === "post") return <span className="wg-status">{t("Full time")}</span>;
  return <span className="wg-status">{relativeDayLabel(new Date(m.date)) ?? fmtDayShort(m.date)}</span>;
}

/* ----------------------------------------------------------- team mode -- */

function MatchHero({ m }: { m: WMatch }) {
  const scored = m.state !== "pre" && m.home.score !== null && m.away.score !== null;
  const side = (s: WSide) => (
    <div className="wg-side">
      <Crest src={s.logo} size={44} alt={s.name} />
      <span className="wg-side-name">{s.short || s.name}</span>
    </div>
  );
  return ext(
    m.url,
    <>
      {side(m.home)}
      <div className="wg-mid">
        {scored ? (
          <span className="wg-score">
            {m.home.score}
            <span className="wg-dash">–</span>
            {m.away.score}
          </span>
        ) : (
          <span className="wg-time">{m.off ? "–" : fmtTime(m.date)}</span>
        )}
        {m.home.pens !== null && m.away.pens !== null && m.state !== "pre" && (
          <span className="wg-pens">{t("{h}–{a} on penalties", { h: m.home.pens, a: m.away.pens })}</span>
        )}
        <StatusLine m={m} />
      </div>
      {side(m.away)}
    </>,
    `wg-hero${m.state === "in" ? " is-live" : ""}`,
    `${m.home.name} ${m.home.score ?? ""}–${m.away.score ?? ""} ${m.away.name}`,
  );
}

function resultFor(m: WMatch, teamId: string): "W" | "D" | "L" | null {
  if (m.home.score === null || m.away.score === null) return null;
  const mine = m.home.id === teamId ? m.home : m.away;
  const theirs = m.home.id === teamId ? m.away : m.home;
  const a = mine.score! + (mine.pens ?? 0) / 100;
  const b = theirs.score! + (theirs.pens ?? 0) / 100;
  return a > b ? "W" : a < b ? "L" : "D";
}

function SubRow({ label, m, teamId }: { label: string; m: WMatch; teamId: string }) {
  const opp = m.home.id === teamId ? m.away : m.home;
  const home = m.home.id === teamId;
  const r = m.state === "post" ? resultFor(m, teamId) : null;
  return ext(
    m.url,
    <>
      <span className="wg-sub-label">{label}</span>
      <span className="wg-sub-opp">
        <span className="wg-sub-ha">{home ? t("vs") : t("at")}</span>
        <Crest src={opp.logo} size={18} alt="" />
        <span className="wg-ellipsis">{opp.short || opp.name}</span>
      </span>
      <span className="wg-sub-meta num">
        {r ? (
          <>
            <span className={`form-dot ${r}`}>{t(r)}</span>
            {m.home.score}–{m.away.score}
          </>
        ) : (
          when(m)
        )}
      </span>
    </>,
    "wg-sub",
  );
}

function TeamWidget({ feed }: { feed: Extract<Feed, { mode: "team" }> }) {
  const { team, live, next, last } = feed;
  if (!team) return <WidgetEmpty title={t("Club not found")} body={t("Check the team and league in the widget address.")} />;
  const recent = last && Date.now() - Date.parse(last.date) < 8 * 3600e3;
  const primary = live ?? (recent ? last : next ?? last);
  const secondary = primary === next ? last : primary === last ? next : next;
  return (
    <>
      <header className="wg-head">
        {ext(
          team.url,
          <>
            <Crest src={team.logo} size={28} alt="" />
            <span className="wg-title wg-ellipsis">{team.name}</span>
          </>,
          "wg-team",
        )}
        {primary && <LeagueTag slug={primary.league.slug} />}
      </header>
      {primary ? <MatchHero m={primary} /> : <p className="wg-note">{t("No fixtures scheduled")}</p>}
      {secondary && secondary !== primary && (
        <SubRow label={secondary === next ? t("Next") : t("Last")} m={secondary} teamId={team.id} />
      )}
    </>
  );
}

function LeagueTag({ slug }: { slug: string }) {
  const l = LEAGUE_BY_SLUG[slug];
  return (
    <span className="wg-league">
      <span className="wg-league-logo">
        <img src={leagueLogo(slug, false, 48)} alt="" loading="lazy" />
      </span>
      <span className="wg-ellipsis">{l ? t(l.short) : slug}</span>
    </span>
  );
}

/* -------------------------------------------------------- leagues mode -- */

function Row({ m }: { m: WMatch }) {
  const scored = m.state !== "pre" && m.home.score !== null;
  const lead = (a: number | null, b: number | null) => (m.state === "post" && a !== null && b !== null && a < b ? " dim" : "");
  return ext(
    m.url,
    <>
      <span className={`wg-row-status num${m.state === "in" ? " live" : ""}`}>
        {m.state === "in" ? liveLabel(m) : m.state === "post" ? t("FT") : m.off ? t("PPD") : fmtTime(m.date)}
      </span>
      <span className="wg-row-teams">
        <span className={`wg-row-team${lead(m.home.score, m.away.score)}`}>
          <Crest src={m.home.logo} size={20} alt="" />
          <span className="wg-ellipsis">{m.home.short || m.home.name}</span>
          {scored && <b className="num">{m.home.score}</b>}
        </span>
        <span className={`wg-row-team${lead(m.away.score, m.home.score)}`}>
          <Crest src={m.away.logo} size={20} alt="" />
          <span className="wg-ellipsis">{m.away.short || m.away.name}</span>
          {scored && <b className="num">{m.away.score}</b>}
        </span>
      </span>
      <span className="wg-row-league" title={m.league.name}>
        <img src={leagueLogo(m.league.slug, false, 48)} alt="" loading="lazy" />
      </span>
    </>,
    `wg-row${m.state === "in" ? " is-live" : ""}`,
    `${m.home.name} ${m.home.score ?? ""}–${m.away.score ?? ""} ${m.away.name}`,
  );
}

function LeaguesWidget({ feed }: { feed: Extract<Feed, { mode: "leagues" }> }) {
  const single = feed.leagues.length === 1 ? feed.leagues[0] : null;
  return (
    <>
      <header className="wg-head">
        <span className="wg-title">{single ? t(LEAGUE_BY_SLUG[single]?.short ?? single) : t("Today")}</span>
        {feed.live > 0 ? (
          <span className="pill live">
            <span className="pulse" aria-hidden />
            {t("{n} live", { n: feed.live })}
          </span>
        ) : (
          single && <LeagueTag slug={single} />
        )}
      </header>
      {feed.matches.length ? (
        <div className="wg-list">{feed.matches.slice(0, 12).map((m) => <Row key={m.id} m={m} />)}</div>
      ) : (
        <p className="wg-note">{t("No matches today. Check back on match day.")}</p>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- page -- */

function WidgetEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="wg-empty">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export default function Widget() {
  const [params] = useSearchParams();
  const team = params.get("team");
  const league = params.get("league");
  const leagues = params.get("leagues");
  const theme = params.get("theme");
  const accentRaw = (params.get("accent") ?? "").replace(/^#/, "");
  const accent = /^[0-9a-f]{6}$/i.test(accentRaw) ? `#${accentRaw}` : null;

  const path = useMemo(() => {
    const q = new URLSearchParams();
    if (team && /^\d{1,12}$/.test(team)) {
      q.set("team", team);
      if (league) q.set("league", league);
    } else if (leagues || league) {
      q.set("leagues", (leagues ?? league)!);
    }
    const s = q.toString();
    return `/api/widget${s ? `?${s}` : ""}`;
  }, [team, league, leagues]);

  const { data, error, loading, stale } = useApi<Feed>(path, { refresh: 30_000 });

  // Transparent page and an explicit theme for embedding (never persisted).
  useLayoutEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    root.classList.add("widget-mode");
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else if (theme === "auto") root.removeAttribute("data-theme");
    document.title = "Pitch";
    return () => {
      root.classList.remove("widget-mode");
      if (prev) root.setAttribute("data-theme", prev);
      else root.removeAttribute("data-theme");
    };
  }, [theme]);

  // Let the host page size the iframe to the card.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(() => {
      window.parent.postMessage({ type: "pitch:widget:height", height: Math.ceil(el.getBoundingClientRect().height) + 16 }, "*");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const style = accent ? ({ "--accent": accent, "--accent-ink": accent } as CSSProperties) : undefined;
  const systemDark = useSystemDark();
  // theme=light|dark forces; otherwise follow the device (auto) or the visitor's saved Pitch theme.
  const saved = theme === "auto" ? null : document.documentElement.getAttribute("data-theme");
  const dark = theme === "dark" || theme === "light" ? theme === "dark" : saved ? saved === "dark" : systemDark;

  return (
    <DarkContext.Provider value={dark}>
      <div className="wg-page" style={style}>
      <div ref={ref} className={`wg glass${stale ? " is-stale" : ""}`}>
        {loading && (
          <div className="wg-loading" aria-busy="true" aria-label={t("Loading")}>
            <div className="skel" style={{ height: 28, width: "55%" }} />
            <div className="skel" style={{ height: 96 }} />
          </div>
        )}
        {!loading && error && !data && <WidgetEmpty title={t("Couldn’t load scores")} body={t("We’ll try again in a moment.")} />}
        {data?.mode === "team" && <TeamWidget feed={data} />}
        {data?.mode === "leagues" && <LeaguesWidget feed={data} />}
        <footer className="wg-foot">
          {ext(
            "/",
            <>
              <img src="/icons/icon-192.png" alt="" width={18} height={18} />
              <span>Pitch</span>
            </>,
            "wg-brand",
          )}
          {ext(
            data?.mode === "team" && data.team ? data.team.url : "/",
            <>
              {t("Open Pitch")}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6h9v9M18 6 7 17" />
              </svg>
            </>,
            "wg-open",
          )}
        </footer>
      </div>
      </div>
    </DarkContext.Provider>
  );
}
