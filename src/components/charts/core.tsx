import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { t } from "../../i18n";
import { fmtNum } from "../../lib/format";
import { useDrawIn } from "../../lib/motion";
import { Crest } from "../ui";

/* ==========================================================================
   Chart core — shared frame, legend, tooltip, data-table twin and palette
   helpers for every Pitch analytics chart.

   Colour roles (tokens live in src/styles/analytics.css, light + dark):
     --an-c1 … --an-c8   categorical, fixed order (validated adjacent, both modes)
     --an-muted          de-emphasis grey for "everyone else"
     --an-h1 … --an-h7   sequential heat ramp (one hue), + --an-hN-ink
     --an-d1 … --an-d5   ordinal difficulty ramp (validated --ordinal), + ink
   ========================================================================== */

export const MAX_SLOTS = 8;

/** Categorical colour for a fixed slot (0-based). Never cycles — callers cap at 8. */
export function slotColor(slot: number | undefined): string {
  if (slot === undefined || slot < 0 || slot >= MAX_SLOTS) return "var(--an-muted)";
  return `var(--an-c${slot + 1})`;
}

/**
 * Highlight slots for multi-club charts: the current top `top` clubs first,
 * then followed clubs, in that fixed order; everyone else stays muted.
 * Colour follows the club for the lifetime of the dataset.
 */
export function highlightSlots(rankedIds: string[], followed: string[], top = 4): Map<string, number> {
  const out = new Map<string, number>();
  const present = new Set(rankedIds);
  for (const id of rankedIds.slice(0, top)) out.set(id, out.size);
  for (const id of followed) if (present.has(id) && !out.has(id) && out.size < MAX_SLOTS) out.set(id, out.size);
  return out;
}

/** Seven-class sequential bins for probabilities (class 0 = effectively nil). */
const HEAT_BREAKS = [0.005, 0.02, 0.05, 0.1, 0.2, 0.35, 0.55];
export function heatClass(p: number): number {
  let c = 0;
  for (const b of HEAT_BREAKS) if (p >= b) c++;
  return c;
}
export const HEAT_LEGEND = HEAT_BREAKS;

/* ------------------------------------------------------------ scales --- */

/** Round tick values for a 0-based or arbitrary domain. */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [lo];
  const raw = (hi - lo) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(6));
  return out;
}

export function niceMax(v: number, step?: number): number {
  if (v <= 0) return 1;
  const s = step ?? (v > 60 ? 10 : v > 20 ? 5 : v > 8 ? 2 : 1);
  return Math.ceil(v / s) * s;
}

/** Spread label positions so none sit closer than `gap`, staying inside [min, max]. */
export function dodge(desired: number[], gap: number, min: number, max: number): number[] {
  const idx = desired.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const pos = idx.map((d) => d.y);
  for (let k = 0; k < pos.length; k++) {
    pos[k] = Math.max(pos[k], k ? pos[k - 1] + gap : min);
  }
  const overflow = pos.length ? pos[pos.length - 1] - max : 0;
  if (overflow > 0) {
    pos[pos.length - 1] = max;
    for (let k = pos.length - 2; k >= 0; k--) pos[k] = Math.min(pos[k], pos[k + 1] - gap);
    for (let k = 0; k < pos.length; k++) pos[k] = Math.max(pos[k], k ? pos[k - 1] + gap * 0.5 : min);
  }
  const out = new Array<number>(desired.length);
  idx.forEach((d, k) => (out[d.i] = pos[k]));
  return out;
}

/* -------------------------------------------------------- chart box ---- */

/**
 * Measures the chart container (so SVG text renders at true pixel size on
 * every screen) and reports when it has scrolled into view (draw-in).
 */
export function useChartBox<T extends HTMLElement = HTMLDivElement>() {
  const [drawRef, drawn] = useDrawIn<T>();
  const el = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback(
    (node: T | null) => {
      el.current = node;
      drawRef.current = node;
    },
    [drawRef],
  );
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    setWidth(Math.round(node.clientWidth));
    if (!("ResizeObserver" in window)) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return { ref, width, drawn };
}

/* ------------------------------------------------------------ frame ---- */

export function ChartCard({
  id,
  title,
  subtitle,
  actions,
  legend,
  table,
  footnote,
  children,
  flush,
}: {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  legend?: ReactNode;
  table?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  /** No inner padding (for edge-to-edge tables). */
  flush?: boolean;
}) {
  const headId = id ? `${id}-title` : undefined;
  return (
    <section className="section an-section" id={id} aria-labelledby={headId}>
      <div className="an-head">
        <div className="an-head-text">
          <h2 className="section-title" id={headId}>
            {title}
          </h2>
          {subtitle && <p className="an-sub">{subtitle}</p>}
        </div>
        {actions && <div className="an-actions">{actions}</div>}
      </div>
      <figure className={`an-panel glass${flush ? " flush" : ""}`}>
        {legend}
        {children}
        {(footnote || table) && (
          <div className="an-figfoot">
            {footnote && <p className="an-note">{footnote}</p>}
            {table}
          </div>
        )}
      </figure>
    </section>
  );
}

