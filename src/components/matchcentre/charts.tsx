import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../i18n";
import { useSettings } from "../../lib/settings";
import type { SideKey } from "./data";

/* Shared chart primitives for the match centre: tooltip, legend, data table
   disclosure, pattern fills and a couple of small hooks. */

/* -------------------------------------------------------------- hooks --- */

export function useMedia(query: string): boolean {
  const get = () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
  const [v, setV] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return v;
}

/** Ticking clock (ms) while `enabled`. */
export function useNow(every = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(id);
  }, [every, enabled]);
  return now;
}

/** Width of an element, tracked with ResizeObserver. */
export function useWidth<T extends HTMLElement>(): [React.MutableRefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  const observed = useRef<T | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  // Re-attach whenever the element behind the ref changes (conditional renders).
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === observed.current) return;
    ro.current?.disconnect();
    observed.current = el;
    if (!el) return;
    setW(el.clientWidth);
    if (!("ResizeObserver" in window)) return;
    ro.current = new ResizeObserver(() => setW(el.clientWidth));
    ro.current.observe(el);
  });
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, w];
}

export function usePatterns(): boolean {
  const [s] = useSettings();
  return s.patterns;
}

/**
 * Roving keyboard focus over `count` marks inside one focusable element:
 * arrows step, Home/End jump, Escape clears.
 */
export function useRoving(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!count) return;
    const rtl = document.documentElement.dir === "rtl";
    let next = active;
    const fwd = (e.key === "ArrowRight" && !rtl) || (e.key === "ArrowLeft" && rtl) || e.key === "ArrowDown";
    const back = (e.key === "ArrowLeft" && !rtl) || (e.key === "ArrowRight" && rtl) || e.key === "ArrowUp";
    if (fwd) next = active === null ? 0 : Math.min(count - 1, active + 1);
    else if (back) next = active === null ? count - 1 : Math.max(0, active - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };
  return { active, setActive, onKeyDown, onBlur: () => setActive(null) };
}

/* ------------------------------------------------------------ tooltip --- */

