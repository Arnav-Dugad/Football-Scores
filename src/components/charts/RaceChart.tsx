import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { sized } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { DataTable, Legend, Tip, TipRow, dodge, niceMax, niceTicks, slotColor, useChartBox } from "./core";

export interface RaceSeries {
  id: string;
  name: string;
  short: string;
  logo: string;
  /** pts[n] = cumulative points after n games (pts[0] = 0). */
  pts: number[];
}

/**
 * Title race — cumulative points against games played. Top clubs and followed
 * clubs wear fixed categorical slots; everyone else is a thin muted line.
 * Crosshair + tooltip list every club at the hovered game.
 */
export function RaceChart({ series, slots, league }: { series: RaceSeries[]; slots: Map<string, number>; league: string }) {
  const { ref, width, drawn } = useChartBox();
  const [focus, setFocus] = useState<string | null>(null);
  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [game, setGame] = useState<number | null>(null);

  const n = series.length;
  const maxN = Math.max(1, ...series.map((s) => s.pts.length - 1));
  const maxPts = niceMax(Math.max(3, ...series.map((s) => s.pts[s.pts.length - 1] ?? 0)));
  const crest = n > 24 ? 14 : 18;
  const gap = crest + 2;
  const W = Math.max(280, width);
  const compact = W < 520;
  const m = { t: 14, r: crest + 22, b: 34, l: compact ? 30 : 38 };
  const plotH = Math.max(compact ? 260 : 320, Math.min(560, n * gap));
  const H = plotH + m.t + m.b;
  const pw = W - m.l - m.r;
  const sx = (g: number) => m.l + (g / maxN) * pw;
  const sy = (p: number) => m.t + plotH - (p / maxPts) * plotH;

  const active = hoverTeam ?? focus;
  const order = useMemo(() => {
    // Muted first, highlighted on top in slot order, the active club last.
    const muted = series.filter((s) => !slots.has(s.id));
    const hi = series.filter((s) => slots.has(s.id)).sort((a, b) => (slots.get(b.id) ?? 0) - (slots.get(a.id) ?? 0));
    const all = [...muted, ...hi];
    if (active) {
      const i = all.findIndex((s) => s.id === active);
      if (i >= 0) all.push(all.splice(i, 1)[0]);
    }
    return all;
  }, [series, slots, active]);

  const ends = useMemo(() => {
    const ys = series.map((s) => sy(s.pts[s.pts.length - 1] ?? 0));
    const placed = dodge(ys, gap, m.t + crest / 2, m.t + plotH - crest / 2);
    return new Map(series.map((s, i) => [s.id, { y0: ys[i], y: placed[i], x0: sx(s.pts.length - 1) }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, W, plotH, maxPts, maxN]);

  const path = (s: RaceSeries) => s.pts.map((p, g) => `${g ? "L" : "M"}${sx(g).toFixed(1)},${sy(p).toFixed(1)}`).join("");

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    setGame(Math.max(0, Math.min(maxN, Math.round(((x - m.l) / pw) * maxN))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setGame((g) => Math.max(0, Math.min(maxN, (g ?? maxN) + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Home") setGame(0);
    else if (e.key === "End") setGame(maxN);
    else if (e.key === "Escape") setGame(null);
  };

  const xt = niceTicks(0, maxN, compact ? 4 : 8).filter((v) => Number.isInteger(v));
  const yt = niceTicks(0, maxPts, 5);

  const atGame =
    game === null
      ? []
      : series
          .filter((s) => s.pts.length - 1 >= game)
          .map((s) => ({ s, p: s.pts[game] }))
          .sort((a, b) => b.p - a.p || a.s.name.localeCompare(b.s.name));

  const toggle = (id: string) => setFocus((f) => (f === id ? null : id));
  const legendItems = series
    .filter((s) => slots.has(s.id))
    .sort((a, b) => (slots.get(a.id) ?? 0) - (slots.get(b.id) ?? 0))
    .map((s) => ({
      key: s.id,
      label: s.short,
      color: slotColor(slots.get(s.id)),
      kind: "line" as const,
      logo: s.logo,
      active: focus === s.id,
      dim: !!active && active !== s.id,
    }));

  const step = maxN > 20 ? 5 : maxN > 10 ? 2 : 1;
  const marks: number[] = [];
  for (let g = step; g < maxN; g += step) marks.push(g);
  marks.push(maxN);

  return (
    <>
      <Legend items={legendItems} onToggle={toggle} onHover={setHoverTeam} label={t("Highlighted clubs")} />
      <div className={`an-chart${drawn ? " drawn" : ""}`} ref={ref} onPointerLeave={() => setGame(null)}>
        {width > 0 && (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            tabIndex={0}
            role="img"
            aria-label={t("Cumulative points by games played. Use the arrow keys to move between games.")}
            onKeyDown={onKey}
            onFocus={() => setGame((g) => g ?? maxN)}
            onBlur={() => setGame(null)}
            className="an-svg"
          >
            {yt.map((v) => (
              <g key={`y${v}`}>
                <line className={v === 0 ? "an-base" : "an-grid"} x1={m.l} x2={m.l + pw} y1={sy(v)} y2={sy(v)} />
                <text className="an-tick" x={m.l - 8} y={sy(v) + 4} textAnchor="end">
                  {fmtNum(v)}
                </text>
              </g>
            ))}
            {xt.map((v) => (
              <text key={`x${v}`} className="an-tick" x={sx(v)} y={m.t + plotH + 18} textAnchor="middle">
                {fmtNum(v)}
              </text>
            ))}
            <text className="an-axis-title" x={m.l + pw} y={H - 2} textAnchor="end">
              {t("Games played")} →
            </text>

            {order.map((s) => {
              const slot = slots.get(s.id);
              const on = active === s.id;
              const dim = !!active && !on;
              return (
                <path
                  key={s.id}
                  className={`an-line${slot === undefined ? " muted" : ""}${on ? " on" : ""}${dim ? " dim" : ""}`}
                  d={path(s)}
                  pathLength={1}
                  style={{ stroke: on && slot === undefined ? "var(--ink-2)" : slotColor(slot) }}
                />
              );
            })}

            {/* end crests with leader lines, all clickable */}
            {series.map((s) => {
              const e = ends.get(s.id)!;
              const on = active === s.id;
              const dim = !!active && !on;
              const x = m.l + pw + 12;
              return (
                <g key={`e${s.id}`} className={`an-end${dim ? " dim" : ""}${on ? " on" : ""}`}>
                  <path className="an-leader" d={`M${e.x0},${e.y0} L${x - 3},${e.y}`} />
                  <circle cx={e.x0} cy={e.y0} r={slots.has(s.id) || on ? 3.5 : 2} className="an-enddot" style={{ fill: slotColor(slots.get(s.id)) }} />
                  <g
                    className="an-crestbtn"
                    tabIndex={0}
                    onClick={() => toggle(s.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        toggle(s.id);
                      }
                    }}
                    onPointerEnter={() => setHoverTeam(s.id)}
                    onPointerLeave={() => setHoverTeam(null)}
                    onFocus={() => setHoverTeam(s.id)}
                    onBlur={() => setHoverTeam(null)}
                    aria-label={t("{club}: {pts} points. Activate to highlight.", { club: s.name, pts: s.pts[s.pts.length - 1] ?? 0 })}
                    role="button"
                    aria-pressed={focus === s.id}
                  >
                    <rect x={x - 2} y={e.y - crest / 2 - 1} width={crest + 4} height={crest + 2} fill="transparent" />
                    <image href={sized(s.logo, 64)} x={x} y={e.y - crest / 2} width={crest} height={crest} />
                  </g>
                </g>
              );
            })}

            {game !== null && (
              <g className="an-cross" pointerEvents="none">
                <line x1={sx(game)} x2={sx(game)} y1={m.t} y2={m.t + plotH} />
                {series
                  .filter((s) => (slots.has(s.id) || active === s.id) && s.pts.length - 1 >= game)
                  .map((s) => (
                    <circle key={s.id} cx={sx(game)} cy={sy(s.pts[game])} r={4} style={{ fill: slotColor(slots.get(s.id)) }} className="an-ring" />
                  ))}
              </g>
            )}
            <rect
              className="an-hit"
              x={m.l}
              y={m.t}
              width={pw}
              height={plotH}
              onPointerMove={pick}
              onPointerDown={pick}
            />
          </svg>
        )}
        {game !== null && width > 0 && (
          <Tip x={sx(game)} y={m.t + 4} width={W} below wide>
            <div className="tt-head">{t("After {n} games", { n: game })}</div>
            <div className={`an-tip-grid${atGame.length > 12 ? " two" : ""}`}>
              {atGame.map(({ s, p }) => (
                <TipRow
                  key={s.id}
                  value={fmtNum(p)}
                  label={s.short}
                  logo={s.logo}
                  color={slots.has(s.id) ? slotColor(slots.get(s.id)) : undefined}
                />
              ))}
            </div>
          </Tip>
        )}
      </div>
      <DataTable
        caption={t("Points after each block of games")}
        columns={[{ label: t("Club") }, ...marks.map((g) => ({ label: t("G{n}", { n: g }) }))]}
        rows={[...series]
          .sort((a, b) => (b.pts[b.pts.length - 1] ?? 0) - (a.pts[a.pts.length - 1] ?? 0))
          .map((s) => [
            <Link to={`/team/${league}/${s.id}`}>{s.name}</Link>,
            ...marks.map((g) => (s.pts.length - 1 >= g ? fmtNum(s.pts[g]) : "–")),
          ])}
      />
    </>
  );
}
