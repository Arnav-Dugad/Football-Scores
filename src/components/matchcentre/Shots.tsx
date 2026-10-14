import { useId, useMemo, useState } from "react";
import type { Shot } from "../../../shared/xg";
import { t } from "../../i18n";
import type { Match } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { useCountUp, useDrawIn } from "../../lib/motion";
import { Crest, Segmented } from "../ui";
import {
  ChartTip,
  Legend,
  PatternDefs,
  PitchLines,
  project,
  seriesFill,
  seriesVar,
  ShotGlyph,
  ShowData,
  Swatch,
  TipRow,
  useMedia,
  usePatterns,
  useRoving,
  useWidth,
  type SwatchShape,
} from "./charts";
import { parseClock, shotHeight, type Play, type SideKey, type TimeAxis } from "./data";

/* Shots tab: Pitch xG totals, shot map, cumulative xG, goal mouth and the
   action density map. */

const OUTCOME_LABEL: Record<Shot["outcome"], string> = {
  goal: "Goal",
  saved: "Saved",
  missed: "Off target",
  blocked: "Blocked",
  woodwork: "Hit the woodwork",
};
const BODY_LABEL: Record<Shot["body"], string> = { right: "Right foot", left: "Left foot", head: "Header", other: "Other" };
const SITUATION_LABEL: Record<Shot["situation"], string> = {
  open: "Open play",
  penalty: "Penalty",
  freekick: "Direct free kick",
  setpiece: "Set piece",
};

export function shapeOf(o: Shot["outcome"]): SwatchShape {
  return o === "goal" ? "goal" : o === "saved" ? "dot" : o === "blocked" ? "cross" : "hollow";
}

const sideName = (m: Match, s: SideKey) => (s === "home" ? m.home.short : m.away.short);

function ShotTip({ s, m }: { s: Shot; m: Match }) {
  return (
    <>
      <div className="mc-tip-value">
        <b>{fmtNum(s.xg, 2)}</b> <span>{t("xG")}</span>
      </div>
      <div className="tt-head">
        <Swatch side={s.side} shape={shapeOf(s.outcome)} />
        {s.player || sideName(m, s.side)}
      </div>
      <TipRow k={t("Minute")} v={s.minute || "—"} />
      <TipRow k={t("Outcome")} v={t(OUTCOME_LABEL[s.outcome])} />
      <TipRow k={t("Body part")} v={t(BODY_LABEL[s.body])} />
      <TipRow k={t("Situation")} v={t(SITUATION_LABEL[s.situation])} />
      {s.assist && <TipRow k={t("Assist")} v={s.assist} />}
    </>
  );
}

/* ------------------------------------------------------------- tab ------ */