/** Glass tooltip positioned in container pixels; flips below near the top. */
export function ChartTip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const half = 100;
  const left = width > 2 * half ? Math.max(half, Math.min(width - half, x)) : width / 2;
  const below = y < 96;
  return (
    <div className={`tooltip glass-strong mc-tip${below ? " below" : ""}`} style={{ left, top: y }} role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function TipRow({ k, v, swatch }: { k: ReactNode; v: ReactNode; swatch?: ReactNode }) {
  return (
    <div className="tt-row">
      <span className="mc-tip-k">
        {swatch}
        {k}
      </span>
      <b>{v}</b>
    </div>
  );
}

/* -------------------------------------------------------------- legend -- */

export type SwatchShape = "rect" | "line" | "dot" | "ring" | "hollow" | "cross" | "goal";

export function Swatch({ side, shape = "rect", neutral }: { side?: SideKey; shape?: SwatchShape; neutral?: boolean }) {
  const color = neutral ? "var(--ink-3)" : side === "away" ? "var(--series-2)" : "var(--series-1)";
  if (shape === "rect") return <span className={`mc-sw rect ${side ?? ""}`} style={{ background: color }} aria-hidden />;
  if (shape === "line") return <span className="mc-sw line" style={{ background: color }} aria-hidden />;
  return (
    <svg className="mc-sw shape" viewBox="0 0 16 16" aria-hidden>
      <ShotGlyph shape={shape} cx={8} cy={8} r={5} color={color} />
    </svg>
  );
}

export function ShotGlyph({ shape, cx, cy, r, color, fill }: { shape: SwatchShape; cx: number; cy: number; r: number; color: string; fill?: string }) {
  switch (shape) {
    case "goal":
      return (
        <g>
          <circle cx={cx} cy={cy} r={r + 2.6} fill="none" stroke={color} strokeWidth={1.4} />
          <circle cx={cx} cy={cy} r={r} style={{ fill: fill ?? color }} stroke="var(--mc-surface)" strokeWidth={1.4} />
        </g>
      );
    case "dot":
      return <circle cx={cx} cy={cy} r={r} style={{ fill: fill ?? color }} stroke="var(--mc-surface)" strokeWidth={1.4} />;
    case "hollow":
    case "ring":
      return <circle cx={cx} cy={cy} r={r} fill="var(--mc-surface-soft)" stroke={color} strokeWidth={2} />;
    case "cross": {
      const d = Math.max(3, r * 0.8);
      return (
        <g stroke={color} strokeWidth={2.2} strokeLinecap="round">
          <path d={`M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx + d} ${cy - d}L${cx - d} ${cy + d}`} />
        </g>
      );
    }
    default:
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={2} fill={color} />;
  }
}

export function Legend({ items }: { items: { key: string; label: ReactNode; swatch: ReactNode }[] }) {
  return (
    <ul className="mc-legend">
      {items.map((i) => (
        <li key={i.key}>
          {i.swatch}
          <span>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------- patterns --- */

/** Tone-on-tone 45°/135° hatches, used when "Chart patterns" is on. */
export function PatternDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-home`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
        <rect width="5" height="5" style={{ fill: "var(--series-1)" }} />
        <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "color-mix(in srgb, var(--series-1) 45%, black)" }} strokeWidth="1.6" />
      </pattern>
      <pattern id={`${id}-away`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(135)">
        <rect width="5" height="5" style={{ fill: "var(--series-2)" }} />
        <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "color-mix(in srgb, var(--series-2) 45%, black)" }} strokeWidth="1.6" />
      </pattern>
    </defs>
  );
}

export const seriesVar = (side: SideKey) => (side === "home" ? "var(--series-1)" : "var(--series-2)");
export const seriesFill = (side: SideKey, patterns: boolean, id: string) => (patterns ? `url(#${id}-${side})` : seriesVar(side));

/* ---------------------------------------------------------- data table -- */

export function ShowData({ caption, head, rows }: { caption: string; head: ReactNode[]; rows: ReactNode[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mc-data" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{open ? t("Hide data") : t("Show data")}</summary>
      <div className="mc-data-scroll">
        <table className="mini-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ----------------------------------------------------------- pitch ------ */

/** Pitch markings in metres (105 × 68), horizontal; caller rotates for portrait. */
export function PitchLines({ vertical }: { vertical?: boolean }) {
  const L = 105;
  const W = 68;
  const g = (
    <g className="mc-pitch-lines" fill="none">
      <rect x="0" y="0" width={L} height={W} rx="1.2" />
      <line x1={L / 2} y1="0" x2={L / 2} y2={W} />
      <circle cx={L / 2} cy={W / 2} r="9.15" />
      <circle cx={L / 2} cy={W / 2} r="0.5" className="spot" />
      <rect x="0" y={W / 2 - 20.16} width="16.5" height="40.32" />
      <rect x="0" y={W / 2 - 9.16} width="5.5" height="18.32" />
      <rect x={L - 16.5} y={W / 2 - 20.16} width="16.5" height="40.32" />
      <rect x={L - 5.5} y={W / 2 - 9.16} width="5.5" height="18.32" />
      <circle cx="11" cy={W / 2} r="0.5" className="spot" />
      <circle cx={L - 11} cy={W / 2} r="0.5" className="spot" />
      <path d={`M16.5 ${W / 2 - 7.3}A9.15 9.15 0 0 1 16.5 ${W / 2 + 7.3}`} />
      <path d={`M${L - 16.5} ${W / 2 - 7.3}A9.15 9.15 0 0 0 ${L - 16.5} ${W / 2 + 7.3}`} />
      <rect x="-1.6" y={W / 2 - 3.66} width="1.6" height="7.32" className="goal" />
      <rect x={L} y={W / 2 - 3.66} width="1.6" height="7.32" className="goal" />
    </g>
  );
  return vertical ? <g transform={`translate(${W} 0) rotate(90)`}>{g}</g> : g;
}

/**
 * Project a play location (x 0–100 towards the attacked goal; y < 50 is the
 * attacker's right) to pitch metres for a team attacking right (or up when
 * `vertical`). `flip` mirrors it for the team attacking the other way.
 */
export function project(x: number, y: number, opts: { vertical: boolean; flip: boolean }): [number, number] {
  const L = 105;
  const W = 68;
  if (!opts.vertical) {
    // Facing right, your right hand is down the screen.
    const px = (x / 100) * L;
    const py = ((100 - y) / 100) * W;
    return opts.flip ? [L - px, W - py] : [px, py];
  }
  // Facing up, your right hand is to the right.
  const sx = ((100 - y) / 100) * W;
  const sy = L - (x / 100) * L;
  return opts.flip ? [W - sx, L - sy] : [sx, sy];
}
