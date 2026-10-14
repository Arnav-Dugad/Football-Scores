import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../../i18n";
import { sized } from "../../lib/api";
import { fmtDayShort, fmtNum } from "../../lib/format";
import { DataTable, Tip, TipRow, slotColor, useChartBox } from "./core";

export interface BumpSeries {
  id: string;
  name: string;
  short: string;
  logo: string;
  /** League position after each round (1 = top). */
  ranks: number[];
}

/**
 * League position over time — a bump chart by matchday with crests at both
 * ends. Position 1 sits at the top. Hover or focus a club to follow it.
 */
export function BumpChart({
  series,
  slots,
  league,
  roundDates,
}: {
  series: BumpSeries[];
  slots: Map<string, number>;
  league: string;
  /** Last kick-off of each matchday, for the tooltip. */
  roundDates: string[];
}) {
  const nav = useNavigate();
  const { ref, width, drawn } = useChartBox();
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ id: string; r: number } | null>(null);
  const on = active ?? pinned;

  const n = series.length;
  const R = Math.max(1, ...series.map((s) => s.ranks.length));
  const row = n > 24 ? 16 : n > 14 ? 22 : 26;
  const crest = Math.min(20, row - 4);
  const W = Math.max(300, width);
  const m = { t: 12, r: crest + 34, b: 46, l: crest + 34 };
  const plotH = (n - 1) * row;
  const H = plotH + m.t + m.b;
  const pw = W - m.l - m.r;
  const sx = (i: number) => (R === 1 ? m.l + pw / 2 : m.l + (i / (R - 1)) * pw);
  const sy = (rank: number) => m.t + (rank - 1) * row;

  const path = (ranks: number[]) => {
    let d = "";
    ranks.forEach((r, i) => {
      const x = sx(i);
      const y = sy(r);
      if (!i) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
      else {
        const px = sx(i - 1);
        const py = sy(ranks[i - 1]);
        const cx = (px + x) / 2;
        d += `C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
      }
    });
    return d;
  };

  const ordered = useMemo(() => {
    const muted = series.filter((s) => !slots.has(s.id));
    const hi = series.filter((s) => slots.has(s.id)).sort((a, b) => (slots.get(b.id) ?? 0) - (slots.get(a.id) ?? 0));
    const all = [...muted, ...hi];
    if (on) {
      const i = all.findIndex((s) => s.id === on);
      if (i >= 0) all.push(all.splice(i, 1)[0]);
    }
    return all;
  }, [series, slots, on]);

  const every = Math.max(1, Math.ceil(R / Math.max(2, Math.floor(pw / 34))));
  const tipSeries = tip ? series.find((s) => s.id === tip.id) : null;

  const stats = (s: BumpSeries) => ({
    now: s.ranks[s.ranks.length - 1],
    best: Math.min(...s.ranks),
    worst: Math.max(...s.ranks),
  });

  return (
    <>
      <div className={`an-chart${drawn ? " drawn" : ""}`} ref={ref} onPointerLeave={() => (setActive(null), setTip(null))}>
        {width > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="an-svg" role="group" aria-label={t("League position after each matchday")}>
            {Array.from({ length: R }, (_, i) =>
              i % every === 0 || i === R - 1 ? (
                <g key={i}>
                  <line className="an-grid" x1={sx(i)} x2={sx(i)} y1={m.t - 4} y2={m.t + plotH + 4} />
                  <text className="an-tick" x={sx(i)} y={H - 26} textAnchor="middle">
                    {fmtNum(i + 1)}
                  </text>
                </g>
              ) : null,
            )}
            {ordered.map((s) => {
              const slot = slots.get(s.id);
              const isOn = on === s.id;
              const dim = !!on && !isOn;
              return (
                <g key={s.id}>
                  <path
                    className={`an-line bump${slot === undefined ? " muted" : ""}${isOn ? " on" : ""}${dim ? " dim" : ""}`}
                    d={path(s.ranks)}
                    pathLength={1}
                    style={{ stroke: isOn && slot === undefined ? "var(--ink-2)" : slotColor(slot) }}
                  />
                  <path
                    className="an-line-hit"
                    d={path(s.ranks)}
                    onPointerEnter={() => setActive(s.id)}
                    onPointerMove={(e) => {
                      const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                      const x = ((e.clientX - box.left) / box.width) * W;
                      const i = Math.max(0, Math.min(s.ranks.length - 1, Math.round(((x - m.l) / Math.max(1, pw)) * (R - 1))));
                      setTip({ id: s.id, r: i });
                    }}
                    onClick={() => setPinned((p) => (p === s.id ? null : s.id))}
                  />
                  {isOn &&
                    s.ranks.map((r, i) => (
                      <circle key={i} cx={sx(i)} cy={sy(r)} r={3} className="an-ring" style={{ fill: slotColor(slot) === "var(--an-muted)" ? "var(--ink-2)" : slotColor(slot) }} />
                    ))}
                </g>
              );
            })}
            {series.map((s) => {
              const first = s.ranks[0];
              const last = s.ranks[s.ranks.length - 1];
              const dim = !!on && on !== s.id;
              return (
                <g key={`c${s.id}`} className={`an-end${dim ? " dim" : ""}`}>
                  <text className="an-rank" x={m.l - crest - 14} y={sy(first) + 4} textAnchor="end">
                    {first}
                  </text>
                  <image href={sized(s.logo, 64)} x={m.l - crest - 8} y={sy(first) - crest / 2} width={crest} height={crest} />
                  <g
                    className="an-crestbtn"
                    tabIndex={0}
                    role="link"
                    aria-label={t("{club}: position {now}, best {best}, worst {worst}", { club: s.name, ...stats(s) })}
                    onFocus={() => (setActive(s.id), setTip({ id: s.id, r: s.ranks.length - 1 }))}
                    onBlur={() => (setActive(null), setTip(null))}
                    onPointerEnter={() => (setActive(s.id), setTip({ id: s.id, r: s.ranks.length - 1 }))}
                    onPointerLeave={() => setActive(null)}
                    onClick={() => nav(`/team/${league}/${s.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && nav(`/team/${league}/${s.id}`)}
                  >
                    <rect x={sx(s.ranks.length - 1) + 4} y={sy(last) - row / 2} width={crest + 30} height={row} fill="transparent" />
                    <image href={sized(s.logo, 64)} x={sx(s.ranks.length - 1) + 8} y={sy(last) - crest / 2} width={crest} height={crest} />
                    <text className="an-rank" x={sx(s.ranks.length - 1) + crest + 14} y={sy(last) + 4}>
                      {last}
                    </text>
                  </g>
                </g>
              );
            })}
            <text className="an-axis-title" x={m.l + pw / 2} y={H - 4} textAnchor="middle">
              {t("Matchday")} →
            </text>
          </svg>
        )}
        {tipSeries && width > 0 && (
          <Tip x={sx(tip!.r)} y={sy(tipSeries.ranks[tip!.r])} width={W} below={sy(tipSeries.ranks[tip!.r]) < 120}>
            <div className="tt-head">
              {tipSeries.name}
            </div>
            <TipRow
              label={roundDates[tip!.r] ? t("Matchday {n} · {date}", { n: tip!.r + 1, date: fmtDayShort(roundDates[tip!.r]) }) : t("Matchday {n}", { n: tip!.r + 1 })}
              value={fmtNum(tipSeries.ranks[tip!.r])}
            />
            <TipRow label={t("Best")} value={fmtNum(stats(tipSeries).best)} />
            <TipRow label={t("Worst")} value={fmtNum(stats(tipSeries).worst)} />
          </Tip>
        )}
      </div>
      <DataTable
        caption={t("League position after each matchday")}
        columns={[{ label: t("Club") }, ...Array.from({ length: R }, (_, i) => ({ label: t("MD{n}", { n: i + 1 }) }))]}
        rows={[...series]
          .sort((a, b) => a.ranks[a.ranks.length - 1] - b.ranks[b.ranks.length - 1])
          .map((s) => [<Link to={`/team/${league}/${s.id}`}>{s.name}</Link>, ...s.ranks.map((r) => fmtNum(r))])}
      />
    </>
  );
}
