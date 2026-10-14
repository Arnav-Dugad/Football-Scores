import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { t } from "../../i18n";
import type { SeasonData } from "../../lib/analytics";
import { fmtPct } from "../../lib/format";
import { useProjection } from "../../lib/season";
import { Segmented } from "../ui";
import type { GroupProjectionResult } from "./groupProjection.worker";
import type { LeagueGroup } from "./data";

/* ------------------------------------------------------ building badge -- */

/** Subtle "Building season data · 64%" pill with a progress ring. */
export function BuildingBadge({ progress, building }: { progress: number; building: boolean }) {
  if (!building) return null;
  const p = Math.max(0, Math.min(1, progress));
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span className="pill an-building" role="status" aria-live="polite">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r={r} className="track" />
        <circle cx="9" cy="9" r={r} className="fill" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - p) }} />
      </svg>
      {t("Building season data · {p}", { p: fmtPct(p) })}
    </span>
  );
}

/** Inline note inside a chart card while the season is still syncing. */
export function PartialNote({ building, progress }: { building: boolean; progress: number }) {
  if (!building) return null;
  return <p className="an-partial">{t("Season data is still syncing ({p}) — figures will fill in shortly.", { p: fmtPct(progress) })}</p>;
}

/* ---------------------------------------------------------- sub-nav ---- */

export interface NavItem<T extends string> {
  value: T;
  label: string;
}

/** Sticky frosted sub-navigation for the league hub (scrolls on small screens). */
export function LeagueNav<T extends string>({ items, value, onChange }: { items: NavItem<T>[]; value: T; onChange: (v: T) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: "-120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep the active item scrolled into view inside the strip.
  useEffect(() => {
    const btn = wrap.current?.querySelector<HTMLElement>(`[data-v="${CSS.escape(value)}"]`);
    if (!btn || !wrap.current) return;
    const strip = wrap.current;
    const left = btn.offsetLeft - strip.clientWidth / 2 + btn.offsetWidth / 2;
    strip.scrollTo({ left, behavior: "smooth" });
  }, [value]);

  return (
    <>
      <div ref={sentinel} aria-hidden className="an-nav-sentinel" />
      <nav className={`an-nav${stuck ? " stuck" : ""}`} aria-label={t("League hub sections")}>
        <div className="an-nav-inner glass-strong" ref={wrap}>
          {items.map((it) => (
            <button
              key={it.value}
              type="button"
              data-v={it.value}
              className={it.value === value ? "on" : ""}
              aria-current={it.value === value ? "page" : undefined}
              onClick={() => onChange(it.value)}
            >
              {it.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

/* -------------------------------------------------------- group picker -- */

export function GroupPicker({ groups, value, onChange }: { groups: LeagueGroup[]; value: number; onChange: (i: number) => void }) {
  if (groups.length < 2) return null;
  return (
    <div className="an-grouppick">
      <Segmented
        options={groups.map((g, i) => ({ value: String(i), label: shortGroup(g.name) || t("Group {n}", { n: i + 1 }) }))}
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
      />
    </div>
  );
}

/** "Eastern Conference" → "Eastern". */
export function shortGroup(name: string): string {
  return name.replace(/\s+(Conference|Group)$/i, "").trim();
}

/* --------------------------------------------------- section helpers ---- */

export function Hint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p className="an-hint" style={style}>
      {children}
    </p>
  );
}

/* --------------------------------------------------------- projection -- */

/**
 * Season projection: single-table competitions use the shared worker
 * (useProjection); multi-group leagues use the group-aware worker so
 * every club is ranked within its own conference.
 */
export function useLeagueProjection(season: SeasonData | undefined, groups: string[][], sims = 10_000) {
  const multi = groups.length > 1;
  const single = useProjection(multi ? undefined : season, sims);
  const [result, setResult] = useState<GroupProjectionResult | null>(null);
  const [running, setRunning] = useState(false);
  const gkey = groups.map((g) => g.join(",")).join("|");
  const key = useMemo(
    () => (season && multi ? `${season.league}|${season.matches.filter((m) => m.s === "post").length}|${season.matches.length}|${gkey}` : ""),
    [season, multi, gkey],
  );
  useEffect(() => {
    if (!key || !season) return;
    const worker = new Worker(new URL("./groupProjection.worker.ts", import.meta.url), { type: "module" });
    setRunning(true);
    worker.onmessage = (e: MessageEvent<GroupProjectionResult>) => {
      setResult(e.data);
      setRunning(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setRunning(false);
      worker.terminate();
    };
    worker.postMessage({ season, groups, sims });
    return () => worker.terminate();
  }, [key, sims]); // eslint-disable-line react-hooks/exhaustive-deps
  const singleResult = useMemo(
    () => (single.result ? { ...single.result, group: null as Record<string, number> | null } : null),
    [single.result],
  );
  if (!multi) return { result: singleResult, running: single.running || (!!season && !single.result) };
  return { result: result as (GroupProjectionResult & { group: Record<string, number> | null }) | null, running: running || (!!season && !result) };
}
