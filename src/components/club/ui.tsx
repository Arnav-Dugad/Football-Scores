import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { fmtDayShort, fmtFull, fmtNum, fmtTime, relativeDayLabel } from "../../lib/format";
import { useCountUp } from "../../lib/motion";
import { haptic, isFollowing, toggleFollow, useSettings } from "../../lib/settings";
import { IconPin, IconStar, IconStarFill } from "../Icons";
import { Crest, Skeleton } from "../ui";
import { gameResult, opponentOf, useNow, type ClubGame } from "./data";

/* ---------------------------------------------------------------- tabs -- */

export function ClubTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idBase,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  idBase: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(value)}"]`);
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [value, tabs.length]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((x) => x.value === value);
    const rtl = document.documentElement.dir === "rtl";
    let next = -1;
    if (e.key === "ArrowRight") next = rtl ? i - 1 : i + 1;
    else if (e.key === "ArrowLeft") next = rtl ? i + 1 : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    next = (next + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(tabs[next].value)}"]`)?.focus());
  };

  return (
    <div className="cl-tabs glass" ref={wrap} role="tablist" aria-label={label} onKeyDown={onKey}>
      {thumb && <span className="cl-tabs-thumb" aria-hidden="true" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {tabs.map((x) => {
        const on = x.value === value;
        return (
          <button
            key={x.value}
            type="button"
            role="tab"
            id={`${idBase}-tab-${x.value}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel`}
            tabIndex={on ? 0 : -1}
            data-v={x.value}
            className={on ? "on" : ""}
            onClick={() => onChange(x.value)}
          >
            {x.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- follow -- */

export function FollowButton({ team }: { team: { id: string; league: string; name: string; logo: string; color: string | null } }) {
  useSettings(); // re-render when follows change elsewhere
  const on = isFollowing(team.id);
  const [burst, setBurst] = useState(0);
  return (
    <button
      type="button"
      className={`cl-follow${on ? " on" : ""}`}
      aria-pressed={on}
      onClick={() => {
        const now = toggleFollow({ id: team.id, league: team.league, name: team.name, logo: team.logo, color: team.color });
        haptic(now ? [10, 40, 16] : 8);
        if (now) setBurst((b) => b + 1);
      }}
    >
      <span className="cl-star" key={burst} aria-hidden="true">
        {on ? <IconStarFill /> : <IconStar />}
        {burst > 0 && on && (
          <span className="cl-burst">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--a": `${i * 45}deg` } as CSSProperties} />
            ))}
          </span>
        )}
      </span>
      <span>{on ? t("Following") : t("Follow")}</span>
    </button>
  );
}

/* --------------------------------------------------------------- tiles -- */

export function CountTile({
  label,
  value,
  decimals = 0,
  render,
  sub,
  delay = 0,
  tone,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  render?: (n: number) => ReactNode;
  sub?: ReactNode;
  delay?: number;
  tone?: "good" | "bad";
}) {
  const shown = useCountUp(value ?? 0, { decimals });
  return (
    <div className="tile glass cl-tile" style={{ animationDelay: `${delay}ms` }}>
      <div className="k">{label}</div>
      <div className={`v${tone ? ` ${tone}` : ""}`}>{value == null ? "–" : render ? render(shown) : fmtNum(shown, decimals)}</div>
      {sub != null && <div className="s">{sub}</div>}
    </div>
  );
}

/* ----------------------------------------------------------- countdown -- */

export function Countdown({ to, compact }: { to: string; compact?: boolean }) {
  const now = useNow(1000);
  const ms = Date.parse(to) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return <span className="pill">{t("Kick-off")}</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => fmtNum(n).padStart(2, fmtNum(0));
  const parts: [string, string][] = [
    ...(d > 0 ? ([[fmtNum(d), d === 1 ? t("day") : t("days")]] as [string, string][]) : []),
    [pad(h), t("hrs")],
    [pad(m), t("min")],
    ...(!compact || d === 0 ? ([[pad(sec), t("sec")]] as [string, string][]) : []),
  ];
  const label =
    d > 0
      ? t("Kick-off in {d} days, {h} hours and {m} minutes", { d, h, m })
      : t("Kick-off in {h} hours and {m} minutes", { h, m });
  return (
    <div className={`cl-countdown${compact ? " compact" : ""}`} role="timer" aria-label={label}>
      {parts.map(([v, u]) => (
        <span key={u} className="unit" aria-hidden="true">
          <b className="num">{v}</b>
          <small>{u}</small>
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- result -- */

export function resultWord(r: "W" | "D" | "L"): string {
  return r === "W" ? t("Win") : r === "D" ? t("Draw") : t("Loss");
}
export function resultLetter(r: "W" | "D" | "L"): string {
  return r === "W" ? t("form::W") : r === "D" ? t("form::D") : t("form::L");
}

export function ResultBadge({ r, size }: { r: "W" | "D" | "L"; size?: "sm" }) {
  return (
    <span className={`cl-res ${r}${size ? ` ${size}` : ""}`} title={resultWord(r)}>
      <span aria-hidden="true">{resultLetter(r)}</span>
      <span className="sr-only">{resultWord(r)}</span>
    </span>
  );
}

export function scoreLine(g: ClubGame): string {
  if (g.home.score == null || g.away.score == null) return "";
  return `${fmtNum(g.home.score)}–${fmtNum(g.away.score)}`;
}

/* ------------------------------------------------------------ game card -- */

export function GameCard({ g, teamId, kind }: { g: ClubGame; teamId: string; kind: "next" | "last" }) {
  const r = gameResult(g, teamId);
  const live = g.state === "in";
  const rel = relativeDayLabel(new Date(g.date));
  const side = (s: ClubGame["home"]) => (
    <div className={`cl-gc-team${s.id === teamId ? " us" : ""}`}>
      <Crest src={s.logo} size={52} alt={s.name} />
      <span>{s.short || s.name}</span>
    </div>
  );
  return (
    <Link to={`/match/${g.slug}/${g.id}`} className="cl-gamecard glass" aria-label={gameAria(g, teamId)}>
      <div className="cl-gc-top">
        <span className="eyebrow">{kind === "next" ? (live ? t("Live now") : t("Next match")) : t("Last result")}</span>
        <span className="subtle cl-gc-comp">{g.comp}</span>
      </div>
      <div className="cl-gc-body">
        {side(g.home)}
        <div className="cl-gc-mid">
          {g.state === "pre" ? (
            <>
              <b className="cl-gc-time">{fmtTime(g.date)}</b>
              <small className="muted">{rel ?? fmtDayShort(g.date)}</small>
            </>
          ) : (
            <>
              <b className="cl-gc-score num">{scoreLine(g) || "–"}</b>
              {live ? <span className="pill live">{t("Live")}</span> : r ? <ResultBadge r={r} /> : <small className="muted">{fmtDayShort(g.date)}</small>}
            </>
          )}
        </div>
        {side(g.away)}
      </div>
      <div className="cl-gc-foot">
        {g.venue && (
          <span className="muted cl-gc-venue">
            <IconPin width={14} height={14} />
            {g.venue}
          </span>
        )}
        {kind === "next" && g.state === "pre" ? <Countdown to={g.date} compact /> : <span className="subtle">{fmtDayShort(g.date)}</span>}
      </div>
    </Link>
  );
}

export function gameAria(g: ClubGame, teamId: string): string {
  const { side, home } = opponentOf(g, teamId);
  const r = gameResult(g, teamId);
  const where = home ? t("home") : t("away");
  const when = fmtFull(g.date);
  if (r) return t("{result} {score} against {team} ({where}), {when}", { result: resultWord(r), score: scoreLine(g), team: side.name, where, when });
  if (g.void) return t("{team} ({where}), {when}, postponed", { team: side.name, where, when });
  return t("{team} ({where}), {when}", { team: side.name, where, when });
}

/* ------------------------------------------------------ season building -- */

export function SeasonBuilding({ progress, building }: { progress: number; building: boolean }) {
  if (!building) return null;
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="cl-building" role="status">
      <span className="cl-building-dot" aria-hidden="true" />
      <span>{t("Syncing this season’s match data")}</span>
      <span
        className="cl-building-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t("Season data progress")}
      >
        <i style={{ width: `${Math.max(4, pct)}%` }} />
      </span>
      <span className="num subtle">{fmtNum(pct)}%</span>
    </div>
  );
}

/* ---------------------------------------------------------- skeletons -- */

export function SkelRows({ n = 5, h = 56 }: { n?: number; h?: number }) {
  return (
    <div className="list glass cl-skel-rows" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div className="row" key={i} style={{ minHeight: h }}>
          <Skeleton h={32} r={16} style={{ width: 32, flex: "none" }} />
          <div className="grow">
            <Skeleton h={12} r={6} style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            <Skeleton h={10} r={5} style={{ width: "35%", marginTop: 8 }} />
          </div>
          <Skeleton h={22} r={8} style={{ width: 44, flex: "none" }} />
        </div>
      ))}
    </div>
  );
}

export function SkelTiles({ n = 4 }: { n?: number }) {
  return (
    <div className="tiles" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div className="tile glass" key={i}>
          <Skeleton h={12} r={6} style={{ width: "50%" }} />
          <Skeleton h={34} r={10} style={{ width: "60%", marginTop: 12 }} />
          <Skeleton h={10} r={5} style={{ width: "70%", marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function SectionHead({ title, aside, id }: { title: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="section-head">
      <h2 className="section-title" id={id}>
        {title}
      </h2>
      {aside}
    </div>
  );
}

export function MiniEmpty({ children }: { children: ReactNode }) {
  return <p className="cl-mini-empty">{children}</p>;
}
