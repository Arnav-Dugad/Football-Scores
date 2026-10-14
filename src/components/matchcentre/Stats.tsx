import { useMemo } from "react";
import type { Shot } from "../../../shared/xg";
import { t } from "../../i18n";
import type { SummaryData } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { useCountUp, useDrawIn } from "../../lib/motion";
import { IconStats } from "../Icons";
import { Crest, Empty } from "../ui";
import { Legend, ShowData, Swatch } from "./charts";
import type { SideKey } from "./data";

/* Team statistics: possession, shot split, grouped head-to-head bars. */

interface StatDef {
  key: string;
  label: string;
  pct?: boolean;
  decimals?: number;
  /** Lower is better (fouls, cards). */
  lowGood?: boolean;
}

const GROUPS: { title: string; rows: StatDef[] }[] = [
  {
    title: "Attack",
    rows: [
      { key: "xg", label: "Pitch xG", decimals: 2 },
      { key: "totalShots", label: "Shots" },
      { key: "shotsOnTarget", label: "Shots on target" },
      { key: "wonCorners", label: "Corners" },
      { key: "offsides", label: "Offsides", lowGood: true },
    ],
  },
  {
    title: "Passing",
    rows: [
      { key: "accuratePasses", label: "Accurate passes" },
      { key: "passAccuracy", label: "Pass accuracy", pct: true },
      { key: "totalCrosses", label: "Crosses" },
      { key: "totalLongBalls", label: "Long balls" },
    ],
  },
  {
    title: "Defence",
    rows: [
      { key: "totalTackles", label: "Tackles" },
      { key: "interceptions", label: "Interceptions" },
      { key: "effectiveClearance", label: "Clearances" },
      { key: "saves", label: "Saves" },
    ],
  },
  {
    title: "Discipline",
    rows: [
      { key: "foulsCommitted", label: "Fouls", lowGood: true },
      { key: "yellowCards", label: "Yellow cards", lowGood: true },
      { key: "redCards", label: "Red cards", lowGood: true },
    ],
  },
];

function statMap(list: { name: string; value: string }[] = []) {
  const m: Record<string, number> = {};
  for (const s of list) {
    const n = parseFloat(s.value);
    if (Number.isFinite(n)) m[s.name] = n;
  }
  if (m.totalPasses > 0) m.passAccuracy = Math.round(((m.accuratePasses ?? 0) / m.totalPasses) * 100);
  return m;
}

export function hasTeamStats(s: SummaryData) {
  return Object.values(s.stats).some((v) => v.some((x) => Number.isFinite(parseFloat(x.value))));
}