export function ShotsTab({ m, shots, plays, axis }: { m: Match; shots: Shot[]; plays: Play[]; axis: TimeAxis }) {
  const located = useMemo(() => plays.filter((p) => p.x !== null && p.y !== null && p.side && !p.shootout), [plays]);
  const texts = useMemo(() => new Map(plays.map((p) => [p.key, p.text])), [plays]);
  if (!shots.length && !located.length) return null;
  return (
    <div className="mc-shots">
      {shots.length > 0 && <XgTotals m={m} shots={shots} />}
      {shots.length > 0 && <ShotMap m={m} shots={shots} />}
      {shots.length > 0 && (
        <div className="mc-grid-2">
          <XgTimeline m={m} shots={shots} axis={axis} />
          <GoalMouth m={m} shots={shots} texts={texts} />
        </div>
      )}
      {located.length > 0 && <ActionMap m={m} plays={located} />}
      <p className="mc-foot mc-xg-note">
        {t(
          "Pitch xG is our own expected-goals model. Each attempt is scored from its distance to goal and the angle the goal mouth presents, with adjustments for headers, direct free kicks and set pieces; penalties are worth 0.76. It is an estimate of chance quality, not a prediction.",
        )}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- totals ------ */

function XgTotals({ m, shots }: { m: Match; shots: Shot[] }) {
  const agg = (s: SideKey) => {
    const list = shots.filter((x) => x.side === s);
    return {
      xg: list.reduce((a, x) => a + x.xg, 0),
      shots: list.length,
      on: list.filter((x) => x.outcome === "goal" || x.outcome === "saved").length,
      goals: list.filter((x) => x.outcome === "goal").length,
      best: list.reduce((a, x) => Math.max(a, x.xg), 0),
    };
  };
  const h = agg("home");
  const a = agg("away");
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const hv = useCountUp(h.xg, { decimals: 2, start: drawn });
  const av = useCountUp(a.xg, { decimals: 2, start: drawn });
  const sum = h.xg + a.xg || 1;
  return (
    <section className="panel glass mc-xg-totals" ref={ref} aria-label={t("Pitch xG")}>
      <div className="mc-xg-row">
        <div className="mc-xg-team">
          <Crest src={m.home.logo} size={36} alt={m.home.name} />
          <div>
            <div className="mc-xg-val">{fmtNum(hv, 2)}</div>
            <div className="subtle">{m.home.short}</div>
          </div>
        </div>
        <div className="mc-xg-mid">
          <span className="eyebrow">{t("Pitch xG")}</span>
          <div className="mc-split" aria-hidden>
            <i className="h" style={{ flexGrow: drawn ? h.xg / sum : 1 }} />
            <i className="a" style={{ flexGrow: drawn ? a.xg / sum : 1 }} />
          </div>
        </div>
        <div className="mc-xg-team away">
          <div>
            <div className="mc-xg-val">{fmtNum(av, 2)}</div>
            <div className="subtle">{m.away.short}</div>
          </div>
          <Crest src={m.away.logo} size={36} alt={m.away.name} />
        </div>
      </div>
      <dl className="mc-xg-facts">
        {[
          { k: t("Goals"), h: fmtNum(h.goals), a: fmtNum(a.goals) },
          { k: t("Shots"), h: fmtNum(h.shots), a: fmtNum(a.shots) },
          { k: t("On target"), h: fmtNum(h.on), a: fmtNum(a.on) },
          { k: t("xG per shot"), h: h.shots ? fmtNum(h.xg / h.shots, 2) : "—", a: a.shots ? fmtNum(a.xg / a.shots, 2) : "—" },
          { k: t("Best chance"), h: h.shots ? fmtNum(h.best, 2) : "—", a: a.shots ? fmtNum(a.best, 2) : "—" },
        ].map((r) => (
          <div key={r.k}>
            <dd>{r.h}</dd>
            <dt>{r.k}</dt>
            <dd>{r.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* --------------------------------------------------------- shot map ----- */

function ShotMap({ m, shots }: { m: Match; shots: Shot[] }) {
  const pid = useId().replace(/:/g, "");
  const patterns = usePatterns();
  const vertical = useMedia("(max-width: 640px)");
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [drawRef, drawn] = useDrawIn<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | SideKey>("all");
  const list = useMemo(() => [...shots].filter((s) => filter === "all" || s.side === filter).sort((a, b) => a.clock - b.clock || a.period - b.period), [shots, filter]);
  const roving = useRoving(list.length);
  const active = hover ?? roving.active;

  const L = vertical ? 68 : 105;
  const Wd = vertical ? 105 : 68;
  const W = Math.max(260, width || 640);
  const pad = 8;
  const s = (W - pad * 2) / L;
  const H = Wd * s + pad * 2;
  const pt = (sh: Shot) => {
    const [px, py] = project(sh.x, sh.y, { vertical, flip: sh.side === "away" });
    return [pad + px * s, pad + py * s] as const;
  };
  // Marker area ∝ xG, scaled with the pitch (≥ 8px diameter so every shot stays visible).
  const k = Math.max(13, Math.min(24, s * 2.5));
  const radius = (xg: number) => Math.max(4, Math.sqrt(xg) * k);
  const tip = active !== null ? list[active] : null;
  const tipPos = tip ? pt(tip) : null;
  const order = useMemo(() => list.map((sh, i) => ({ sh, i })).sort((a, b) => b.sh.xg - a.sh.xg), [list]);

  return (
    <section className="panel glass mc-shotmap" aria-labelledby="mc-shotmap-t">
      <div className="mc-panel-head">
        <p className="panel-title" id="mc-shotmap-t">
          {t("Shot map")}
        </p>
        <Segmented
          options={[
            { value: "all", label: t("Both") },
            { value: "home", label: m.home.short },
            { value: "away", label: m.away.short },
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v as "all" | SideKey);
            roving.setActive(null);
          }}
        />
      </div>
      <div className={`mc-attack ${vertical ? "v" : "h"}`} dir="ltr" aria-hidden>
        <span>
          <Crest src={m.home.logo} size={18} alt="" />
          {m.home.short} {vertical ? "↑" : "→"}
        </span>
        <span>
          {vertical ? "↓" : "←"} {m.away.short}
          <Crest src={m.away.logo} size={18} alt="" />
        </span>
      </div>
      <div
        className="chart mc-pitch-chart"
        dir="ltr"
        ref={(el) => {
          wrapRef.current = el;
          drawRef.current = el;
        }}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t("Shot map: {home} {hs} shots, {away} {as} shots. Use arrow keys to step through shots.", {
            home: m.home.short,
            away: m.away.short,
            hs: shots.filter((x) => x.side === "home").length,
            as: shots.filter((x) => x.side === "away").length,
          })}
          tabIndex={0}
          onKeyDown={roving.onKeyDown}
          onBlur={roving.onBlur}
          onPointerLeave={() => setHover(null)}
          className={`mc-pitch-svg${drawn ? " drawn" : ""}`}
        >
          {patterns && <PatternDefs id={pid} />}
          <rect x={pad} y={pad} width={L * s} height={Wd * s} rx={10} className="mc-pitch-bg" />
          <g transform={`translate(${pad} ${pad}) scale(${s})`}>
            <PitchLines vertical={vertical} />
          </g>
          {order.map(({ sh, i }) => {
            const [x, y] = pt(sh);
            const on = active === i;
            return (
              <g
                key={sh.id}
                className={`mc-shot${on ? " on" : ""}${active !== null && !on ? " dim" : ""}`}
                style={{ transitionDelay: `${Math.min(i, 30) * 18}ms` }}
                onPointerEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              >
                <ShotGlyph shape={shapeOf(sh.outcome)} cx={x} cy={y} r={radius(sh.xg)} color={seriesVar(sh.side)} fill={seriesFill(sh.side, patterns, pid)} />
                <circle cx={x} cy={y} r={Math.max(12, radius(sh.xg) + 4)} className="hit" />
              </g>
            );
          })}
        </svg>
        {tip && tipPos && (
          <ChartTip x={tipPos[0]} y={tipPos[1] - radius(tip.xg) - 4} width={W}>
            <ShotTip s={tip} m={m} />
          </ChartTip>
        )}
      </div>
      <Legend
        items={[
          { key: "h", label: m.home.short, swatch: <Swatch side="home" /> },
          { key: "a", label: m.away.short, swatch: <Swatch side="away" /> },
          { key: "g", label: t("Goal"), swatch: <Swatch neutral shape="goal" /> },
          { key: "s", label: t("On target"), swatch: <Swatch neutral shape="dot" /> },
          { key: "o", label: t("Off target"), swatch: <Swatch neutral shape="hollow" /> },
          { key: "b", label: t("Blocked"), swatch: <Swatch neutral shape="cross" /> },
          {
            key: "z",
            label: t("Size = xG"),
            swatch: (
              <svg className="mc-sw size" viewBox="0 0 28 16" aria-hidden>
                <circle cx="5" cy="10" r="3" />
                <circle cx="18" cy="8" r="7" />
              </svg>
            ),
          },
        ]}
      />
      <ShowData
        caption={t("Shots")}
        head={[t("Minute"), t("Team"), t("Player"), t("xG"), t("Outcome"), t("Body part"), t("Situation")]}
        rows={list.map((sh) => [
          sh.minute,
          sideName(m, sh.side),
          sh.player || "—",
          fmtNum(sh.xg, 2),
          t(OUTCOME_LABEL[sh.outcome]),
          t(BODY_LABEL[sh.body]),
          t(SITUATION_LABEL[sh.situation]),
        ])}
      />
    </section>
  );
}

/* ------------------------------------------------------- xG timeline ---- */

function niceStep(max: number) {
  if (max <= 1) return 0.25;
  if (max <= 2.5) return 0.5;
  if (max <= 5) return 1;
  return 2;
}

function XgTimeline({ m, shots, axis }: { m: Match; shots: Shot[]; axis: TimeAxis }) {
  const patterns = usePatterns();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [drawRef, drawn] = useDrawIn<HTMLDivElement>();
  const [hoverAt, setHoverAt] = useState<number | null>(null);
  const roving = useRoving(shots.length);

  const pts = useMemo(() => {
    const out: Record<SideKey, { at: number; cum: number; shot: Shot }[]> = { home: [], away: [] };
    const cum = { home: 0, away: 0 };
    const sorted = [...shots]
      .map((s) => {
        const c = parseClock(s.minute) ?? { min: Math.round(s.clock / 60), added: 0 };
        return { s, at: axis.pos(s.period, c.min, c.added) };
      })
      .sort((a, b) => a.at - b.at);
    for (const { s, at } of sorted) {
      cum[s.side] += s.xg;
      out[s.side].push({ at, cum: cum[s.side], shot: s });
    }
    return { out, sorted };
  }, [shots, axis]);

  const end = m.state === "in" ? Math.min(axis.total, Math.max(...pts.sorted.map((x) => x.at), 1) + 1) : axis.total;
  const yMax = Math.max(0.5, pts.out.home.at(-1)?.cum ?? 0, pts.out.away.at(-1)?.cum ?? 0);
  const step = niceStep(yMax);
  const top = Math.ceil((yMax * 1.08) / step) * step;
  const W = Math.max(260, width || 520);
  const H = 220;
  const ml = 34;
  const mr = 40;
  const mt = 14;
  const mb = 26;
  const X = (at: number) => ml + (at / axis.total) * (W - ml - mr);
  const Y = (v: number) => mt + (1 - v / top) * (H - mt - mb);

  const path = (side: SideKey) => {
    let d = `M${X(0)} ${Y(0)}`;
    for (const p of pts.out[side]) d += `H${X(p.at)}V${Y(p.cum)}`;
    return `${d}H${X(end)}`;
  };
  const cumAt = (side: SideKey, at: number) => {
    let v = 0;
    for (const p of pts.out[side]) if (p.at <= at) v = p.cum;
    return v;
  };
  const focusAt = roving.active !== null ? pts.sorted[roving.active]?.at ?? null : null;
  const at = hoverAt ?? focusAt;

  const ends = (["home", "away"] as SideKey[]).map((s) => ({ s, v: pts.out[s].at(-1)?.cum ?? 0 }));
  const endLabels = Math.abs(Y(ends[0].v) - Y(ends[1].v)) >= 14;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const a = ((px - ml) / (W - ml - mr)) * axis.total;
    setHoverAt(Math.max(0, Math.min(end, a)));
  };

  return (
    <section className="panel glass mc-xgline" aria-labelledby="mc-xgline-t">
      <div className="mc-panel-head">
        <p className="panel-title" id="mc-xgline-t">
          {t("Cumulative xG")}
        </p>
        <Legend
          items={[
            { key: "h", label: m.home.short, swatch: <Swatch side="home" shape="line" /> },
            { key: "a", label: m.away.short, swatch: <Swatch side="away" shape="line" /> },
          ]}
        />
      </div>
      <div
        className="chart"
        dir="ltr"
        ref={(el) => {
          wrapRef.current = el;
          drawRef.current = el;
        }}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t("Cumulative xG: {home} {h}, {away} {a}", { home: m.home.short, away: m.away.short, h: fmtNum(ends[0].v, 2), a: fmtNum(ends[1].v, 2) })}
          tabIndex={0}
          onKeyDown={roving.onKeyDown}
          onBlur={roving.onBlur}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHoverAt(null)}
          className={drawn ? "drawn" : ""}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} className={v === 0 ? "baseline" : "gridline"} />
              <text x={ml - 6} y={Y(v) + 4} textAnchor="end" className="axis-label">
                {fmtNum(v, step < 1 ? (step < 0.5 ? 2 : 1) : 0)}
              </text>
            </g>
          ))}
          {axis.breaks.map((b) => (
            <line key={b} x1={X(b)} x2={X(b)} y1={mt} y2={H - mb} className="gridline" />
          ))}
          {axis.ticks.map((tk) => (
            <text key={tk.label} x={X(tk.at)} y={H - 8} textAnchor="middle" className="axis-label">
              {tk.label}
            </text>
          ))}
          {(["home", "away"] as SideKey[]).map((s) => (
            <path key={s} d={path(s)} className={`mc-step ${s}${patterns && s === "away" ? " patterned" : ""}`} pathLength={1} style={{ stroke: seriesVar(s) }} />
          ))}
          {(["home", "away"] as SideKey[]).map((s) =>
            pts.out[s]
              .filter((p) => p.shot.outcome === "goal")
              .map((p) => (
                <g key={p.shot.id} className="mc-xg-goal">
                  <ShotGlyph shape="goal" cx={X(p.at)} cy={Y(p.cum)} r={4.5} color={seriesVar(s)} />
                </g>
              )),
          )}
          {endLabels &&
            ends.map((e) => (
              <text key={e.s} x={X(end) + 6} y={Y(e.v) + 4} className="mc-end-label">
                {fmtNum(e.v, 2)}
              </text>
            ))}
          {at !== null && (
            <g className="mc-cross">
              <line x1={X(at)} x2={X(at)} y1={mt} y2={H - mb} />
              {(["home", "away"] as SideKey[]).map((s) => (
                <circle key={s} cx={X(at)} cy={Y(cumAt(s, at))} r={4} style={{ fill: seriesVar(s) }} />
              ))}
            </g>
          )}
        </svg>
        {at !== null && width > 0 && (
          <ChartTip x={X(at)} y={Math.min(Y(cumAt("home", at)), Y(cumAt("away", at))) - 6} width={W}>
            <div className="tt-head">{t("Up to {min}", { min: axis.label(at) })}</div>
            {(["home", "away"] as SideKey[]).map((s) => (
              <TipRow key={s} k={sideName(m, s)} v={fmtNum(cumAt(s, at), 2)} swatch={<Swatch side={s} shape="line" />} />
            ))}
            {focusAt !== null && roving.active !== null && pts.sorted[roving.active] && (
              <div className="mc-tip-sub">
                {pts.sorted[roving.active].s.player} · {pts.sorted[roving.active].s.minute} · {fmtNum(pts.sorted[roving.active].s.xg, 2)} {t("xG")}
              </div>
            )}
          </ChartTip>
        )}
      </div>
      <ShowData
        caption={t("Cumulative xG")}
        head={[t("Minute"), t("Team"), t("Player"), t("xG"), t("Running total")]}
        rows={pts.sorted.map(({ s }) => {
          const p = pts.out[s.side].find((x) => x.shot === s)!;
          return [s.minute, sideName(m, s.side), s.player || "—", fmtNum(s.xg, 2), fmtNum(p.cum, 2)];
        })}
      />
    </section>
  );
}

