import { useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { fmtNum } from "../../lib/format";
import { Crest, LeagueBadge } from "../ui";
import { DataTable, Legend, Tip, TipRow, useChartBox } from "./core";

/* ==========================================================================
   HTML bar charts. Rows are links/buttons (keyboard reachable), bars draw in
   from the baseline, values sit at the bar tip, and a row tooltip carries
   the detail. Each chart ships its "Show data" twin.
   ========================================================================== */

export interface BarDetail {
  label: string;
  value: string;
  color?: string;
}

interface RowTip {
  key: string;
  x: number;
  y: number;
}

/** Tooltip state for row-based charts, positioned inside the chart box. */
function useRowTip() {
  const box = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<RowTip | null>(null);
  const place = (key: string, el: HTMLElement, clientX?: number) => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    const r = el.getBoundingClientRect();
    const x = clientX !== undefined ? clientX - b.left : r.left - b.left + r.width * 0.62;
    setTip({ key, x: Math.max(0, Math.min(b.width, x)), y: r.top - b.top + 2 });
  };
  const handlers = (key: string) => ({
    onPointerMove: (e: PointerEvent<HTMLElement>) => e.pointerType === "mouse" && place(key, e.currentTarget, e.clientX),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => place(key, e.currentTarget),
    onBlur: () => setTip(null),
  });
  return { box, tip, handlers, clear: () => setTip(null) };
}

function RowLabel({ logo, label, kind }: { logo?: string; label: string; kind?: "club" | "league" }) {
  return (
    <span className="an-blabel">
      {logo && (kind === "league" ? <LeagueBadge src={logo} size={22} /> : <Crest src={logo} size={20} alt="" />)}
      <span className="an-bname">{label}</span>
    </span>
  );
}