export function StatsTab({ s, shots }: { s: SummaryData; shots: Shot[] }) {
  const { home, away } = s.match;
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const [H, A] = useMemo(() => {
    const h = statMap(s.stats[home.id]);
    const a = statMap(s.stats[away.id]);
    if (shots.length) {
      h.xg = shots.filter((x) => x.side === "home").reduce((acc, x) => acc + x.xg, 0);
      a.xg = shots.filter((x) => x.side === "away").reduce((acc, x) => acc + x.xg, 0);
    }
    return [h, a];
  }, [s.stats, home.id, away.id, shots]);
  const hp = H.possessionPct ?? 0;
  const ap = A.possessionPct ?? 0;
  const hpv = useCountUp(hp, { decimals: 0, start: drawn });
  const apv = useCountUp(ap, { decimals: 0, start: drawn });

  const split = (side: SideKey, M: Record<string, number>) => {
    const list = shots.filter((x) => x.side === side);
    if (list.length) {
      return {
        on: list.filter((x) => x.outcome === "goal" || x.outcome === "saved").length,
        off: list.filter((x) => x.outcome === "missed" || x.outcome === "woodwork").length,
        blocked: list.filter((x) => x.outcome === "blocked").length,
      };
    }
    const total = M.totalShots ?? 0;
    const on = M.shotsOnTarget ?? 0;
    const blocked = M.blockedShots ?? 0;
    return { on, off: Math.max(0, total - on - blocked), blocked };
  };
  const hs = split("home", H);
  const as = split("away", A);
  const maxShots = Math.max(1, hs.on + hs.off + hs.blocked, as.on + as.off + as.blocked);

  const groups = GROUPS.map((g) => ({ ...g, rows: g.rows.filter((r) => H[r.key] !== undefined || A[r.key] !== undefined) })).filter((g) => g.rows.length);

  if (!groups.length && hp + ap === 0) {
    return (
      <Empty icon={<IconStats />} title={t("No statistics yet")}>
        {t("Team statistics appear once the match is under way.")}
      </Empty>
    );
  }

  const fmt = (v: number, r: StatDef) => (r.pct ? `${fmtNum(v)}%` : fmtNum(v, r.decimals ?? 0));

  return (
    <div className="mc-stats" ref={ref}>
      <section className="panel glass mc-stats-top">
        <div className="legend-row">
          <span className="legend-team">
            <Swatch side="home" />
            <Crest src={home.logo} size={26} alt="" />
            <span>{home.short}</span>
          </span>
          <span className="legend-team away">
            <Swatch side="away" />
            <Crest src={away.logo} size={26} alt="" />
            <span>{away.short}</span>
          </span>
        </div>
        {hp + ap > 0 && (
          <div className="mc-poss" role="img" aria-label={t("Possession: {home} {h}%, {away} {a}%", { home: home.short, away: away.short, h: fmtNum(hp), a: fmtNum(ap) })}>
            <div className="mc-poss-vals" aria-hidden>
              <span>{fmtNum(hpv)}%</span>
              <span className="label">{t("Possession")}</span>
              <span>{fmtNum(apv)}%</span>
            </div>
            <div className="mc-split lg" aria-hidden>
              <i className="h" style={{ flexGrow: drawn ? hp : 1 }} />
              <i className="a" style={{ flexGrow: drawn ? ap : 1 }} />
            </div>
          </div>
        )}
        {maxShots > 1 && (
          <div className="mc-shotsplit">
            <p className="panel-title">{t("Shots")}</p>
            {(["home", "away"] as SideKey[]).map((side) => {
              const v = side === "home" ? hs : as;
              const tot = v.on + v.off + v.blocked;
              const team = side === "home" ? home : away;
              return (
                <div key={side} className={`mc-ss-row ${side}`}>
                  <span className="mc-ss-team">
                    <Crest src={team.logo} size={20} alt="" />
                    <b>{fmtNum(tot)}</b>
                  </span>
                  <div
                    className="mc-ss-track"
                    role="img"
                    aria-label={t("{team}: {on} on target, {off} off target, {blocked} blocked", { team: team.short, on: v.on, off: v.off, blocked: v.blocked })}
                  >
                    {(["on", "off", "blocked"] as const).map((k) =>
                      v[k] > 0 ? (
                        <i
                          key={k}
                          className={`seg ${k}`}
                          style={{ width: drawn ? `${(v[k] / maxShots) * 100}%` : 0 }}
                          title={`${k === "on" ? t("On target") : k === "off" ? t("Off target") : t("Blocked")}: ${v[k]}`}
                        >
                          {(v[k] / maxShots) * 100 > 9 && <span>{fmtNum(v[k])}</span>}
                        </i>
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
            <Legend
              items={[
                { key: "on", label: t("On target"), swatch: <span className="mc-sw rect ss on" aria-hidden /> },
                { key: "off", label: t("Off target"), swatch: <span className="mc-sw rect ss off" aria-hidden /> },
                { key: "bl", label: t("Blocked"), swatch: <span className="mc-sw rect ss blocked" aria-hidden /> },
              ]}
            />
          </div>
        )}
      </section>

      <div className="mc-stat-groups">
        {groups.map((g) => (
          <section key={g.title} className="panel glass">
            <p className="panel-title">{t(g.title)}</p>
            {g.rows.map((r) => {
              const hv = H[r.key] ?? 0;
              const av = A[r.key] ?? 0;
              const max = r.pct ? 100 : Math.max(hv, av, r.decimals ? 0.01 : 1);
              const hLead = r.lowGood ? hv < av : hv > av;
              const aLead = r.lowGood ? av < hv : av > hv;
              return (
                <div className="cmp-row mc-cmp" key={r.key} role="group" aria-label={`${t(r.label)}: ${home.short} ${fmt(hv, r)}, ${away.short} ${fmt(av, r)}`}>
                  <div className="cmp-head" aria-hidden>
                    <span className={`v${hLead ? " lead" : ""}`}>{fmt(hv, r)}</span>
                    <span className="l">
                      {t(r.label)}
                      {r.key === "xg" && <sup className="mc-xg-sup">*</sup>}
                    </span>
                    <span className={`v${aLead ? " lead" : ""}`}>{fmt(av, r)}</span>
                  </div>
                  <div className="cmp-bars" aria-hidden>
                    <div className="cmp-track home">
                      <div className={`cmp-fill${aLead ? " dim" : ""}`} style={{ width: drawn ? `${(hv / max) * 100}%` : 0 }} />
                    </div>
                    <div className="cmp-track away">
                      <div className={`cmp-fill${hLead ? " dim" : ""}`} style={{ width: drawn ? `${(av / max) * 100}%` : 0 }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {g.rows.some((r) => r.key === "xg") && <p className="mc-foot">* {t("Pitch xG — our shot-quality model from distance and angle.")}</p>}
          </section>
        ))}
      </div>

      <ShowData
        caption={t("Team statistics")}
        head={[t("Statistic"), home.short, away.short]}
        rows={[
          ...(hp + ap > 0 ? [[t("Possession"), `${fmtNum(hp)}%`, `${fmtNum(ap)}%`]] : []),
          ...groups.flatMap((g) => g.rows.map((r) => [t(r.label), fmt(H[r.key] ?? 0, r), fmt(A[r.key] ?? 0, r)])),
        ]}
      />
    </div>
  );
}
