import { useId, useState, type KeyboardEvent } from "react";
import { currentLang, t } from "../../i18n";
import { fmtNum } from "../../lib/format";
import { useDrawIn } from "../../lib/motion";
import { ChartCard, ChartTip, PatternDefs, TipRow, usePatterns } from "./chart";
import { METRICS, MIN_APPS, type Metric, type Percentile, type PersonRow } from "./data";

/* Radar of per-game percentiles vs league peers, and a head-to-head bar list. */

export interface Series {
  name: string;
  short: string;
  league: string;
  pcts: Percentile[] | null;
  peers: number;
  person: PersonRow | null;
}

const COLORS = ["var(--series-1)", "var(--series-2)"];

export function ordinalPct(n: number): string {
  const r = Math.round(n);
  if (currentLang() === "en") {
    const pr = new Intl.PluralRules("en", { type: "ordinal" }).select(r);
    const suf = pr === "one" ? "st" : pr === "two" ? "nd" : pr === "few" ? "rd" : "th";
    return `${r}${suf} percentile`;
  }
  return t("Percentile {n}", { n: r });
}

export function metricText(m: Metric, v: number | null): string {
  if (v == null) return "–";
  if (m.kind === "pct") return `${fmtNum(v * 100)}%`;
  return t("{n} per game", { n: fmtNum(v, 2) });
}

const S = 400;
const C = S / 2;
const R = 136;

