import { useMemo, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import type { SeasonData } from "../../../shared/season";
import { shotGeometry } from "../../../shared/xg";
import { t } from "../../i18n";
import { fmtDayShort, fmtNum } from "../../lib/format";
import { useDrawIn } from "../../lib/motion";
import { Crest } from "../ui";
import { ChartCard, ChartTip, TipRow } from "./chart";
import { isPenalty, type SeasonShot } from "./data";

/* Season shot map on a half pitch. Marker area ∝ xG; outcome by shape + fill. */

const W = 680; // 68 m × 10
const HH = 380; // the attacking 38 m (× 10); rare longer shots sit on the bottom edge
type Outcome = SeasonShot["o"];

const OUTCOME_LABEL: Record<Outcome, string> = {
  goal: "Goal",
  saved: "Saved",
  missed: "Off target",
  blocked: "Blocked",
  woodwork: "Hit the woodwork",
};
const BODY_LABEL: Record<SeasonShot["b"], string> = {
  right: "Right foot",
  left: "Left foot",
  head: "Header",
  other: "Other",
};
const ORDER: Outcome[] = ["goal", "saved", "missed", "blocked", "woodwork"];

const radius = (xg: number) => Math.max(9, Math.sqrt(Math.max(0, xg)) * 34);
const px = (s: SeasonShot) => (1 - Math.min(100, Math.max(0, s.y)) / 100) * W;
const py = (s: SeasonShot) => Math.min(HH - 6, Math.max(4, ((100 - Math.min(100, Math.max(0, s.x))) / 100) * 1050));

export function ShotMark({ o, cx, cy, r, className = "" }: { o: Outcome; cx: number; cy: number; r: number; className?: string }) {
  const cls = `pl-shot ${o} ${className}`;
  if (o === "blocked") {
    const s = r * 1.6;
    return <rect className={cls} x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={r * 0.28} />;
  }
  if (o === "missed") {
    const d = r * 1.18;
    return <path className={cls} d={`M${cx},${cy - d} L${cx + d},${cy} L${cx},${cy + d} L${cx - d},${cy} Z`} strokeLinejoin="round" />;
  }
  if (o === "woodwork") {
    const d = r * 1.25;
    return (
      <path
        className={cls}
        d={`M${cx},${cy - d} L${cx + d * 0.95},${cy + d * 0.7} L${cx - d * 0.95},${cy + d * 0.7} Z`}
        strokeLinejoin="round"
      />
    );
  }
  return <circle className={cls} cx={cx} cy={cy} r={r} />;
}

function PitchLines() {
  // Metres × 10, goal at the top.
  const c = W / 2;
  return (
    <g className="pl-pitch-lines" fill="none">
      <path d={`M1,${HH} V1 H${W - 1} V${HH}`} />
      <rect x={c - 201.6} y={1} width={403.2} height={165} />
      <rect x={c - 91.6} y={1} width={183.2} height={55} />
      <path d={`M${c - 36.6},1 V-14 H${c + 36.6} V1`} className="pl-goal" />
      <circle cx={c} cy={110} r={3.5} className="pl-spot" />
      {/* Penalty arc: radius 91.5 around the spot, outside the box (y > 165). */}
      <path d={`M${c - 73.1},165 A91.5,91.5 0 0 0 ${c + 73.1},165`} />
    </g>
  );
}

export function ShotMap({
  shots,
  season,
  league,
  building,
}: {
  shots: SeasonShot[];
  season: SeasonData | undefined;
  league: string;
  building: boolean;
}) {
  const [drawRef, drawn] = useDrawIn<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const ctx = useMemo(() => {
    const ms = new Map((season?.matches ?? []).map((m) => [m.id, m]));
    const ts = new Map((season?.teams ?? []).map((x) => [x.id, x]));
    return { ms, ts };
  }, [season]);

  const rows = useMemo(
    () =>
      shots
        .map((s) => {
          const m = ctx.ms.get(s.m);
          const oppId = m ? (m.h === s.t ? m.a : m.h) : null;
          const opp = oppId ? ctx.ts.get(oppId) : undefined;
          return { s, date: m?.d ?? "", opp, home: m ? m.h === s.t : null };
        })
        .sort((a, b) => b.date.localeCompare(a.date) || parseInt(b.s.min) - parseInt(a.s.min)),
    [shots, ctx],
  );
  // Draw large markers first and goals last so small / important marks stay on top.
  const drawOrder = useMemo(
    () =>
      rows
        .map((r, i) => ({ r, i }))
        .sort((a, b) => Number(a.r.s.o === "goal") - Number(b.r.s.o === "goal") || b.r.s.xg - a.r.s.xg),
    [rows],
  );

  const sum = useMemo(() => {
    const n = shots.length;
    const goals = shots.filter((s) => s.o === "goal").length;
    const onT = shots.filter((s) => s.o === "goal" || s.o === "saved").length;
    const xg = shots.reduce((a, s) => a + s.xg, 0);
    const pens = shots.filter(isPenalty);
    const npShots = shots.filter((s) => !isPenalty(s));
    const dist = npShots.length ? npShots.reduce((a, s) => a + shotGeometry(s.x, s.y).distance, 0) / npShots.length : null;
    const body = { right: 0, left: 0, head: 0, other: 0 } as Record<SeasonShot["b"], number>;
    for (const s of shots) body[s.b] = (body[s.b] ?? 0) + 1;
    return {
      n,
      goals,
      onT,
      xg,
      pens: pens.length,
      penGoals: pens.filter((s) => s.o === "goal").length,
      big: shots.filter((s) => s.xg >= 0.3 && !isPenalty(s)).length,
      dist,
      body,
    };
  }, [shots]);

  const sub = t("Every shot in the league this season. Bigger marks were better chances.");

  if (!shots.length) {
    return (
      <ChartCard title={t("Shot map")} subtitle={sub} className="pl-shots-card">
        <div className="pl-shots-empty">
          <svg viewBox={`0 -20 ${W} ${HH + 20}`} className="pl-pitch ghost" aria-hidden>
            <PitchLines />
          </svg>
          <p>
            {building
              ? t("Shot locations appear as this season’s matches are processed. Check back shortly.")
              : t("No shots recorded in league matches yet.")}
          </p>
        </div>
      </ChartCard>
    );
  }

  const hr = hover != null ? rows[hover] : null;
  const onKey = (e: KeyboardEvent) => {
    if (!rows.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setHover((h) => (h == null ? 0 : (h + 1) % rows.length));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setHover((h) => (h == null ? rows.length - 1 : (h - 1 + rows.length) % rows.length));
    } else if (e.key === "Escape") setHover(null);
  };
  const diff = sum.goals - sum.xg;
  const maxBar = Math.max(sum.goals, sum.xg, 0.01);

  const legend = (
    <>
      {ORDER.map((o) => (
        <span key={o} className="pl-key">
          <svg viewBox="-12 -12 24 24" width="16" height="16" aria-hidden>
            <ShotMark o={o} cx={0} cy={0} r={6.5} />
          </svg>
          {t(OUTCOME_LABEL[o])}
        </span>
      ))}
      <span className="pl-key subtle">
        <svg viewBox="-14 -14 28 28" width="20" height="20" aria-hidden>
          <circle className="pl-size-key" cx={-6} cy={4} r={3.5} />
          <circle className="pl-size-key" cx={4} cy={0} r={8} />
        </svg>
        {t("Size = xG")}
      </span>
    </>
  );

  const table = (
    <table className="pl-table compact">
      <thead>
        <tr>
          <th scope="col">{t("Match")}</th>
          <th scope="col">{t("Minute")}</th>
          <th scope="col">{t("Outcome")}</th>
          <th scope="col">{t("Body part")}</th>
          <th scope="col">{t("xG")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ s, opp, date, home }, i) => (
          <tr key={`${s.m}-${i}`}>
            <th scope="row">
              <Link to={`/match/${league}/${s.m}`} className="pl-tlink">
                {opp ? (home ? t("vs {team}", { team: opp.s || opp.n }) : t("at {team}", { team: opp.s || opp.n })) : t("Match")}
              </Link>
              {date && <span className="pl-cell-sub">{fmtDayShort(date)}</span>}
            </th>
            <td className="num">{s.min || "–"}</td>
            <td>{t(OUTCOME_LABEL[s.o])}</td>
            <td>{t(BODY_LABEL[s.b] ?? "Other")}</td>
            <td className="num">{fmtNum(s.xg, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title={t("Shot map")} subtitle={sub} legend={legend} table={table} className="pl-shots-card">
      <div className="pl-shots" ref={drawRef}>
        <div className="chart pl-pitch-wrap" dir="ltr" onPointerLeave={() => setHover(null)}>
          <svg
            viewBox={`0 -20 ${W} ${HH + 20}`}
            className="pl-pitch"
            role="application"
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            aria-label={t("Shot map: {n} shots, {g} goals, {xg} xG. Use the arrow keys to step through shots.", {
              n: sum.n,
              g: sum.goals,
              xg: fmtNum(sum.xg, 1),
            })}
          >
            <PitchLines />
            <g className={`pl-shot-layer${drawn ? " on" : ""}`}>
              {drawOrder.map(({ r, i }, k) => {
                const cx = px(r.s);
                const cy = py(r.s);
                const rad = radius(r.s.xg);
                return (
                  <g
                    key={`${r.s.m}-${i}`}
                    className={`pl-shot-g${hover === i ? " on" : hover != null ? " dim" : ""}`}
                    style={{ transitionDelay: drawn ? `${Math.min(k * 14, 600)}ms` : undefined, transformOrigin: `${cx}px ${cy}px` }}
                    onPointerEnter={() => setHover(i)}
                  >
                    <ShotMark o={r.s.o} cx={cx} cy={cy} r={rad} />
                    <circle className="pl-shot-hit" cx={cx} cy={cy} r={Math.max(rad + 6, 18)} />
                  </g>
                );
              })}
            </g>
          </svg>
          {hr && hover != null && (
            <ChartTip x={(px(hr.s) / W) * 100} y={((py(hr.s) + 20) / (HH + 20)) * 100} below={py(hr.s) < 130}>
              <div className="tt-head">
                {hr.opp && <Crest src={hr.opp.l} size={18} alt="" />}
                <span>
                  {hr.opp ? (hr.home ? t("vs {team}", { team: hr.opp.s || hr.opp.n }) : t("at {team}", { team: hr.opp.s || hr.opp.n })) : t("Shot")}
                </span>
              </div>
              <div className="pl-tt-meta">{[hr.date ? fmtDayShort(hr.date) : "", hr.s.min ? `${hr.s.min}` : ""].filter(Boolean).join(" · ")}</div>
              <TipRow label={t("Outcome")} value={t(OUTCOME_LABEL[hr.s.o])} />
              <TipRow label={t("xG")} value={fmtNum(hr.s.xg, 2)} />
              <TipRow label={t("Body part")} value={t(BODY_LABEL[hr.s.b] ?? "Other")} />
              <TipRow label={t("Distance")} value={t("{n} m", { n: fmtNum(shotGeometry(hr.s.x, hr.s.y).distance) })} />
            </ChartTip>
          )}
        </div>

        <aside className="pl-shot-sum" aria-label={t("Shooting summary")}>
          <div className="pl-gx">
            <div className="pl-gx-row">
              <span className="pl-gx-k">{t("Goals")}</span>
              <span className="pl-gx-bar">
                <i className="g" style={{ width: drawn ? `${(sum.goals / maxBar) * 100}%` : 0 }} />
              </span>
              <b className="num">{fmtNum(sum.goals)}</b>
            </div>
            <div className="pl-gx-row">
              <span className="pl-gx-k">{t("xG")}</span>
              <span className="pl-gx-bar">
                <i className="x" style={{ width: drawn ? `${(sum.xg / maxBar) * 100}%` : 0 }} />
              </span>
              <b className="num">{fmtNum(sum.xg, 1)}</b>
            </div>
            <p className="pl-gx-note">
              {Math.abs(diff) < 0.05
                ? t("Finishing exactly in line with chance quality.")
                : diff > 0
                  ? t("{n} goals above expected — clinical finishing.", { n: fmtNum(diff, 1) })
                  : t("{n} goals below expected from these chances.", { n: fmtNum(Math.abs(diff), 1) })}
            </p>
          </div>
          <dl className="pl-dl">
            <div>
              <dt>{t("Shots")}</dt>
              <dd className="num">{fmtNum(sum.n)}</dd>
            </div>
            <div>
              <dt>{t("On target")}</dt>
              <dd className="num">{sum.n ? `${fmtNum((sum.onT / sum.n) * 100)}%` : "–"}</dd>
            </div>
            <div>
              <dt>{t("xG per shot")}</dt>
              <dd className="num">{sum.n ? fmtNum(sum.xg / sum.n, 2) : "–"}</dd>
            </div>
            <div>
              <dt>{t("Big chances")}</dt>
              <dd className="num">{fmtNum(sum.big)}</dd>
            </div>
            <div>
              <dt>{t("Avg. distance")}</dt>
              <dd className="num">{sum.dist == null ? "–" : t("{n} m", { n: fmtNum(sum.dist, 1) })}</dd>
            </div>
            <div>
              <dt>{t("Penalties")}</dt>
              <dd className="num">{sum.pens ? `${fmtNum(sum.penGoals)}/${fmtNum(sum.pens)}` : "0"}</dd>
            </div>
          </dl>
          <p className="pl-body-split">
            {(["right", "left", "head"] as const)
              .filter((k) => sum.body[k] > 0)
              .map((k) => `${t(BODY_LABEL[k])} ${fmtNum(sum.body[k])}`)
              .join(" · ")}
          </p>
        </aside>
      </div>
    </ChartCard>
  );
}