/* --------------------------------------------------------- goal mouth --- */

function GoalMouth({ m, shots, texts }: { m: Match; shots: Shot[]; texts: Map<string, string> }) {
  const pid = useId().replace(/:/g, "");
  const patterns = usePatterns();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const list = useMemo(
    () => shots.filter((s) => (s.outcome === "goal" || s.outcome === "saved") && s.gy !== null && s.gy > 38 && s.gy < 62),
    [shots],
  );
  const roving = useRoving(list.length);
  const active = hover ?? roving.active;
  // Seen from behind the shooter: the attacker's right (gy < 50) is on the right.
  const lo = 41;
  const hi = 59;
  const W = Math.max(260, width || 480);
  const postL = ((hi - 55.38) / (hi - lo)) * W;
  const postR = ((hi - 44.62) / (hi - lo)) * W;
  const gw = postR - postL;
  const gh = gw * (2.44 / 7.32);
  const top = 22;
  const ground = top + gh;
  const H = ground + 30;
  const pos = (s: Shot, i: number) => {
    const x = ((hi - (s.gy ?? 50)) / (hi - lo)) * W;
    const h = shotHeight(texts.get(s.id) ?? "");
    // Nudge co-located marks apart a little so each stays hoverable.
    const jitter = ((i % 3) - 1) * 3;
    return [x + jitter, ground - h * gh] as const;
  };
  const tip = active !== null ? list[active] : null;
  const tp = tip ? pos(tip, active!) : null;
  if (!list.length) {
    return (
      <section className="panel glass mc-goalmouth" aria-labelledby="mc-gm-t">
        <p className="panel-title" id="mc-gm-t">
          {t("On target")}
        </p>
        <p className="muted mc-empty-line">{t("No shots on target yet.")}</p>
      </section>
    );
  }
  return (
    <section className="panel glass mc-goalmouth" aria-labelledby="mc-gm-t">
      <div className="mc-panel-head">
        <p className="panel-title" id="mc-gm-t">
          {t("Goal mouth")}
        </p>
        <Legend
          items={[
            { key: "g", label: t("Goal"), swatch: <Swatch neutral shape="goal" /> },
            { key: "s", label: t("Saved"), swatch: <Swatch neutral shape="dot" /> },
          ]}
        />
      </div>
      <div className="chart" dir="ltr" ref={wrapRef}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          tabIndex={0}
          onKeyDown={roving.onKeyDown}
          onBlur={roving.onBlur}
          onPointerLeave={() => setHover(null)}
          aria-label={t("Where {n} shots on target crossed the goal line, seen from behind the shooter.", { n: list.length })}
        >
          <defs>
            <pattern id={`${pid}-net`} width="9" height="9" patternUnits="userSpaceOnUse">
              <path d="M0 0L9 9M9 0L0 9" className="mc-net" />
            </pattern>
          </defs>
          {patterns && <PatternDefs id={pid} />}
          <rect x={postL} y={top} width={gw} height={gh} fill={`url(#${pid}-net)`} className="mc-net-bg" />
          <path d={`M${postL} ${ground}V${top}H${postR}V${ground}`} className="mc-goal-frame" />
          <line x1={0} x2={W} y1={ground} y2={ground} className="baseline" />
          {list.map((s, i) => {
            const [x, y] = pos(s, i);
            return (
              <g key={s.id} className={`mc-shot${active === i ? " on" : ""}${active !== null && active !== i ? " dim" : ""}`} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
                <ShotGlyph shape={s.outcome === "goal" ? "goal" : "dot"} cx={x} cy={y} r={6} color={seriesVar(s.side)} fill={seriesFill(s.side, patterns, pid)} />
                <circle cx={x} cy={y} r={13} className="hit" />
              </g>
            );
          })}
        </svg>
        {tip && tp && (
          <ChartTip x={tp[0]} y={tp[1] - 10} width={W}>
            <ShotTip s={tip} m={m} />
          </ChartTip>
        )}
      </div>
      <Legend
        items={[
          { key: "h", label: m.home.short, swatch: <Swatch side="home" /> },
          { key: "a", label: m.away.short, swatch: <Swatch side="away" /> },
        ]}
      />
      <p className="mc-foot">{t("Height is approximate, taken from the commentary description (top, centre or bottom of the goal).")}</p>
      <ShowData
        caption={t("Goal mouth")}
        head={[t("Minute"), t("Team"), t("Player"), t("Outcome"), t("Placement")]}
        rows={list.map((s) => {
          const h = shotHeight(texts.get(s.id) ?? "");
          const gy = s.gy ?? 50;
          const across = gy < 48.5 ? t("right") : gy > 51.5 ? t("left") : t("centre");
          const up = h > 0.6 ? t("top") : h < 0.35 ? t("bottom") : t("middle");
          return [s.minute, sideName(m, s.side), s.player || "—", t(OUTCOME_LABEL[s.outcome]), `${up}, ${across}`];
        })}
      />
    </section>
  );
}


