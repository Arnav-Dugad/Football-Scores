import { Fragment, useState, type CSSProperties, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import type { Zone } from "../../lib/analytics";
import { fmtDayShort, fmtNum, fmtPct } from "../../lib/format";
import { Crest } from "../ui";
import { DataTable, HEAT_LEGEND, Tip, TipRow, heatClass, useChartBox } from "./core";

/* ----------------------------------------------------------- sparkline -- */

/** De-emphasised trend line with the current value as an accent dot. */
export function Sparkline({ values, width = 96, height = 28, label }: { values: number[]; width?: number; height?: number; label: string }) {
  if (values.length < 2) return <span className="an-spark-empty" aria-hidden />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => 3 + (1 - (v - lo) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values[values.length - 1];
  return (
    <svg className="an-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} pathLength={1} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={3} />
    </svg>
  );
}

/* ------------------------------------------------- projection heatmap -- */

export interface HeatTeam {
  id: string;
  name: string;
  short: string;
  logo: string;
  positions: number[];
  expRank: number;
}

/** Finishing-position probabilities: one row per club, one column per place. */
export function ProjectionHeatmap({ teams, zones, league }: { teams: HeatTeam[]; zones: Zone[]; league: string }) {
  const { ref, width, drawn } = useChartBox();
  const [tip, setTip] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const n = teams.length;
  const narrow = width < 560;
  const labelW = narrow ? 44 : 150;
  const cell = Math.max(narrow ? 18 : 20, Math.min(48, Math.floor((width - labelW - 12 - 2 * n) / Math.max(1, n))));
  const showText = cell >= 28;
  const every = cell >= 22 ? 1 : cell >= 16 ? 2 : 5;
  const zoneAt = (pos: number) => zones.find((z) => pos >= z.from && pos <= z.to);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
    const host = e.currentTarget.getBoundingClientRect();
    if (!el) return setTip(null);
    const b = el.getBoundingClientRect();
    setTip({ r: Number(el.dataset.r), c: Number(el.dataset.c), x: b.left - host.left + b.width / 2, y: b.top - host.top });
  };

  const tipTeam = tip ? teams[tip.r] : null;
  const best = (tm: HeatTeam) => tm.positions.reduce((bi, p, i, a) => (p > a[bi] ? i : bi), 0);

  return (
    <>
      <div className="an-scale" aria-hidden>
        <span>{t("Less likely")}</span>
        {HEAT_LEGEND.map((b, i) => (
          <span key={b} className={`an-scale-sw h${i + 1}`} title={`≥ ${fmtPct(b, b < 0.01 ? 1 : 0)}`} />
        ))}
        <span>{t("More likely")}</span>
      </div>
      <div className={`an-chart an-heat-wrap${drawn ? " drawn" : ""}`} ref={ref}>
        <div className="an-scroll">
          <div
            className="an-heat"
            dir="ltr"
            style={{ gridTemplateColumns: `${labelW}px repeat(${n}, ${cell}px)`, "--cell": `${cell}px` } as CSSProperties}
            onPointerMove={onMove}
            onPointerLeave={() => setTip(null)}
          >
            <div className="an-heat-corner subtle">{t("Pos")}</div>
            {teams.map((_, c) => {
              const z = zoneAt(c + 1);
              return (
                <div key={c} className="an-heat-col num" style={z ? ({ "--z": z.color } as CSSProperties) : undefined}>
                  {(c + 1) % every === 0 || c === 0 ? c + 1 : ""}
                </div>
              );
            })}
            {teams.map((tm, r) => (
              renderRow({ tm, r, narrow, league, best: best(tm), showText, onFocusRow: (x: number, y: number) => setTip({ r, c: best(tm), x, y }), onBlurRow: () => setTip(null) })
            ))}
          </div>
        </div>
        {tip && tipTeam && (
          <Tip x={tip.x} y={tip.y} width={width}>
            <div className="tt-head">
              <Crest src={tipTeam.logo} size={18} alt="" />
              {tipTeam.name}
            </div>
            <TipRow label={t("Finish {pos}", { pos: tip.c + 1 })} value={fmtPct(tipTeam.positions[tip.c], tipTeam.positions[tip.c] < 0.01 && tipTeam.positions[tip.c] > 0 ? 1 : 0)} />
            {zoneAt(tip.c + 1) && <div className="an-tip-sub">{zoneAt(tip.c + 1)!.label}</div>}
            <TipRow label={t("Average finish")} value={fmtNum(tipTeam.expRank, 1)} />
          </Tip>
        )}
      </div>
      <DataTable
        caption={t("Finishing position probabilities")}
        columns={[{ label: t("Club") }, ...teams.map((_, i) => ({ label: String(i + 1) }))]}
        rows={teams.map((tm) => [tm.name, ...tm.positions.map((p) => (p >= 0.0005 ? fmtPct(p, p < 0.01 ? 1 : 0) : "–"))])}
      />
    </>
  );

  function renderRow({
    tm,
    r,
    narrow,
    league,
    best,
    showText,
    onFocusRow,
    onBlurRow,
  }: {
    tm: HeatTeam;
    r: number;
    narrow: boolean;
    league: string;
    best: number;
    showText: boolean;
    onFocusRow: (x: number, y: number) => void;
    onBlurRow: () => void;
  }) {
    return (
      <Fragment key={tm.id}>
        <Link
          to={`/team/${league}/${tm.id}`}
          className="an-heat-label"
          aria-label={t("{club}: most likely to finish {pos} ({p}), average finish {avg}", {
            club: tm.name,
            pos: best + 1,
            p: fmtPct(tm.positions[best]),
            avg: fmtNum(tm.expRank, 1),
          })}
          onFocus={(e) => {
            const host = (e.currentTarget.closest(".an-heat-wrap") as HTMLElement).getBoundingClientRect();
            const b = e.currentTarget.getBoundingClientRect();
            onFocusRow(b.right - host.left + (best + 0.5) * cell, b.top - host.top);
          }}
          onBlur={onBlurRow}
        >
          <Crest src={tm.logo} size={20} alt="" />
          {!narrow && <span>{tm.short}</span>}
        </Link>
        {tm.positions.map((p, c) => {
          const k = heatClass(p);
          return (
            <div key={c} className={`an-cell h${k}`} data-r={r} data-c={c} style={{ "--d": `${Math.min(r * 12 + c * 4, 600)}ms` } as CSSProperties}>
              {showText && p >= 0.1 ? Math.round(p * 100) : ""}
            </div>
          );
        })}
      </Fragment>
    );
  }
}

/* ---------------------------------------------- fixture difficulty ----- */

export interface FdxCell {
  matchId: string;
  opp: { id: string; name: string; short: string; logo: string };
  home: boolean;
  difficulty: number;
  winProb: number;
  date: string;
}

export interface FdxRow {
  id: string;
  name: string;
  short: string;
  logo: string;
  avg: number | null;
  cells: FdxCell[];
}

export function DifficultyGrid({ rows, league, cols = 5 }: { rows: FdxRow[]; league: string; cols?: number }) {
  const { ref, width, drawn } = useChartBox();
  const [tip, setTip] = useState<{ r: string; c: number; x: number; y: number } | null>(null);
  const narrow = width < 560;
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
    const host = e.currentTarget.getBoundingClientRect();
    if (!el) return setTip(null);
    const b = el.getBoundingClientRect();
    setTip({ r: el.dataset.r!, c: Number(el.dataset.c), x: b.left - host.left + b.width / 2, y: b.top - host.top });
  };
  const tr = tip ? rows.find((r) => r.id === tip.r) : null;
  const tc = tr && tip ? tr.cells[tip.c] : null;
  const ha = (home: boolean) => (home ? t("H") : t("A"));

  return (
    <>
      <div className="an-scale" aria-hidden>
        <span>{t("Easier")}</span>
        {[1, 2, 3, 4, 5].map((d) => (
          <span key={d} className={`an-scale-sw d${d}`}>
            {d}
          </span>
        ))}
        <span>{t("Harder")}</span>
      </div>
      <div className={`an-chart${drawn ? " drawn" : ""}`} ref={ref} onPointerLeave={() => setTip(null)}>
        <div className="an-scroll">
          <div className="an-fdx" style={{ gridTemplateColumns: `${narrow ? 44 : 170}px repeat(${cols}, minmax(${narrow ? 56 : 76}px, 1fr)) ${narrow ? 40 : 56}px` }} onPointerMove={onMove}>
            <div className="an-fdx-h subtle">{t("Club")}</div>
            {Array.from({ length: cols }, (_, i) => (
              <div key={i} className="an-fdx-h subtle">
                {t("Next {n}", { n: i + 1 })}
              </div>
            ))}
            <div className="an-fdx-h subtle">{t("Avg")}</div>
            {rows.map((r, ri) => (
              fdxLine(r, ri)
            ))}
          </div>
        </div>
        {tr && tc && tip && (
          <Tip x={tip.x} y={tip.y} width={width}>
            <div className="tt-head">
              <Crest src={tr.logo} size={18} alt="" />
              {tr.short} {tc.home ? t("vs") : t("at")} {tc.opp.short}
            </div>
            <div className="an-tip-sub">{fmtDayShort(tc.date)}</div>
            <TipRow label={t("Difficulty")} value={`${tc.difficulty} / 5`} />
            <TipRow label={t("Win probability")} value={fmtPct(tc.winProb)} />
          </Tip>
        )}
      </div>
      <DataTable
        columns={[{ label: t("Club") }, ...Array.from({ length: cols }, (_, i) => ({ label: t("Next {n}", { n: i + 1 }), num: false })), { label: t("Avg") }]}
        rows={rows.map((r) => [
          r.name,
          ...Array.from({ length: cols }, (_, i) => {
            const c = r.cells[i];
            return c ? `${c.opp.short} (${ha(c.home)}) · ${c.difficulty}` : "–";
          }),
          r.avg === null ? "–" : fmtNum(r.avg, 1),
        ])}
      />
    </>
  );

  function fdxLine(r: FdxRow, ri: number) {
    return (
      <Fragment key={r.id}>
        <Link to={`/team/${league}/${r.id}`} className="an-fdx-club" aria-label={r.name}>
          <Crest src={r.logo} size={22} alt="" />
          {!narrow && <span>{r.short}</span>}
        </Link>
        {Array.from({ length: cols }, (_, c) => {
          const f = r.cells[c];
          if (!f) return <div key={c} className="an-fdx-cell empty" aria-hidden />;
          return (
            <Link
              key={c}
              to={`/match/${league}/${f.matchId}`}
              className={`an-fdx-cell d${f.difficulty}`}
              data-r={r.id}
              data-c={c}
              style={{ "--d": `${Math.min(ri * 14 + c * 30, 700)}ms` } as CSSProperties}
              aria-label={t("{club} {ha} {opp}: difficulty {d} of 5, win probability {p}", {
                club: r.short,
                ha: f.home ? t("vs") : t("at"),
                opp: f.opp.name,
                d: f.difficulty,
                p: fmtPct(f.winProb),
              })}
              onFocus={(e) => {
                const host = (e.currentTarget.closest(".an-chart") as HTMLElement).getBoundingClientRect();
                const b = e.currentTarget.getBoundingClientRect();
                setTip({ r: r.id, c, x: b.left - host.left + b.width / 2, y: b.top - host.top });
              }}
              onBlur={() => setTip(null)}
            >
              <span className="an-fdx-crest">
                <Crest src={f.opp.logo} size={narrow ? 16 : 18} alt="" />
              </span>
              <span className="an-fdx-meta">
                <b>{ha(f.home)}</b>
                <span className="num">{f.difficulty}</span>
              </span>
            </Link>
          );
        })}
        <div className="an-fdx-avg num">{r.avg === null ? "–" : fmtNum(r.avg, 1)}</div>
      </Fragment>
    );
  }
}