/* ----------------------------------------------------------- legend ---- */

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  kind?: "line" | "rect" | "dot";
  logo?: string;
  active?: boolean;
  dim?: boolean;
  /** Pattern class applied to the swatch when patterns are on. */
  pattern?: "a" | "b";
}

export function Legend({
  items,
  onToggle,
  onHover,
  label,
}: {
  items: LegendItem[];
  onToggle?: (key: string) => void;
  onHover?: (key: string | null) => void;
  label?: string;
}) {
  if (items.length < 2 && !onToggle) return null;
  return (
    <ul className="an-legend" aria-label={label ?? t("Legend")}>
      {items.map((it) => {
        const swatch = (
          <span
            className={`an-key ${it.kind ?? "rect"}${it.pattern ? ` an-pat-${it.pattern}` : ""}`}
            style={{ "--k": it.color } as CSSProperties}
            aria-hidden
          />
        );
        const body = (
          <>
            {swatch}
            {it.logo && <Crest src={it.logo} size={16} alt="" />}
            <span className="an-legend-label">{it.label}</span>
          </>
        );
        return (
          <li key={it.key} className={`${it.active ? "on" : ""}${it.dim ? " dim" : ""}`}>
            {onToggle ? (
              <button
                type="button"
                aria-pressed={!!it.active}
                onClick={() => onToggle(it.key)}
                onPointerEnter={() => onHover?.(it.key)}
                onPointerLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(it.key)}
                onBlur={() => onHover?.(null)}
              >
                {body}
              </button>
            ) : (
              <span className="an-legend-static">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- tooltip ---- */

/**
 * Tooltip anchored at (x, y) px inside a `.an-chart` box. The horizontal
 * anchor slides with x so it never leaves the card; it flips below the point
 * near the top edge.
 */
export function Tip({
  x,
  y,
  width,
  children,
  below,
  wide,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
  below?: boolean;
  wide?: boolean;
}) {
  const ax = width > 0 ? Math.min(1, Math.max(0, x / width)) : 0.5;
  return (
    <div
      className={`tooltip glass-strong an-tip${below ? " below" : ""}${wide ? " wide" : ""}`}
      role="status"
      aria-live="polite"
      style={{ left: x, top: y, "--ax": ax } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** A tooltip row: value leads, the label follows (with an optional line key). */
export function TipRow({ label, value, color, logo }: { label: ReactNode; value: ReactNode; color?: string; logo?: string }) {
  return (
    <div className="an-tip-row">
      {color && <span className="an-tip-key" style={{ background: color }} aria-hidden />}
      {logo && <Crest src={logo} size={14} alt="" />}
      <span className="an-tip-label">{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}

/* ------------------------------------------------------- data table ---- */

export interface Column {
  label: string;
  /** Right-align numeric columns (default true except the first). */
  num?: boolean;
}

/** The accessible "Show data" twin of a chart. Rendered lazily on open. */
export function DataTable({ columns, rows, caption }: { columns: Column[]; rows: ReactNode[][]; caption?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="an-data" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <span>{open ? t("Hide data") : t("Show data")}</span>
        <span className="an-data-count subtle">{t("{n} rows", { n: rows.length })}</span>
      </summary>
      {open && (
        <div className="an-data-scroll">
          <table className="mini-table an-mini">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th key={i} scope="col" className={(c.num ?? i > 0) ? "n" : ""}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={j} className={(columns[j]?.num ?? true) ? "n" : ""}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

/* ---------------------------------------------------------- texture ---- */

/** SVG hatch pattern (45° / 135°) used when <html data-patterns="on">. */
export function Hatch({ id, angle }: { id: string; angle: 45 | 135 }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <rect width="6" height="6" fill="transparent" />
      <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.42)" strokeWidth="2" />
    </pattern>
  );
}

/* ------------------------------------------------------------- misc ---- */

export function SignedDelta({ v, digits = 0, invert, neutral }: { v: number; digits?: number; invert?: boolean; neutral?: boolean }) {
  const shown = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
  const good = invert ? shown < 0 : shown > 0;
  const cls = shown === 0 ? "flat" : neutral ? "neutral" : good ? "up" : "down";
  const txt = shown > 0 ? `+${fmtNum(shown, digits)}` : shown < 0 ? `−${fmtNum(-shown, digits)}` : fmtNum(0, digits);
  return <span className={`an-delta ${cls} num`}>{txt}</span>;
}