/* -------------------------------------------------------- action map ---- */

const COLS = 12;
const ROWS = 8;

const ACTION_LABEL: Partial<Record<Play["kind"], string>> = {
  goal: "Goals",
  owngoal: "Goals",
  penGoal: "Goals",
  saved: "Shots",
  missed: "Shots",
  blocked: "Shots",
  woodwork: "Shots",
  penMiss: "Shots",
  corner: "Corners",
  foul: "Fouls",
  handball: "Handballs",
  offside: "Offsides",
};

function ActionMap({ m, plays }: { m: Match; plays: Play[] }) {
  const vertical = useMedia("(max-width: 640px)");
  const [side, setSide] = useState<SideKey>("home");
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const grid = useMemo(() => {
    const cells = Array.from({ length: COLS * ROWS }, () => ({ n: 0, kinds: {} as Record<string, number> }));
    for (const p of plays) {
      if (p.side !== side || p.x === null || p.y === null) continue;
      const c = Math.min(COLS - 1, Math.max(0, Math.floor((p.x / 100) * COLS)));
      // Row 0 = attacker's left touchline (y = 100), matching the drawing.
      const r = Math.min(ROWS - 1, Math.max(0, Math.floor(((100 - p.y) / 100) * ROWS)));
      const cell = cells[r * COLS + c];
      cell.n++;
      const label = ACTION_LABEL[p.kind] ?? "Other";
      cell.kinds[label] = (cell.kinds[label] ?? 0) + 1;
    }
    return cells;
  }, [plays, side]);
  const max = Math.max(1, ...grid.map((c) => c.n));
  const total = grid.reduce((a, c) => a + c.n, 0);
  const filled = useMemo(() => grid.map((c, i) => ({ ...c, i })).filter((c) => c.n > 0), [grid]);
  const roving = useRoving(filled.length);
  const active = hover ?? (roving.active !== null ? filled[roving.active]?.i ?? null : null);
  const klass = (n: number) => (n <= 0 ? 0 : Math.max(1, Math.ceil((n / max) * 5)));

  const L = vertical ? 68 : 105;
  const Wd = vertical ? 105 : 68;
  const W = Math.max(260, width || 640);
  const pad = 8;
  const s = (W - pad * 2) / L;
  const H = Wd * s + pad * 2;
  // Cell rectangle in pixels for (row, col) with the team attacking right / up.
  const rect = (r: number, c: number) => {
    if (!vertical) {
      const cw = (105 / COLS) * s;
      const ch = (68 / ROWS) * s;
      return { x: pad + c * cw, y: pad + r * ch, w: cw, h: ch };
    }
    const cw = (68 / ROWS) * s;
    const ch = (105 / COLS) * s;
    return { x: pad + r * cw, y: pad + (COLS - 1 - c) * ch, w: cw, h: ch };
  };
  const zone = (i: number) => {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const third = c < 4 ? t("Defensive third") : c < 8 ? t("Middle third") : t("Final third");
    const lane = r < ROWS * 0.375 ? t("left channel") : r >= ROWS * 0.625 ? t("right channel") : t("centre");
    return `${third}, ${lane}`;
  };
  const tipCell = active !== null ? grid[active] : null;
  const tipRect = active !== null ? rect(Math.floor(active / COLS), active % COLS) : null;
  const team = side === "home" ? m.home : m.away;

  const thirds = useMemo(() => {
    const out: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    grid.forEach((c, i) => {
      const r = Math.floor(i / COLS);
      const col = i % COLS;
      const lane = r < 3 ? 0 : r >= 5 ? 2 : 1;
      out[lane][Math.floor(col / 4)] += c.n;
    });
    return out;
  }, [grid]);

  return (
    <section className="panel glass mc-actionmap" aria-labelledby="mc-am-t">
      <div className="mc-panel-head">
        <p className="panel-title" id="mc-am-t">
          {t("Action map")}
        </p>
        <Segmented
          options={[
            { value: "home", label: m.home.short },
            { value: "away", label: m.away.short },
          ]}
          value={side}
          onChange={(v) => {
            setSide(v as SideKey);
            roving.setActive(null);
            setHover(null);
          }}
        />
      </div>
      <div className={`mc-attack ${vertical ? "v" : "h"}`} dir="ltr" aria-hidden>
        <span>
          <Crest src={team.logo} size={18} alt="" />
          {t("{n} located actions", { n: fmtNum(total) })}
        </span>
        <span>{vertical ? t("Attacking ↑") : t("Attacking →")}</span>
      </div>
      <div className="chart mc-pitch-chart" dir="ltr" ref={wrapRef}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          tabIndex={0}
          onKeyDown={roving.onKeyDown}
          onBlur={roving.onBlur}
          onPointerLeave={() => setHover(null)}
          aria-label={t("Action map for {team}: {n} located actions. Use arrow keys to step through zones.", { team: team.short, n: total })}
          className="mc-pitch-svg"
        >
          <rect x={pad} y={pad} width={L * s} height={Wd * s} rx={10} className="mc-pitch-bg" />
          {grid.map((c, i) => {
            const k = klass(c.n);
            if (!k) return null;
            const r = rect(Math.floor(i / COLS), i % COLS);
            return (
              <rect
                key={i}
                x={r.x + 1}
                y={r.y + 1}
                width={r.w - 2}
                height={r.h - 2}
                rx={4}
                className={`mc-cell${active === i ? " on" : ""}`}
                style={{ fill: `var(--mc-ramp-${side}-${k})` }}
              />
            );
          })}
          <g transform={`translate(${pad} ${pad}) scale(${s})`} className="mc-over-lines">
            <PitchLines vertical={vertical} />
          </g>
          {grid.map((c, i) => {
            if (!c.n) return null;
            const r = rect(Math.floor(i / COLS), i % COLS);
            return <rect key={`h${i}`} x={r.x} y={r.y} width={r.w} height={r.h} className="hit" onPointerEnter={() => setHover(i)} onClick={() => setHover(i)} />;
          })}
        </svg>
        {tipCell && tipRect && (
          <ChartTip x={tipRect.x + tipRect.w / 2} y={tipRect.y - 4} width={W}>
            <div className="mc-tip-value">
              <b>{fmtNum(tipCell.n)}</b> <span>{tipCell.n === 1 ? t("action") : t("actions")}</span>
            </div>
            <div className="tt-head">{zone(active!)}</div>
            {Object.entries(tipCell.kinds)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <TipRow key={k} k={t(k)} v={fmtNum(n)} />
              ))}
          </ChartTip>
        )}
      </div>
      <div className="mc-ramp-legend" aria-label={t("Colour scale: fewer to more actions")}>
        <span className="subtle">{t("Fewer")}</span>
        {[1, 2, 3, 4, 5].map((k) => (
          <i key={k} style={{ background: `var(--mc-ramp-${side}-${k})` }} />
        ))}
        <span className="subtle">{t("More")}</span>
        <span className="subtle mc-ramp-max">{t("max {n} per zone", { n: fmtNum(max) })}</span>
      </div>
      <p className="mc-foot">
        {t("Every commentary event with a location — shots, fouls, corners, offsides — binned into a 12 × 8 grid. Fouls are placed where the team committed them.")}
      </p>
      <ShowData
        caption={t("Action map by zone")}
        head={["", t("Defensive third"), t("Middle third"), t("Final third")]}
        rows={[t("Left channel"), t("Centre"), t("Right channel")].map((lane, i) => [lane, ...thirds[i].map((n) => fmtNum(n))])}
      />
    </section>
  );
}

