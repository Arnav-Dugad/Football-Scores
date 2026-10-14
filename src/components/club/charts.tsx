import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../../i18n";
import { MINUTE_BINS } from "../../lib/analytics";
import { fmtDate, fmtNum } from "../../lib/format";
import { useDrawIn } from "../../lib/motion";
import { useSettings } from "../../lib/settings";

/* Club charts. Marks follow the dataviz spec: 2px lines, ≥8px ringed
   markers, ≤24px columns with 4px rounded caps and a 2px surface gap,
   hairline recessive grid, ink-token text, hover + focus tooltips and a
   table view for every chart. The club's own series uses var(--club). */

function niceStep(max: number, target = 4): number {
  if (max <= 0) return 1;
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return Math.max(1, step * pow);
}

const clampPct = (v: number) => Math.max(14, Math.min(86, v));

/** Container width, so the SVG coordinate space matches CSS pixels and text stays 11px on phones. */
function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver((es) => {
      const next = Math.round(es[0]?.contentRect.width ?? 0);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(280, w || fallback)] as const;
}

/* ------------------------------------------------- position history ---- */

export interface PositionPoint {
  round: number;
  date: string;
  rank: number;
  of: number;
  pts: number;
}

export function PositionChart({ points, title }: { points: PositionPoint[]; title: string }) {
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const H = W < 480 ? 200 : 230;
  const m = { t: 18, r: 40, b: 30, l: 30 };
  const of = Math.max(2, ...points.map((p) => p.of));
  const n = points.length;
  const sx = (i: number) => m.l + (n <= 1 ? (W - m.l - m.r) / 2 : (i / (n - 1)) * (W - m.l - m.r));
  const sy = (rank: number) => m.t + ((rank - 1) / (of - 1)) * (H - m.t - m.b);
  const yTicks = useMemo(() => {
    const step = of > 12 ? 5 : of > 6 ? 2 : 1;
    const s = new Set<number>([1, of]);
    for (let v = step; v < of; v += step) s.add(v);
    return [...s].sort((a, b) => a - b).filter((v, i, arr) => i === 0 || v - arr[i - 1] >= step * 0.6 || v === of);
  }, [of]);
  const xEvery = Math.max(1, Math.ceil(n / 8));
  const line = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.rank).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${sx(n - 1).toFixed(1)},${H - m.b} L${sx(0).toFixed(1)},${H - m.b} Z` : "";
  const last = points[n - 1];
  const hp = hover != null ? points[hover] : null;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let dist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(sx(i) - x);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setHover(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    const rtl = document.documentElement.dir === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === fwd) setHover((h) => Math.min(n - 1, (h ?? n - 1) + (h == null ? 0 : 1)));
    else if (e.key === back) setHover((h) => Math.max(0, (h ?? n - 1) - 1));
    else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(n - 1);
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  if (!n) return null;
  return (
    <div className="chart cl-chart" ref={ref}>
      <div
        className="cl-chart-focus"
        ref={box}
        tabIndex={0}
        role="group"
        aria-label={t("{title}. Use left and right arrow keys to move between matchdays.", { title })}
        onKeyDown={onKey}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line className="gridline" x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} />
              <text className="axis-label" x={m.l - 10} y={sy(v) + 4} textAnchor="end">
                {fmtNum(v)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % xEvery === 0 || i === n - 1 ? (
              <text key={p.round} className="axis-label" x={sx(i)} y={H - 8} textAnchor="middle">
                {fmtNum(p.round)}
              </text>
            ) : null,
          )}
          {area && <path d={area} className="cl-area" style={{ opacity: drawn ? 1 : 0 }} />}
          <path d={line} className="cl-line" pathLength={1} style={{ strokeDashoffset: drawn ? 0 : 1 }} />
          {hp && hover != null && (
            <line className="cl-crosshair" x1={sx(hover)} x2={sx(hover)} y1={m.t - 6} y2={H - m.b} />
          )}
          {hp && hover != null && <circle className="cl-dot" cx={sx(hover)} cy={sy(hp.rank)} r={5} />}
          <circle className="cl-dot end" cx={sx(n - 1)} cy={sy(last.rank)} r={5} style={{ opacity: drawn ? 1 : 0 }} />
          <text className="cl-end-label" x={sx(n - 1) + 12} y={sy(last.rank) + 4} style={{ opacity: drawn ? 1 : 0 }}>
            {t("#{n}", { n: fmtNum(last.rank) })}
          </text>
        </svg>
        {hp && hover != null && (
          <div
            className="tooltip glass-strong cl-tip"
            style={{ left: `${clampPct((sx(hover) / W) * 100)}%`, top: `${(sy(hp.rank) / H) * 100}%` }}
            aria-live="polite"
          >
            <div className="tt-head">{t("Matchday {n}", { n: fmtNum(hp.round) })}</div>
            <div className="tt-row">
              <b>{fmtNum(hp.rank)}</b>
              <span>{t("Position (of {n})", { n: fmtNum(hp.of) })}</span>
            </div>
            <div className="tt-row">
              <b>{fmtNum(hp.pts)}</b>
              <span>{t("Points")}</span>
            </div>
            <div className="tt-row subtle">{fmtDate(hp.date)}</div>
          </div>
        )}
      </div>
      <details className="cl-data">
        <summary>{t("Show data")}</summary>
        <table className="mini-table">
          <thead>
            <tr>
              <th>{t("Matchday")}</th>
              <th>{t("Date")}</th>
              <th>{t("Position")}</th>
              <th>{t("Points")}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.round}>
                <td>{fmtNum(p.round)}</td>
                <td>{fmtDate(p.date)}</td>
                <td>{fmtNum(p.rank)}</td>
                <td>{fmtNum(p.pts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ----------------------------------------------------- goals by minute -- */

/** Column path with a 4px rounded data-end and a square baseline. */
function colPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function MinuteChart({ scored, conceded }: { scored: number[]; conceded: number[] }) {
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const [settings] = useSettings();
  const pid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const H = W < 480 ? 220 : 250;
  const m = { t: 24, r: 8, b: 34, l: 30 };
  const max = Math.max(1, ...scored, ...conceded);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const band = (W - m.l - m.r) / MINUTE_BINS.length;
  const bw = Math.min(24, band * 0.3);
  const gap = 2;
  const sy = (v: number) => H - m.b - (v / top) * (H - m.t - m.b);
  const peakS = scored.indexOf(Math.max(...scored));
  const peakC = conceded.indexOf(Math.max(...conceded));
  const labelOf = (i: number) => t("{range} min", { range: MINUTE_BINS[i] });
  const hp = hover;

  return (
    <div className="chart cl-chart" ref={ref}>
      <div className="cl-legend" aria-hidden="true">
        <span>
          <i className="sw a" />
          {t("Scored")}
        </span>
        <span>
          <i className={`sw b${settings.patterns ? " hatch" : ""}`} />
          {t("Conceded")}
        </span>
      </div>
      <div style={{ position: "relative" }} ref={box} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("Goals scored and conceded by minute")}>
          <defs>
            <pattern id={`${pid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="cl-hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="6" className="cl-hatch-line" />
            </pattern>
          </defs>
          {ticks.map((v) => (
            <g key={v} aria-hidden="true">
              <line className={v === 0 ? "baseline" : "gridline"} x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} />
              <text className="axis-label" x={m.l - 8} y={sy(v) + 4} textAnchor="end">
                {fmtNum(v)}
              </text>
            </g>
          ))}
          {MINUTE_BINS.map((bin, i) => {
            const cx = m.l + band * i + band / 2;
            const xa = cx - bw - gap / 2;
            const xb = cx + gap / 2;
            const ha = (scored[i] / top) * (H - m.t - m.b);
            const hb = (conceded[i] / top) * (H - m.t - m.b);
            const on = hp === i;
            return (
              <g
                key={bin}
                tabIndex={0}
                role="img"
                aria-label={t("{range}: scored {s}, conceded {c}", { range: labelOf(i), s: scored[i], c: conceded[i] })}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={`cl-band${on ? " on" : ""}${hp != null && !on ? " dim" : ""}`}
              >
                <rect className="cl-hit" x={m.l + band * i} y={m.t - 10} width={band} height={H - m.t - m.b + 10} />
                <path
                  className="cl-col a"
                  d={colPath(xa, sy(scored[i]), bw, ha)}
                  style={{ transform: `scaleY(${drawn ? 1 : 0})`, transitionDelay: `${i * 50}ms` }}
                />
                <path
                  className="cl-col b"
                  d={colPath(xb, sy(conceded[i]), bw, hb)}
                  style={{
                    transform: `scaleY(${drawn ? 1 : 0})`,
                    transitionDelay: `${i * 50 + 25}ms`,
                    fill: settings.patterns ? `url(#${pid}-hatch)` : undefined,
                  }}
                />
                {i === peakS && scored[i] > 0 && (
                  <text className="cl-cap" x={xa + bw / 2} y={sy(scored[i]) - 6} textAnchor="middle" style={{ opacity: drawn ? 1 : 0 }}>
                    {fmtNum(scored[i])}
                  </text>
                )}
                {i === peakC && conceded[i] > 0 && (
                  <text className="cl-cap" x={xb + bw / 2} y={sy(conceded[i]) - 6} textAnchor="middle" style={{ opacity: drawn ? 1 : 0 }}>
                    {fmtNum(conceded[i])}
                  </text>
                )}
                <text className="axis-label" x={cx} y={H - 12} textAnchor="middle" aria-hidden="true" style={W < 480 ? { fontSize: 10 } : undefined}>
                  {W < 480 ? bin : `${bin}′`}
                </text>
              </g>
            );
          })}
        </svg>
        {hp != null && (
          <div
            className="tooltip glass-strong cl-tip"
            style={{ left: `${clampPct(((m.l + band * hp + band / 2) / W) * 100)}%`, top: `${(sy(Math.max(scored[hp], conceded[hp])) / H) * 100}%` }}
          >
            <div className="tt-head">{labelOf(hp)}</div>
            <div className="tt-row">
              <span className="cl-key a" />
              <b>{fmtNum(scored[hp])}</b>
              <span>{t("Scored")}</span>
            </div>
            <div className="tt-row">
              <span className="cl-key b" />
              <b>{fmtNum(conceded[hp])}</b>
              <span>{t("Conceded")}</span>
            </div>
          </div>
        )}
      </div>
      <details className="cl-data">
        <summary>{t("Show data")}</summary>
        <table className="mini-table">
          <thead>
            <tr>
              <th>{t("Minutes")}</th>
              <th>{t("Scored")}</th>
              <th>{t("Conceded")}</th>
            </tr>
          </thead>
          <tbody>
            {MINUTE_BINS.map((b, i) => (
              <tr key={b}>
                <td>{b}</td>
                <td>{fmtNum(scored[i])}</td>
                <td>{fmtNum(conceded[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ---------------------------------------------------------- W/D/L bar -- */

export function RecordBar({ w, d, l, label }: { w: number; d: number; l: number; label: string }) {
  const total = w + d + l;
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  if (!total) return <div className="cl-recbar empty" aria-hidden="true" />;
  const seg = (n: number, k: "W" | "D" | "L", word: string) =>
    n > 0 ? (
      <span
        className={`seg ${k}`}
        style={{ flexGrow: drawn ? n : 0.0001 }}
        title={`${word}: ${fmtNum(n)}`}
      >
        {drawn && n / total >= 0.14 && (
          <b>
            {fmtNum(n)}
            {k === "W" ? t("form::W") : k === "D" ? t("form::D") : t("form::L")}
          </b>
        )}
      </span>
    ) : null;
  return (
    <div
      className="cl-recbar"
      ref={ref}
      role="img"
      aria-label={t("{label}: {w} wins, {d} draws, {l} losses", { label, w, d, l })}
    >
      {seg(w, "W", t("Wins"))}
      {seg(d, "D", t("Draws"))}
      {seg(l, "L", t("Losses"))}
    </div>
  );
}
