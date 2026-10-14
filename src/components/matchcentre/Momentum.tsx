import { useId, useMemo, useState } from "react";
import { t } from "../../i18n";
import type { Match } from "../../lib/api";
import { fmtNum, fmtPct } from "../../lib/format";
import { useDrawIn } from "../../lib/motion";
import { IconBall } from "../Icons";
import { ChartTip, Legend, PatternDefs, seriesFill, ShowData, Swatch, TipRow, usePatterns, useRoving, useWidth } from "./charts";
import { parseClock, PERIOD_LEN, PERIOD_START, type MomentumBin, type SideKey } from "./data";

/* Momentum strip — attacking pressure per 5-minute window from located
   commentary plays. Home rises above the line, away hangs below it. */

const KIND_LABEL: Record<string, string> = {
  goal: "Goals",
  on: "Shots on target",
  off: "Shots off target",
  blocked: "Blocked shots",
  corner: "Corners",
  foul: "Free kicks won in the final third",
};

function binLabel(b: MomentumBin) {
  if (b.stoppage) return t("{min}+ (added time)", { min: `${PERIOD_START[b.period] + PERIOD_LEN[b.period]}'` });
  return `${b.from + 1}'–${b.to}'`;
}

function barPath(x: number, w: number, y0: number, h: number, up: boolean) {
  if (h <= 0.5) return "";
  const r = Math.min(4, w / 2, h);
  if (up) {
    const top = y0 - h;
    return `M${x} ${y0}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + w - r}Q${x + w} ${top} ${x + w} ${top + r}V${y0}Z`;
  }
  const bot = y0 + h;
  return `M${x} ${y0}V${bot - r}Q${x} ${bot} ${x + r} ${bot}H${x + w - r}Q${x + w} ${bot} ${x + w} ${bot - r}V${y0}Z`;
}