function Row({
  href,
  children,
  className,
  style,
  label,
  ...h
}: {
  href?: string;
  children: ReactNode;
  className: string;
  style?: CSSProperties;
  label: string;
} & ReturnType<ReturnType<typeof useRowTip>["handlers"]>) {
  return href ? (
    <Link to={href} className={className} style={style} aria-label={label} {...h}>
      {children}
    </Link>
  ) : (
    <div className={className} style={style} tabIndex={0} role="img" aria-label={label} {...h}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------- diverging bars --- */

export interface DivRow {
  key: string;
  label: string;
  logo?: string;
  href?: string;
  value: number;
  detail?: BarDetail[];
}

/** Signed values around a zero line: positive in series-1, negative in series-neg. */
export function DivergingBars({
  rows,
  digits = 0,
  posLabel,
  negLabel,
  valueLabel,
  tableColumns,
}: {
  rows: DivRow[];
  digits?: number;
  posLabel: string;
  negLabel: string;
  valueLabel: string;
  tableColumns?: string[];
}) {
  const { ref, drawn } = useChartBox();
  const { box, tip, handlers } = useRowTip();
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.001);
  const fmt = (v: number) => (v > 0 ? `+${fmtNum(v, digits)}` : v < 0 ? `−${fmtNum(-v, digits)}` : fmtNum(0, digits));
  const tr = tip ? rows.find((r) => r.key === tip.key) : null;
  return (
    <>
      <Legend
        items={[
          { key: "p", label: posLabel, color: "var(--series-1)" },
          { key: "n", label: negLabel, color: "var(--series-neg)", pattern: "b" },
        ]}
      />
      <div
        className={`an-chart an-bars an-div${drawn ? " drawn" : ""}`}
        ref={(el) => {
          ref(el);
          box.current = el;
        }}
      >
        {rows.map((r, i) => {
          const w = (Math.abs(r.value) / max) * 44;
          const pos = r.value >= 0;
          return (
            <Row
              key={r.key}
              href={r.href}
              className="an-brow"
              label={`${r.label}: ${valueLabel} ${fmt(r.value)}`}
              style={{ "--i": i } as CSSProperties}
              {...handlers(r.key)}
            >
              <span className="an-rk num">{i + 1}</span>
              <RowLabel logo={r.logo} label={r.label} />
              <span className="an-dtrack">
                <span className="an-zero" />
                {Math.abs(r.value) > 0 && (
                  <span
                    className={`an-dbar ${pos ? "pos" : "neg an-pat-b"}`}
                    style={{ "--w": `${w}%` } as CSSProperties}
                  />
                )}
                <span className="an-dval num" style={pos ? { insetInlineStart: `calc(50% + ${w}% + 6px)` } : { insetInlineEnd: `calc(50% + ${w}% + 6px)` }}>
                  {fmt(r.value)}
                </span>
              </span>
            </Row>
          );
        })}
        {tr && tip && (
          <Tip x={tip.x} y={tip.y} width={box.current?.clientWidth ?? 0}>
            <div className="tt-head">
              {tr.logo && <Crest src={tr.logo} size={18} alt="" />}
              {tr.label}
            </div>
            <TipRow label={valueLabel} value={fmt(tr.value)} />
            {tr.detail?.map((d) => <TipRow key={d.label} label={d.label} value={d.value} />)}
          </Tip>
        )}
      </div>
      <DataTable
        columns={[{ label: tableColumns?.[0] ?? t("Club") }, { label: valueLabel }, ...(rows[0]?.detail ?? []).map((d) => ({ label: d.label }))]}
        rows={rows.map((r) => [r.label, fmt(r.value), ...(r.detail ?? []).map((d) => d.value)])}
      />
    </>
  );
}

/* ------------------------------------------------------- ranked bars --- */

export interface RankRow {
  key: string;
  label: string;
  logo?: string;
  href?: string;
  value: number;
  display: string;
  note?: string;
  detail?: BarDetail[];
}

/** One series, sorted, value at the tip — the small-multiple workhorse. */
export function RankedBars({
  rows,
  valueLabel,
  kind = "club",
  max,
  compactTable,
}: {
  rows: RankRow[];
  valueLabel: string;
  kind?: "club" | "league";
  max?: number;
  compactTable?: boolean;
}) {
  const { ref, drawn } = useChartBox();
  const { box, tip, handlers } = useRowTip();
  const top = max ?? Math.max(...rows.map((r) => r.value), 0.001);
  const tr = tip ? rows.find((r) => r.key === tip.key) : null;
  return (
    <>
      <div
        className={`an-chart an-bars an-ranked${drawn ? " drawn" : ""}`}
        ref={(el) => {
          ref(el);
          box.current = el;
        }}
      >
        {rows.map((r, i) => (
          <Row
            key={r.key}
            href={r.href}
            className="an-brow"
            label={`${r.label}: ${r.display}${r.note ? ` (${r.note})` : ""}`}
            style={{ "--i": i } as CSSProperties}
            {...handlers(r.key)}
          >
            <span className="an-rk num">{i + 1}</span>
            <RowLabel logo={r.logo} label={r.label} kind={kind} />
            <span className="an-rtrack">
              <span className="an-rbar" style={{ "--wf": Math.max(0, Math.min(1, r.value / top)) } as CSSProperties} />
              <span className="an-rval num">
                {r.display}
                {r.note && <small className="an-rnote">{r.note}</small>}
              </span>
            </span>
          </Row>
        ))}
        {tr && tip && (
          <Tip x={tip.x} y={tip.y} width={box.current?.clientWidth ?? 0}>
            <div className="tt-head">{tr.label}</div>
            <TipRow label={valueLabel} value={tr.display} />
            {tr.detail?.map((d) => <TipRow key={d.label} label={d.label} value={d.value} />)}
          </Tip>
        )}
      </div>
      {!compactTable && (
        <DataTable
          columns={[{ label: kind === "league" ? t("League") : t("Club") }, { label: valueLabel }, ...(rows[0]?.detail ?? []).map((d) => ({ label: d.label }))]}
          rows={rows.map((r) => [r.label, r.display, ...(r.detail ?? []).map((d) => d.value)])}
        />
      )}
    </>
  );
}

/* ------------------------------------------------- 100% split bars ---- */

export interface SplitRow {
  key: string;
  label: string;
  logo?: string;
  href?: string;
  /** Shares that sum to 1, in legend order. */
  parts: number[];
}

/**
 * Part-to-whole (home / draw / away). 2px surface gaps between segments;
 * a segment label is printed only when it fits.
 */
export function SplitBars({
  rows,
  names,
  colors,
  kind = "league",
}: {
  rows: SplitRow[];
  names: string[];
  colors: string[];
  kind?: "club" | "league";
}) {
  const { ref, width, drawn } = useChartBox();
  const { box, tip, handlers } = useRowTip();
  const pct = (p: number) => `${fmtNum(p * 100, 0)}%`;
  const trackW = Math.max(0, width - (width < 520 ? 150 : 210));
  const tr = tip ? rows.find((r) => r.key === tip.key) : null;
  const pat = (i: number) => (i === 1 ? " an-pat-a" : i === 2 ? " an-pat-b" : "");
  return (
    <>
      <Legend items={names.map((n, i) => ({ key: n, label: n, color: colors[i], pattern: i === 1 ? "a" : i === 2 ? "b" : undefined }))} />
      <div
        className={`an-chart an-bars an-split${drawn ? " drawn" : ""}`}
        ref={(el) => {
          ref(el);
          box.current = el;
        }}
      >
        {rows.map((r, i) => (
          <Row
            key={r.key}
            href={r.href}
            className="an-brow"
            label={`${r.label}: ${names.map((n, k) => `${n} ${pct(r.parts[k])}`).join(", ")}`}
            style={{ "--i": i } as CSSProperties}
            {...handlers(r.key)}
          >
            <RowLabel logo={r.logo} label={r.label} kind={kind} />
            <span className="an-strack">
              {r.parts.map((p, k) =>
                p > 0 ? (
                  <span
                    key={k}
                    className={`an-seg${pat(k)}`}
                    style={{ "--w": p, background: colors[k] } as CSSProperties}
                  >
                    {p * trackW >= 40 && <span className={`an-seglabel${k === 1 ? " ink" : ""}`}>{pct(p)}</span>}
                  </span>
                ) : null,
              )}
            </span>
          </Row>
        ))}
        {tr && tip && (
          <Tip x={tip.x} y={tip.y} width={box.current?.clientWidth ?? 0}>
            <div className="tt-head">{tr.label}</div>
            {names.map((n, k) => (
              <TipRow key={n} label={n} value={pct(tr.parts[k])} color={colors[k]} />
            ))}
          </Tip>
        )}
      </div>
      <DataTable columns={[{ label: kind === "league" ? t("League") : t("Club") }, ...names.map((n) => ({ label: n }))]} rows={rows.map((r) => [r.label, ...r.parts.map(pct)])} />
    </>
  );
}

/* ------------------------------------------------------- card bars ----- */

export interface CardRow {
  key: string;
  label: string;
  logo?: string;
  href?: string;
  y: number;
  r: number;
  gp: number;
}

/** Yellow and red cards per club, each in its own column (identity by position + label). */
export function CardBars({ rows }: { rows: CardRow[] }) {
  const { ref, drawn } = useChartBox();
  const { box, tip, handlers } = useRowTip();
  const maxY = Math.max(1, ...rows.map((r) => r.y));
  const maxR = Math.max(3, ...rows.map((r) => r.r)); // one red never reads as "maximal"
  const tr = tip ? rows.find((r) => r.key === tip.key) : null;
  return (
    <>
      <div
        className={`an-chart an-bars an-cards${drawn ? " drawn" : ""}`}
        ref={(el) => {
          ref(el);
          box.current = el;
        }}
      >
        <div className="an-cards-head" aria-hidden>
          <span />
          <span />
          <span>
            <i className="an-cardglyph y" /> {t("Yellow")}
          </span>
          <span>
            <i className="an-cardglyph r" /> {t("Red")}
          </span>
        </div>
        {rows.map((r, i) => (
          <Row
            key={r.key}
            href={r.href}
            className="an-brow"
            label={t("{club}: {y} yellow cards, {r} red cards in {n} games", { club: r.label, y: r.y, r: r.r, n: r.gp })}
            style={{ "--i": i } as CSSProperties}
            {...handlers(r.key)}
          >
            <span className="an-rk num">{i + 1}</span>
            <RowLabel logo={r.logo} label={r.label} />
            <span className="an-rtrack">
              <span className="an-rbar y" style={{ "--wf": r.y / maxY } as CSSProperties} />
              <span className="an-rval num">{fmtNum(r.y)}</span>
            </span>
            <span className="an-rtrack">
              {r.r > 0 && <span className="an-rbar r an-pat-b" style={{ "--wf": r.r / maxR } as CSSProperties} />}
              <span className="an-rval num">{fmtNum(r.r)}</span>
            </span>
          </Row>
        ))}
        {tr && tip && (
          <Tip x={tip.x} y={tip.y} width={box.current?.clientWidth ?? 0}>
            <div className="tt-head">{tr.label}</div>
            <TipRow label={t("Yellow cards")} value={fmtNum(tr.y)} color="var(--an-yellow)" />
            <TipRow label={t("Red cards")} value={fmtNum(tr.r)} color="var(--an-red)" />
            <TipRow label={t("Per game")} value={tr.gp ? fmtNum((tr.y + tr.r) / tr.gp, 2) : "–"} />
          </Tip>
        )}
      </div>
      <DataTable
        columns={[{ label: t("Club") }, { label: t("Games") }, { label: t("Yellow") }, { label: t("Red") }, { label: t("Per game") }]}
        rows={rows.map((r) => [r.label, fmtNum(r.gp), fmtNum(r.y), fmtNum(r.r), r.gp ? fmtNum((r.y + r.r) / r.gp, 2) : "–"])}
      />
    </>
  );
}

/* --------------------------------------------------------- dumbbell ---- */

export interface DumbRow {
  key: string;
  label: string;
  logo?: string;
  href?: string;
  a: number | null;
  b: number | null;
  detail?: BarDetail[];
}

/** Two values per club on one shared scale (e.g. home vs away points per game). */
export function Dumbbell({
  rows,
  names,
  max,
  digits = 2,
  ticks,
}: {
  rows: DumbRow[];
  names: [string, string];
  max: number;
  digits?: number;
  ticks: number[];
}) {
  const { ref, drawn } = useChartBox();
  const { box, tip, handlers } = useRowTip();
  const pos = (v: number) => `${(Math.max(0, Math.min(max, v)) / max) * 100}%`;
  const tr = tip ? rows.find((r) => r.key === tip.key) : null;
  const fmt = (v: number | null) => (v === null ? "–" : fmtNum(v, digits));
  const gap = (r: DumbRow) => (r.a !== null && r.b !== null ? r.a - r.b : null);
  return (
    <>
      <Legend
        items={[
          { key: "a", label: names[0], color: "var(--series-1)", kind: "dot" },
          { key: "b", label: names[1], color: "var(--series-2)", kind: "dot", pattern: "b" },
        ]}
      />
      <div
        className={`an-chart an-bars an-dumb${drawn ? " drawn" : ""}`}
        ref={(el) => {
          ref(el);
          box.current = el;
        }}
      >
        <div className="an-dumb-axis" aria-hidden>
          <span />
          <span />
          <span className="an-dumb-scale">
            {ticks.map((v) => (
              <i key={v} style={{ insetInlineStart: pos(v) }}>
                {fmtNum(v)}
              </i>
            ))}
          </span>
          <span className="an-dumb-gaph">Δ</span>
        </div>
        {rows.map((r, i) => {
          const g = gap(r);
          const lo = r.a !== null && r.b !== null ? Math.min(r.a, r.b) : null;
          const hi = r.a !== null && r.b !== null ? Math.max(r.a, r.b) : null;
          return (
            <Row
              key={r.key}
              href={r.href}
              className="an-brow"
              label={`${r.label}: ${names[0]} ${fmt(r.a)}, ${names[1]} ${fmt(r.b)}`}
              style={{ "--i": i } as CSSProperties}
              {...handlers(r.key)}
            >
              <span className="an-rk num">{i + 1}</span>
              <RowLabel logo={r.logo} label={r.label} />
              <span className="an-dumb-track" dir="ltr">
                {ticks.map((v) => (
                  <i key={v} className="an-dumb-grid" style={{ left: pos(v) }} />
                ))}
                {lo !== null && hi !== null && <span className="an-dumb-link" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />}
                {r.b !== null && <span className="an-dumb-dot b" style={{ left: pos(r.b) }} />}
                {r.a !== null && <span className="an-dumb-dot a" style={{ left: pos(r.a) }} />}
              </span>
              <span className={`an-dumb-gap num${g === null ? "" : g > 0 ? " pos" : g < 0 ? " neg" : ""}`}>
                {g === null ? "–" : g > 0 ? `+${fmtNum(g, 1)}` : g < 0 ? `−${fmtNum(-g, 1)}` : fmtNum(0, 1)}
              </span>
            </Row>
          );
        })}
        {tr && tip && (
          <Tip x={tip.x} y={tip.y} width={box.current?.clientWidth ?? 0}>
            <div className="tt-head">{tr.label}</div>
            <TipRow label={names[0]} value={fmt(tr.a)} color="var(--series-1)" />
            <TipRow label={names[1]} value={fmt(tr.b)} color="var(--series-2)" />
            {tr.detail?.map((d) => <TipRow key={d.label} label={d.label} value={d.value} />)}
          </Tip>
        )}
      </div>
      <DataTable
        columns={[{ label: t("Club") }, { label: names[0] }, { label: names[1] }, { label: t("Difference") }, ...(rows[0]?.detail ?? []).map((d) => ({ label: d.label }))]}
        rows={rows.map((r) => {
          const g = gap(r);
          return [r.label, fmt(r.a), fmt(r.b), g === null ? "–" : fmtNum(g, digits), ...(r.detail ?? []).map((d) => d.value)];
        })}
      />
    </>
  );
}
