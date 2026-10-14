import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { t } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { IconChart, IconTable2 } from "./icons";

/* Chart chrome shared by the player charts: a titled card with a
   chart ⇄ data-table toggle, a tooltip, measured width, texture patterns. */

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className = "",
  style,
  id,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const hid = useId();
  return (
    <figure className={`glass pl-card pl-chart ${className}`} style={style} aria-labelledby={hid} id={id}>
      <header className="pl-card-head">
        <div className="pl-card-titles">
          <h2 className="panel-title" id={hid}>
            {title}
          </h2>
          {subtitle && <p className="pl-card-sub">{subtitle}</p>}
        </div>
        {table && (
          <button type="button" className="pl-toggle" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? <IconChart /> : <IconTable2 />}
            <span>{showTable ? t("Show chart") : t("Show data")}</span>
          </button>
        )}
      </header>
      {legend && !showTable && <div className="pl-legend">{legend}</div>}
      {showTable ? <div className="pl-table-wrap">{table}</div> : children}
    </figure>
  );
}

/** Tooltip anchored at a % position inside a `.chart` box; flips at the edges. */
export function ChartTip({ x, y, children, below }: { x: number; y: number; children: ReactNode; below?: boolean }) {
  const edge = x < 22 ? " at-start" : x > 78 ? " at-end" : "";
  return (
    <div className={`tooltip glass-strong pl-tip${edge}${below ? " below" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} role="status">
      {children}
    </div>
  );
}

/** A tooltip row: value first (strong), label after, keyed by a short line in the series colour. */
export function TipRow({ label, value, color }: { label: ReactNode; value: ReactNode; color?: string }) {
  return (
    <div className="tt-row">
      <span className="pl-tt-label">
        {color && <i className="pl-linekey" style={{ background: color }} />}
        {label}
      </span>
      <b>{value}</b>
    </div>
  );
}

/** Content-box width of an element, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback = 560) {
  const [w, setW] = useState(fallback);
  const ro = useRef<ResizeObserver | null>(null);
  // Callback ref, so it also works when the element mounts after the first render.
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const read = () => {
      const cw = Math.round(el.clientWidth);
      if (cw > 0) setW(Math.max(200, cw));
    };
    read();
    if (!("ResizeObserver" in window)) return;
    ro.current = new ResizeObserver(read);
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, w] as const;
}

/** True when the viewer turned on chart textures (Settings → Chart patterns). */
export function usePatterns(): boolean {
  const [s] = useSettings();
  return s.patterns;
}

/** 45° / 135° hatch fills for the two series; ids are scoped per chart. */
export function PatternDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-h1`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="var(--series-1)" fillOpacity="0.16" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="var(--series-1)" strokeWidth="2.2" />
      </pattern>
      <pattern id={`${prefix}-h2`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
        <rect width="7" height="7" fill="var(--series-2)" fillOpacity="0.16" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="var(--series-2)" strokeWidth="2.2" />
      </pattern>
    </defs>
  );
}

/** Clean integer ticks from 0 to at least `max`. */
export function intTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max));
  const step = top <= 4 ? 1 : top <= 8 ? 2 : Math.ceil(top / 4);
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  if (out[out.length - 1] < top) out.push(out[out.length - 1] + step);
  return out;
}
