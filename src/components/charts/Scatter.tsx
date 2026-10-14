import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../../i18n";
import { sized } from "../../lib/api";
import { fmtNum, lastName } from "../../lib/format";
import { PlayerAvatar } from "../ui";
import { DataTable, Tip, TipRow, niceTicks, useChartBox } from "./core";

export interface ScatterPoint {
  id: string;
  name: string;
  logo?: string;
  x: number;
  y: number;
  /** Tooltip rows after the two axis values. */
  extra?: { label: string; value: string }[];
}

function extent(vals: number[], floor0: boolean): [number, number] {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, 0.5);
  return [floor0 ? Math.max(0, lo - span * 0.12) : lo - span * 0.12, hi + span * 0.12];
}

const median = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/* ------------------------------------------------------ crest scatter -- */

/**
 * Club crests as marks. `invertY` puts low values at the top (for "fewer
 * conceded is better"), with median guides and quadrant captions.
 */
export function CrestScatter({
  points,
  xLabel,
  yLabel,
  invertY,
  quadrants,
  league,
  digits = 2,
  tableLabels,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  invertY?: boolean;
  /** [top-right, top-left, bottom-right, bottom-left] */
  quadrants?: [string, string, string, string];
  league: string;
  digits?: number;
  tableLabels: [string, string];
}) {
  const nav = useNavigate();
  const { ref, width, drawn } = useChartBox();
  const [hover, setHover] = useState<string | null>(null);
  const W = Math.max(280, width);
  const compact = W < 520;
  const H = Math.round(Math.min(520, Math.max(320, W * 0.62)));
  const m = { t: 20, r: 18, b: 44, l: compact ? 40 : 52 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = extent(xs, true);
  const [y0, y1] = extent(ys, true);
  const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const syRaw = (v: number) => ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const sy = (v: number) => (invertY ? m.t + syRaw(v) : H - m.b - syRaw(v));
  const mx = median(xs);
  const my = median(ys);
  const size = points.length > 24 ? (compact ? 20 : 24) : compact ? 24 : 30;
  const hp = points.find((p) => p.id === hover) ?? null;
  const fmt = (v: number) => fmtNum(v, digits);

  return (
    <>
      <div className={`an-chart${drawn ? " drawn" : ""}`} ref={ref} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="an-svg" role="group" aria-label={`${xLabel} · ${yLabel}`}>
            {niceTicks(x0, x1, compact ? 4 : 6).map((v) => (
              <g key={`x${v}`}>
                <line className="an-grid" x1={sx(v)} x2={sx(v)} y1={m.t} y2={H - m.b} />
                <text className="an-tick" x={sx(v)} y={H - m.b + 18} textAnchor="middle">
                  {fmtNum(v, v % 1 ? (Math.round(v * 10) === v * 10 ? 1 : 2) : 0)}
                </text>
              </g>
            ))}
            {niceTicks(y0, y1, 5).map((v) => (
              <g key={`y${v}`}>
                <line className="an-grid" x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} />
                <text className="an-tick" x={m.l - 8} y={sy(v) + 4} textAnchor="end">
                  {fmtNum(v, v % 1 ? (Math.round(v * 10) === v * 10 ? 1 : 2) : 0)}
                </text>
              </g>
            ))}
            <line className="an-median" x1={sx(mx)} x2={sx(mx)} y1={m.t} y2={H - m.b} />
            <line className="an-median" x1={m.l} x2={W - m.r} y1={sy(my)} y2={sy(my)} />
            {quadrants && !compact && (
              <>
                <text className="an-quad" x={W - m.r - 8} y={m.t + 14} textAnchor="end">
                  {quadrants[0]}
                </text>
                <text className="an-quad" x={m.l + 8} y={m.t + 14}>
                  {quadrants[1]}
                </text>
                <text className="an-quad" x={W - m.r - 8} y={H - m.b - 10} textAnchor="end">
                  {quadrants[2]}
                </text>
                <text className="an-quad" x={m.l + 8} y={H - m.b - 10}>
                  {quadrants[3]}
                </text>
              </>
            )}
            <text className="an-axis-title" x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
              {xLabel} →
            </text>
            <text className="an-axis-title" transform={`translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">
              {invertY ? `← ${yLabel}` : `${yLabel} →`}
            </text>
            {points.map((p, i) => (
              <g
                key={p.id}
                className={`an-mark${hover === p.id ? " on" : hover ? " dim" : ""}`}
                style={{ transitionDelay: `${Math.min(i, 30) * 14}ms` }}
                tabIndex={0}
                role="link"
                aria-label={`${p.name}: ${xLabel} ${fmt(p.x)}, ${yLabel} ${fmt(p.y)}`}
                onPointerEnter={() => setHover(p.id)}
                onFocus={() => setHover(p.id)}
                onBlur={() => setHover(null)}
                onClick={() => nav(`/team/${league}/${p.id}`)}
                onKeyDown={(e) => e.key === "Enter" && nav(`/team/${league}/${p.id}`)}
              >
                <circle cx={sx(p.x)} cy={sy(p.y)} r={Math.max(14, size / 2 + 4)} fill="transparent" />
                <image
                  className="an-crestmark"
                  href={sized(p.logo, 64)}
                  x={sx(p.x) - size / 2}
                  y={sy(p.y) - size / 2}
                  width={size}
                  height={size}
                />
              </g>
            ))}
          </svg>
        )}
        {hp && width > 0 && (
          <Tip x={sx(hp.x)} y={sy(hp.y) - size / 2} width={W} below={sy(hp.y) < 130}>
            <div className="tt-head">{hp.name}</div>
            <TipRow label={xLabel} value={fmt(hp.x)} />
            <TipRow label={yLabel} value={fmt(hp.y)} />
            {hp.extra?.map((r) => <TipRow key={r.label} label={r.label} value={r.value} />)}
          </Tip>
        )}
      </div>
      <DataTable
        columns={[{ label: t("Club") }, { label: tableLabels[0] }, { label: tableLabels[1] }, ...(points[0]?.extra ?? []).map((e) => ({ label: e.label }))]}
        rows={[...points]
          .sort((a, b) => b.x - a.x)
          .map((p) => [<Link to={`/team/${league}/${p.id}`}>{p.name}</Link>, fmt(p.x), fmt(p.y), ...(p.extra ?? []).map((e) => e.value)])}
      />
    </>
  );
}

/* ----------------------------------------------------- player scatter -- */

export interface PlayerPoint {
  id: string;
  name: string;
  team: string;
  teamName: string;
  logo: string;
  color?: string | null;
  g: number;
  a: number;
  apps: number;
  xg: number | null;
}

/**
 * Goals against assists with player photos as marks. Ties are fanned out in
 * a small ring so every face stays visible; the leaders carry a name label.
 */
export function PlayerScatter({ players, league, footer }: { players: PlayerPoint[]; league: string; footer?: ReactNode }) {
  const { ref, width, drawn } = useChartBox();
  const [hover, setHover] = useState<string | null>(null);
  const W = Math.max(280, width);
  const compact = W < 520;
  const H = Math.round(Math.min(560, Math.max(340, W * 0.66)));
  const m = { t: 24, r: 24, b: 44, l: compact ? 34 : 44 };
  const gx = Math.max(1, ...players.map((p) => p.g));
  const ay = Math.max(1, ...players.map((p) => p.a));
  const x1 = Math.ceil(gx * 1.08 + 0.5);
  const y1 = Math.ceil(ay * 1.1 + 0.5);
  const sx = (v: number) => m.l + (v / x1) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - (v / y1) * (H - m.t - m.b);
  const av = compact ? 26 : 34;

  const placed = useMemo(() => {
    const groups = new Map<string, PlayerPoint[]>();
    for (const p of players) {
      const k = `${p.g}|${p.a}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const out: { p: PlayerPoint; x: number; y: number }[] = [];
    for (const list of groups.values()) {
      list.forEach((p, i) => {
        const cx = sx(p.g);
        const cy = sy(p.a);
        if (list.length === 1) return out.push({ p, x: cx, y: cy });
        const ring = Math.floor(i / 6);
        const k = i % 6;
        const rr = (av * 0.5 + 2) * (ring + 1);
        const ang = (k / Math.min(6, list.length - ring * 6)) * Math.PI * 2 + ring * 0.5;
        out.push({ p, x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr });
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, W, H]);

  const leaders = new Set(
    [...players]
      .sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g)
      .slice(0, compact ? 3 : 5)
      .map((p) => p.id),
  );
  const hp = placed.find((d) => d.p.id === hover) ?? null;

  return (
    <>
      <div className={`an-chart an-pscatter${drawn ? " drawn" : ""}`} ref={ref} onPointerLeave={() => setHover(null)} style={{ height: width ? H : 340 }}>
        {width > 0 && (
          <>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="an-svg" aria-hidden>
              {niceTicks(0, x1, compact ? 4 : 8)
                .filter(Number.isInteger)
                .map((v) => (
                  <g key={`x${v}`}>
                    <line className={v === 0 ? "an-base" : "an-grid"} x1={sx(v)} x2={sx(v)} y1={m.t} y2={H - m.b} />
                    <text className="an-tick" x={sx(v)} y={H - m.b + 18} textAnchor="middle">
                      {fmtNum(v)}
                    </text>
                  </g>
                ))}
              {niceTicks(0, y1, 5)
                .filter(Number.isInteger)
                .map((v) => (
                  <g key={`y${v}`}>
                    <line className={v === 0 ? "an-base" : "an-grid"} x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} />
                    <text className="an-tick" x={m.l - 8} y={sy(v) + 4} textAnchor="end">
                      {fmtNum(v)}
                    </text>
                  </g>
                ))}
              <text className="an-axis-title" x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
                {t("Goals")} →
              </text>
              <text className="an-axis-title" transform={`translate(11 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">
                {t("Assists")} →
              </text>
            </svg>
            <div className="an-marks" dir="ltr">
              {placed.map(({ p, x, y }, i) => (
                <Link
                  key={p.id}
                  to={`/player/${league}/${p.id}`}
                  className={`an-face${hover === p.id ? " on" : hover ? " dim" : ""}${leaders.has(p.id) ? " lead" : ""}`}
                  style={{ left: x, top: y, width: av, height: av, transitionDelay: `${Math.min(i, 40) * 12}ms` }}
                  onPointerEnter={() => setHover(p.id)}
                  onFocus={() => setHover(p.id)}
                  onBlur={() => setHover(null)}
                  aria-label={t("{name}, {team}: {g} goals, {a} assists", { name: p.name, team: p.teamName, g: p.g, a: p.a })}
                >
                  <PlayerAvatar name={p.name} team={p.teamName} size={av} color={p.color ?? "#5e5ce6"} />
                  {leaders.has(p.id) && <span className="an-face-label">{lastName(p.name)}</span>}
                </Link>
              ))}
            </div>
          </>
        )}
        {hp && width > 0 && (
          <Tip x={hp.x} y={hp.y - av / 2} width={W} below={hp.y < 140}>
            <div className="tt-head">{hp.p.name}</div>
            <div className="an-tip-sub">{hp.p.teamName}</div>
            <TipRow label={t("Goals")} value={fmtNum(hp.p.g)} />
            <TipRow label={t("Assists")} value={fmtNum(hp.p.a)} />
            <TipRow label={t("Appearances")} value={fmtNum(hp.p.apps)} />
            {hp.p.xg !== null && <TipRow label={t("xG")} value={fmtNum(hp.p.xg, 1)} />}
          </Tip>
        )}
      </div>
      {footer}
      <DataTable
        columns={[{ label: t("Player") }, { label: t("Club"), num: false }, { label: t("Goals") }, { label: t("Assists") }, { label: t("Apps") }]}
        rows={[...players]
          .sort((a, b) => b.g + b.a - (a.g + a.a))
          .map((p) => [<Link to={`/player/${league}/${p.id}`}>{p.name}</Link>, p.teamName, fmtNum(p.g), fmtNum(p.a), fmtNum(p.apps)])}
      />
    </>
  );
}