export function Radar({ series }: { series: Series[] }) {
  const [drawRef, drawn] = useDrawIn<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const patterns = usePatterns();
  const pid = useId().replace(/:/g, "");
  const n = METRICS.length;
  const ang = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pt = (i: number, f: number) => [C + Math.cos(ang(i)) * R * f, C + Math.sin(ang(i)) * R * f] as const;
  const poly = (f: (i: number) => number) =>
    METRICS.map((_, i) => pt(i, f(i)))
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
  const live = series.filter((s) => s.pcts);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a == null ? 0 : (a + 1) % n));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a == null ? n - 1 : (a - 1 + n) % n));
    } else if (e.key === "Escape") setActive(null);
  };

  const legend = series.map((s, i) => (
    <span className="pl-key" key={s.name + i}>
      <i className="pl-swatch" style={{ background: COLORS[i] }} />
      {s.name}
    </span>
  ));

  const table = (
    <table className="pl-table compact">
      <thead>
        <tr>
          <th scope="col">{t("Metric")}</th>
          {series.map((s, i) => (
            <th scope="col" key={i}>
              {s.short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {METRICS.map((m, mi) => (
          <tr key={m.key}>
            <th scope="row">{t(m.label)}</th>
            {series.map((s, i) => {
              const p = s.pcts?.[mi];
              return (
                <td key={i}>
                  {metricText(m, p?.value ?? null)}
                  <span className="pl-cell-sub">{p?.pct != null ? ordinalPct(p.pct) : t("No peer data")}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const am = active != null ? METRICS[active] : null;
  const [tx, ty] = active != null ? pt(active, 1.12) : [0, 0];

  return (
    <ChartCard
      title={t("Percentile profile")}
      subtitle={t("Per-game output ranked against league peers with {n}+ appearances. 100 is the best in the league.", { n: MIN_APPS })}
      legend={series.length > 1 ? legend : undefined}
      table={table}
      className="pl-radar-card"
    >
      {live.length === 0 ? (
        <p className="pl-empty-line">{t("Not enough league data yet to rank these players.")}</p>
      ) : (
        <div ref={drawRef} className="chart pl-radar" dir="ltr" onPointerLeave={() => setActive(null)}>
          <svg
            viewBox={`0 0 ${S} ${S}`}
            role="application"
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            aria-label={t("Radar chart of percentiles. Use the arrow keys to read each metric.")}
          >
            {patterns && <PatternDefs prefix={pid} />}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <polygon key={f} className={f === 1 ? "pl-ring outer" : "pl-ring"} points={poly(() => f)} />
            ))}
            {METRICS.map((m, i) => {
              const [x, y] = pt(i, 1);
              return <line key={m.key} className={`pl-spoke${active === i ? " on" : ""}`} x1={C} y1={C} x2={x} y2={y} />;
            })}
            <text className="axis-label" x={C + 4} y={C - R * 0.5 - 3}>
              50
            </text>
            <g className={`pl-radar-shapes${drawn ? " on" : ""}`} style={{ transformOrigin: `${C}px ${C}px` }}>
              {series.map((s, si) =>
                s.pcts ? (
                  <g key={si}>
                    <polygon
                      points={poly((i) => (s.pcts![i].pct ?? 0) / 100)}
                      className="pl-radar-area"
                      style={{
                        fill: patterns ? `url(#${pid}-h${si + 1})` : COLORS[si],
                        fillOpacity: patterns ? 1 : 0.12,
                        stroke: COLORS[si],
                      }}
                    />
                    {s.pcts.map((p, i) => {
                      if (p.pct == null) return null;
                      const [x, y] = pt(i, p.pct / 100);
                      return <circle key={i} cx={x} cy={y} r={active === i ? 6 : 4.5} className="pl-vertex" style={{ fill: COLORS[si] }} />;
                    })}
                  </g>
                ) : null,
              )}
            </g>
            {METRICS.map((m, i) => {
              const a0 = ang(i - 0.5);
              const a1 = ang(i + 0.5);
              const big = R + 46;
              const d = `M${C},${C} L${C + Math.cos(a0) * big},${C + Math.sin(a0) * big} A${big},${big} 0 0 1 ${C + Math.cos(a1) * big},${C + Math.sin(a1) * big} Z`;
              return <path key={m.key} d={d} className="pl-wedge" onPointerEnter={() => setActive(i)} />;
            })}
          </svg>
          {METRICS.map((m, i) => {
            const [x, y] = pt(i, 1.2);
            return (
              <span
                key={m.key}
                className={`pl-axis${active === i ? " on" : ""}`}
                style={{ left: `${(x / S) * 100}%`, top: `${(y / S) * 100}%` }}
                onPointerEnter={() => setActive(i)}
                aria-hidden
              >
                {t(m.short)}
              </span>
            );
          })}
          {am && active != null && (
            <ChartTip x={(tx / S) * 100} y={(ty / S) * 100} below={ty < C}>
              <div className="tt-head">{t(am.label)}</div>
              {series.map((s, si) => {
                const p = s.pcts?.[active];
                return (
                  <TipRow
                    key={si}
                    color={COLORS[si]}
                    label={
                      <>
                        {s.short}
                        <span className="pl-tt-dim"> · {metricText(am, p?.value ?? null)}</span>
                      </>
                    }
                    value={p?.pct != null ? fmtNum(p.pct) : "–"}
                  />
                );
              })}
            </ChartTip>
          )}
        </div>
      )}
      {series.some((s) => !s.pcts && s.person == null) && (
        <p className="pl-footnote">{t("Players without league appearances in Pitch’s season data can’t be ranked yet.")}</p>
      )}
    </ChartCard>
  );
}

/* --------------------------------------------------------------- H2H --- */

interface Row {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  digits?: number;
  pct?: boolean;
  lowerBetter?: boolean;
}

export function HeadToHead({ a, b, names }: { a: PersonRow; b: PersonRow; names: [string, string] }) {
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const patterns = usePatterns();
  const rate = (p: PersonRow, v: number) => (p.apps ? v / p.apps : null);
  const acc = (p: PersonRow) => (p.sh ? p.sot / p.sh : null);
  const rows: Row[] = [
    { key: "apps", label: t("Appearances"), a: a.apps, b: b.apps },
    { key: "starts", label: t("Starts"), a: a.starts, b: b.starts },
    { key: "g", label: t("Goals"), a: a.g, b: b.g },
    { key: "a", label: t("Assists"), a: a.a, b: b.a },
    { key: "xg", label: t("Expected goals (xG)"), a: a.xg, b: b.xg, digits: 1 },
    { key: "gpg", label: t("Goals per game"), a: rate(a, a.g), b: rate(b, b.g), digits: 2 },
    { key: "apg", label: t("Assists per game"), a: rate(a, a.a), b: rate(b, b.a), digits: 2 },
    { key: "sh", label: t("Shots"), a: a.sh, b: b.sh },
    { key: "sot", label: t("Shots on target"), a: a.sot, b: b.sot },
    { key: "acc", label: t("Shot accuracy"), a: acc(a), b: acc(b), pct: true },
    { key: "y", label: t("Yellow cards"), a: a.y, b: b.y, lowerBetter: true },
    { key: "r", label: t("Red cards"), a: a.r, b: b.r, lowerBetter: true },
  ];
  const fmt = (r: Row, v: number | null) => (v == null ? "–" : r.pct ? `${fmtNum(v * 100)}%` : fmtNum(v, r.digits ?? 0));

  return (
    <section className="glass pl-card" aria-labelledby="pl-h2h-title">
      <header className="pl-card-head">
        <div className="pl-card-titles">
          <h2 className="panel-title" id="pl-h2h-title">
            {t("Head to head")}
          </h2>
          <p className="pl-card-sub">{t("League totals this season. The leader in each row is in bold.")}</p>
        </div>
      </header>
      <div className="pl-legend pl-h2h-legend" dir="ltr">
        <span className="pl-key">
          <i className="pl-swatch" style={{ background: COLORS[0] }} />
          {names[0]}
        </span>
        <span className="pl-key">
          <i className="pl-swatch" style={{ background: COLORS[1] }} />
          {names[1]}
        </span>
      </div>
      <div ref={ref} className={`pl-h2h${patterns ? " patterned" : ""}`} dir="ltr">
        <div className="sr-only pl-sr-box"><table>
          <caption>{t("Head to head")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Metric")}</th>
              <th scope="col">{names[0]}</th>
              <th scope="col">{names[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{fmt(r, r.a)}</td>
                <td>{fmt(r, r.b)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {rows.map((r) => {
          const av = r.a ?? 0;
          const bv = r.b ?? 0;
          const max = Math.max(av, bv);
          const lead = r.a == null || r.b == null || av === bv ? 0 : (r.lowerBetter ? av < bv : av > bv) ? 1 : 2;
          return (
            <div className="cmp-row pl-h2h-row" key={r.key} aria-hidden>
              <div className="cmp-head">
                <span className={`v num${lead === 1 ? " lead" : ""}`}>{fmt(r, r.a)}</span>
                <span className="l">{r.label}</span>
                <span className={`v num${lead === 2 ? " lead" : ""}`}>{fmt(r, r.b)}</span>
              </div>
              <div className="cmp-bars">
                <div className="cmp-track home">
                  <div className={`cmp-fill${lead === 2 ? " dim" : ""}`} style={{ width: drawn && max ? `${(av / max) * 100}%` : 0 }} />
                </div>
                <div className="cmp-track away">
                  <div className={`cmp-fill${lead === 1 ? " dim" : ""}`} style={{ width: drawn && max ? `${(bv / max) * 100}%` : 0 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