export function MomentumStrip({ bins, m }: { bins: MomentumBin[]; m: Match }) {
  const pid = useId().replace(/:/g, "");
  const patterns = usePatterns();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [drawRef, drawn] = useDrawIn<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const roving = useRoving(bins.length);
  const active = hover ?? roving.active;

  const max = useMemo(() => Math.max(4, ...bins.map((b) => Math.max(b.home, b.away))), [bins]);
  const total = bins.reduce((a, b) => a + b.home + b.away, 0);

  const H = 132;
  const y0 = H / 2;
  const amp = 40;
  const gapPeriod = 12;
  const periods = [...new Set(bins.map((b) => b.period))];
  const W = Math.max(280, width || 600);
  const slot = (W - gapPeriod * (periods.length - 1)) / Math.max(1, bins.length);
  const barW = Math.max(3, Math.min(24, slot * 0.64));

  const xs: number[] = [];
  let x = 0;
  let lastP = bins[0]?.period;
  const breaks: number[] = [];
  for (const b of bins) {
    if (b.period !== lastP) {
      breaks.push(x + gapPeriod / 2);
      x += gapPeriod;
      lastP = b.period;
    }
    xs.push(x);
    x += slot;
  }

  // The live window — everything after it hasn't happened yet.
  const now = m.state === "in" ? parseClock(m.clock) : null;
  const liveIndex = now
    ? bins.findIndex((b) => b.period === m.period && (b.stoppage ? now.added > 0 : !now.added && now.min > b.from && now.min <= b.to))
    : -1;

  const share = (list: MomentumBin[]) => {
    const h = list.reduce((a, b) => a + b.home, 0);
    const a = list.reduce((a, b) => a + b.away, 0);
    return h + a > 0 ? h / (h + a) : null;
  };
  const halves = periods.slice(0, 2).map((p) => share(bins.filter((b) => b.period === p)));
  const half = (s: number) =>
    s >= 0.5
      ? t("{team} had {pct} of the pressure", { team: m.home.short, pct: fmtPct(s) })
      : t("{team} had {pct} of the pressure", { team: m.away.short, pct: fmtPct(1 - s) });
  const summary = [
    halves[0] != null ? `${t("First half")}: ${half(halves[0])}.` : "",
    halves[1] != null ? `${t("Second half")}: ${half(halves[1])}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (total === 0) return null;

  const tipBin = active !== null ? bins[active] : null;
  const tipX = active !== null ? xs[active] + slot / 2 : 0;
  const tipY = tipBin ? Math.max(8, y0 - (tipBin.home / max) * amp - 12) : 0;

  const tickFor = (b: MomentumBin, i: number) => {
    if (b.stoppage) return null;
    const end = b.to;
    if (end % 15 === 0 && end !== PERIOD_START[b.period] + PERIOD_LEN[b.period]) return { x: xs[i] + slot, label: `${end}'` };
    return null;
  };

  return (
    <section className="panel glass mc-momentum" aria-labelledby={`${pid}-t`}>
      <div className="mc-panel-head">
        <p className="panel-title" id={`${pid}-t`}>
          {t("Momentum")}
        </p>
        <Legend
          items={[
            { key: "h", label: m.home.short, swatch: <Swatch side="home" /> },
            { key: "a", label: m.away.short, swatch: <Swatch side="away" /> },
          ]}
        />
      </div>
      <p className="sr-only">{summary}</p>
      <div
        className="chart mc-mom-chart"
        ref={(el) => {
          wrapRef.current = el;
          drawRef.current = el;
        }}
        dir="ltr"
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t("Momentum chart. {summary}", { summary })}
          tabIndex={0}
          onKeyDown={roving.onKeyDown}
          onBlur={roving.onBlur}
          onPointerLeave={() => setHover(null)}
          className={drawn ? "drawn" : ""}
        >
          {patterns && <PatternDefs id={pid} />}
          <line x1={0} x2={W} y1={y0} y2={y0} className="baseline" />
          {breaks.map((bx, i) => (
            <g key={i} className="mc-mom-break">
              <line x1={bx} x2={bx} y1={10} y2={H - 10} />
              <text x={bx} y={H - 1} textAnchor="middle" className="axis-label">
                {i === 0 ? t("HT") : i === 1 ? "90'" : t("ET")}
              </text>
            </g>
          ))}
          {bins.map((b, i) => {
            const tk = tickFor(b, i);
            return tk ? (
              <text key={`t${i}`} x={tk.x} y={H - 1} textAnchor="middle" className="axis-label">
                {tk.label}
              </text>
            ) : null;
          })}
          {bins.map((b, i) => {
            const bx = xs[i] + (slot - barW) / 2;
            const hh = (b.home / max) * amp;
            const ah = (b.away / max) * amp;
            const future = liveIndex >= 0 && (b.period > m.period || (b.period === m.period && i > liveIndex));
            return (
              <g key={i} className={`mc-mom-bin${active === i ? " on" : ""}${future ? " future" : ""}`}>
                {i === liveIndex && <rect x={xs[i] + 1} y={10} width={slot - 2} height={H - 30} rx={6} className="mc-mom-now" />}
                <path d={barPath(bx, barW, y0 - 1, hh, true)} style={{ fill: seriesFill("home", patterns, pid) }} className="bar up" />
                <path d={barPath(bx, barW, y0 + 1, ah, false)} style={{ fill: seriesFill("away", patterns, pid) }} className="bar down" />
                {b.goals.map((g, gi) => {
                  const up = g.side === "home";
                  const sameSide = b.goals.filter((x) => x.side === g.side).indexOf(g);
                  const gy = up ? y0 - hh - 18 - sameSide * 15 : y0 + ah + 4 + sameSide * 15;
                  return <IconBall key={gi} x={xs[i] + slot / 2 - 7} y={Math.max(0, Math.min(H - 30, gy))} width={14} height={14} className="mc-mom-goal" />;
                })}
                <rect
                  x={xs[i]}
                  y={0}
                  width={slot}
                  height={H - 14}
                  className="hit"
                  onPointerEnter={() => setHover(i)}
                  onPointerMove={() => setHover(i)}
                  onClick={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
        {tipBin && width > 0 && (
          <ChartTip x={tipX} y={tipY} width={W}>
            <div className="tt-head">{binLabel(tipBin)}</div>
            {(["home", "away"] as SideKey[]).map((s) => (
              <TipRow key={s} k={s === "home" ? m.home.short : m.away.short} v={fmtNum(tipBin[s], 1)} swatch={<Swatch side={s} shape="line" />} />
            ))}
            {tipBin.goals.map((g, i) => (
              <div key={i} className="tt-row mc-tip-goal">
                <span>
                  <IconBall width={12} height={12} /> {g.player ?? t("Goal")}
                </span>
                <b>{g.label}</b>
              </div>
            ))}
            <TipBreakdown bin={tipBin} />
          </ChartTip>
        )}
      </div>
      <p className="mc-foot">{t("Pressure index per five minutes: goal 5, shot on target 3, off target 1.5, blocked 1, corner 1, free kick won in the final third 0.5.")}</p>
      <ShowData
        caption={t("Momentum")}
        head={[t("Minutes"), m.home.short, m.away.short, t("Goals")]}
        rows={bins.map((b) => [
          binLabel(b),
          fmtNum(b.home, 1),
          fmtNum(b.away, 1),
          b.goals.map((g) => `${g.player ?? ""} ${g.label}`.trim()).join(", ") || "—",
        ])}
      />
    </section>
  );
}

function TipBreakdown({ bin }: { bin: MomentumBin }) {
  const any = (["home", "away"] as SideKey[]).some((s) => Object.entries(bin.counts[s]).some(([k, n]) => k !== "goal" && n));
  if (!any) return null;
  return (
    <div className="mc-tip-sub">
      {(["home", "away"] as SideKey[]).map((s) => {
        const items = Object.entries(bin.counts[s]).filter(([k, n]) => k !== "goal" && n);
        if (!items.length) return null;
        return (
          <div key={s} className="mc-tip-break">
            <Swatch side={s} shape="line" />
            {items.map(([k, n]) => `${t(KIND_LABEL[k])} ${fmtNum(n ?? 0)}`).join(" · ")}
          </div>
        );
      })}
    </div>
  );
}
