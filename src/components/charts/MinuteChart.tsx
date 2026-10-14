import { useId, useState } from "react";
import { t } from "../../i18n";
import { fmtNum, fmtPct } from "../../lib/format";
import { useSettings } from "../../lib/settings";
import { DataTable, Hatch, Legend, Tip, TipRow, niceMax, useChartBox } from "./core";

/**
 * Goals by 15-minute block. League-wide it is one series (columns);
 * for a club it mirrors goals scored (up) against goals conceded (down)
 * around a shared baseline — one axis, two directions.
 */
export function MinuteChart({ bins, scored, conceded }: { bins: string[]; scored: number[]; conceded?: number[] }) {
  const { ref, width, drawn } = useChartBox();
  const [{ patterns }] = useSettings();
  const hatch = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const mirror = !!conceded;
  const W = Math.max(280, width);
  const H = mirror ? 300 : 240;
  const m = { t: 22, r: 8, b: 30, l: 8 };
  const pw = W - m.l - m.r;
  const band = pw / bins.length;
  const bw = Math.min(24, band * 0.5);
  const top = niceMax(Math.max(1, ...scored, ...(conceded ?? [0])));
  const plotH = H - m.t - m.b - (mirror ? 18 : 0);
  const base = mirror ? m.t + plotH / 2 : m.t + plotH;
  const half = mirror ? plotH / 2 - 14 : plotH - 4;
  const h = (v: number) => (v / top) * half;
  const total = scored.reduce((a, b) => a + b, 0);
  const totalC = (conceded ?? []).reduce((a, b) => a + b, 0);

  const col = (x: number, v: number, up: boolean, cls: string, i: number) => {
    const hh = h(v);
    if (hh <= 0) return null;
    const r = Math.min(4, hh);
    const y = up ? base - hh : base;
    // Rounded data end, square at the baseline.
    const d = up
      ? `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`
      : `M${x},${base} V${base + hh - r} Q${x},${base + hh} ${x + r},${base + hh} H${x + bw - r} Q${x + bw},${base + hh} ${x + bw},${base + hh - r} V${base} Z`;
    return (
      <g key={`${cls}${i}`} className={`an-col ${cls}`} style={{ transformOrigin: `0 ${base}px` }}>
        <path d={d} />
        {patterns && !up && <path d={d} fill={`url(#${hatch}b)`} />}
      </g>
    );
  };

  return (
    <>
      {mirror && (
        <Legend
          items={[
            { key: "s", label: t("Scored"), color: "var(--series-1)" },
            { key: "c", label: t("Conceded"), color: "var(--series-neg)", pattern: "b" },
          ]}
        />
      )}
      <div className={`an-chart${drawn ? " drawn" : ""}`} ref={ref} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="an-svg" role="group" aria-label={t("Goals by minute")}>
            <defs>
              <Hatch id={`${hatch}b`} angle={135} />
            </defs>
            {bins.map((b, i) => {
              const x = m.l + band * i + (band - bw) / 2;
              const on = hover === i;
              return (
                <g
                  key={b}
                  className={`an-bin${hover !== null && !on ? " dim" : ""}`}
                  tabIndex={0}
                  role="img"
                  aria-label={
                    mirror
                      ? t("{bin} minutes: {s} scored, {c} conceded", { bin: b, s: scored[i], c: conceded![i] })
                      : t("{bin} minutes: {s} goals", { bin: b, s: scored[i] })
                  }
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  <rect x={m.l + band * i} y={m.t - 18} width={band} height={H - m.t - m.b + 18} fill="transparent" />
                  {col(x, scored[i], true, "s", i)}
                  {mirror && col(x, conceded![i], false, "c", i)}
                  <text className="an-val" x={x + bw / 2} y={base - h(scored[i]) - 6} textAnchor="middle">
                    {fmtNum(scored[i])}
                  </text>
                  {mirror && (
                    <text className="an-val" x={x + bw / 2} y={base + h(conceded![i]) + 14} textAnchor="middle">
                      {fmtNum(conceded![i])}
                    </text>
                  )}
                  <text className="an-tick" x={x + bw / 2} y={H - 8} textAnchor="middle">
                    {b}′
                  </text>
                </g>
              );
            })}
            <line className="an-base" x1={m.l} x2={W - m.r} y1={base} y2={base} />
            {halfTime(m.l + band * 3, m.t - 14, base + (mirror ? half + 4 : 0))}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tip x={m.l + band * hover + band / 2} y={base - h(scored[hover]) - 10} width={W} below={base - h(scored[hover]) < 110}>
            <div className="tt-head">{t("{bin} minutes", { bin: bins[hover] })}</div>
            <TipRow
              label={mirror ? t("Scored") : t("Goals")}
              value={`${fmtNum(scored[hover])} · ${fmtPct(total ? scored[hover] / total : 0)}`}
              color={mirror ? "var(--series-1)" : undefined}
            />
            {mirror && (
              <TipRow
                label={t("Conceded")}
                value={`${fmtNum(conceded![hover])} · ${fmtPct(totalC ? conceded![hover] / totalC : 0)}`}
                color="var(--series-neg)"
              />
            )}
          </Tip>
        )}
      </div>
      <DataTable
        columns={[{ label: t("Minutes") }, { label: mirror ? t("Scored") : t("Goals") }, ...(mirror ? [{ label: t("Conceded") }] : []), { label: t("Share") }]}
        rows={bins.map((b, i) => [
          `${b}′`,
          fmtNum(scored[i]),
          ...(mirror ? [fmtNum(conceded![i])] : []),
          fmtPct(total ? scored[i] / total : 0),
        ])}
      />
    </>
  );
}

/** Half-time divider between the first and second halves. */
function halfTime(x: number, y1: number, y2: number) {
  return <line className="an-ht" x1={x} x2={x} y1={y1} y2={y2} />;
}
