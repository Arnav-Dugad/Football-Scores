import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconStats } from "../components/Icons";
import { PlayerSheet, type PlayerRef } from "../components/PlayerSheet";
import { Crest, Empty, ErrorState, PlayerAvatar, Skeleton, tsdbSize } from "../components/ui";
import { endpoints, normaliseLeaders, normaliseStandings, sized, type Leader, type TableRow } from "../lib/api";
import { useApi, useDocumentTitle, usePlayer } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { LeaguePicker, useLeagueParam } from "./Standings";

export default function Analytics() {
  const league = useLeagueParam();
  const meta = LEAGUE_BY_SLUG[league];
  useDocumentTitle(`${meta.name} stats`);
  const st = useApi<any>(endpoints.standings(league));
  const ld = useApi<any>(endpoints.leaders(league));
  const rows = useMemo(() => (st.data ? normaliseStandings(st.data).groups.flatMap((g) => g.rows) : []), [st.data]);
  const leaders = useMemo(() => (ld.data ? normaliseLeaders(ld.data) : { goals: [], assists: [] }), [ld.data]);
  const [player, setPlayer] = useState<PlayerRef | null>(null);

  const open = (l: Leader) =>
    setPlayer({ name: l.name, id: l.id, league, team: { name: l.team.name, logo: l.team.logo } });

  const played = rows.filter((r) => r.gp > 0);
  const totals = useMemo(() => {
    if (!played.length) return null;
    const goals = played.reduce((a, r) => a + r.gf, 0);
    const games = played.reduce((a, r) => a + r.gp, 0) / 2;
    const attack = [...played].sort((a, b) => b.gf / b.gp - a.gf / a.gp)[0];
    const defence = [...played].sort((a, b) => a.ga / a.gp - b.ga / b.gp)[0];
    return { goals, games, attack, defence };
  }, [played]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{meta.name}</p>
          <h1 className="large-title">Stats</h1>
        </div>
      </div>
      <LeaguePicker value={league} base="/stats" />

      {st.loading && ld.loading ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="tiles">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={118} />
            ))}
          </div>
          <Skeleton h={260} r={32} />
          <Skeleton h={480} />
        </div>
      ) : st.error && ld.error ? (
        <ErrorState onRetry={() => (st.reload(), ld.reload())} />
      ) : (
        <>
          {totals && (
            <div className="tiles">
              <div className="tile glass">
                <div className="k">Goals scored</div>
                <div className="v">{totals.goals.toLocaleString()}</div>
                <div className="s">in {Math.round(totals.games)} matches</div>
              </div>
              <div className="tile glass" style={{ animationDelay: "40ms" }}>
                <div className="k">Goals per match</div>
                <div className="v">{totals.games ? (totals.goals / totals.games).toFixed(2) : "–"}</div>
                <div className="s">league average</div>
              </div>
              <div className="tile glass" style={{ animationDelay: "80ms" }}>
                <div className="k">Best attack</div>
                <div className="v">{(totals.attack.gf / totals.attack.gp).toFixed(2)}</div>
                <div className="s">
                  <Crest src={totals.attack.team.logo} size={18} alt="" />
                  {totals.attack.team.short} · goals / game
                </div>
              </div>
              <div className="tile glass" style={{ animationDelay: "120ms" }}>
                <div className="k">Meanest defence</div>
                <div className="v">{(totals.defence.ga / totals.defence.gp).toFixed(2)}</div>
                <div className="s">
                  <Crest src={totals.defence.team.logo} size={18} alt="" />
                  {totals.defence.team.short} · conceded / game
                </div>
              </div>
            </div>
          )}

          {leaders.goals[0] && (
            <section className="section">
              <LeaderHero l={leaders.goals[0]} label="Golden Boot leader" unit="goals" tint={meta.tint} onOpen={open} />
            </section>
          )}

          {(leaders.goals.length > 0 || leaders.assists.length > 0) && (
            <section className="section grid-2" style={{ alignItems: "start" }}>
              <LeaderList title="Top scorers" list={leaders.goals} unit="Goals" onOpen={open} />
              <LeaderList title="Top assists" list={leaders.assists} unit="Assists" onOpen={open} />
            </section>
          )}

          {played.length >= 4 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Attack vs defence</h2>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
                    Goals scored and conceded per game. Top-right is where the best teams live.
                  </p>
                </div>
              </div>
              <div className="panel glass">
                <Scatter rows={played} league={league} />
              </div>
            </section>
          )}

          {played.length >= 4 && (
            <section className="section">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Goal difference</h2>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
                    Every club, ranked by goals scored minus goals conceded.
                  </p>
                </div>
              </div>
              <div className="panel glass">
                <GoalDiff rows={played} league={league} />
              </div>
            </section>
          )}

          {!played.length && !leaders.goals.length && (
            <Empty icon={<IconStats />} title="No stats yet">
              {meta.name} hasn’t played enough matches this season for analytics.
            </Empty>
          )}
        </>
      )}
      {player && <PlayerSheet p={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------- Leaders ---- */

function LeaderHero({
  l,
  label,
  unit,
  tint,
  onOpen,
}: {
  l: Leader;
  label: string;
  unit: string;
  tint: string;
  onOpen: (l: Leader) => void;
}) {
  const { info } = usePlayer(l.name, l.team.name);
  const cut = tsdbSize(info?.cutout, "medium");
  const photo = !cut ? tsdbSize(info?.photo, "medium") : null;
  return (
    <button className="leader-hero glass" style={{ width: "100%", textAlign: "left" }} onClick={() => onOpen(l)}>
      <div
        className="glow"
        style={{ background: `radial-gradient(50% 60% at 85% 60%, ${tint}, transparent 70%), radial-gradient(40% 50% at 10% 10%, var(--series-1), transparent 70%)` }}
      />
      <div className="info">
        <div>
          <div className="rank">{label}</div>
          <div className="pname">{l.name}</div>
          <div className="team">
            <Crest src={l.team.logo} size={22} alt="" />
            {l.team.name}
          </div>
        </div>
        <div className="value num">
          {l.value}
          <small>
            {unit}
            {l.matches ? ` in ${l.matches} games` : ""}
          </small>
        </div>
      </div>
      <div className="cut">
        {cut ? (
          <img src={cut} alt={l.name} />
        ) : photo ? (
          <img src={photo} alt={l.name} style={{ objectFit: "cover", borderRadius: "24px 0 0 0", height: "100%" }} />
        ) : null}
      </div>
    </button>
  );
}

function LeaderList({ title, list, unit, onOpen }: { title: string; list: Leader[]; unit: string; onOpen: (l: Leader) => void }) {
  if (!list.length) return null;
  const top = list.slice(0, 10);
  const max = Math.max(...top.map((l) => l.value), 1);
  return (
    <div>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="subtle" style={{ fontSize: 13 }}>
          {unit}
        </span>
      </div>
      <div className="list glass">
        {top.map((l, i) => (
          <div
            key={l.id}
            className="bar-row"
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
            onClick={() => onOpen(l)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(l)}
          >
            <span className="rk">{i + 1}</span>
            <PlayerAvatar name={l.name} team={l.team.name} size={44} color="var(--series-1)" />
            <div style={{ minWidth: 0 }}>
              <div className="top">
                <b>{l.name}</b>
                <span className="val">{l.value}</span>
              </div>
              <div className="sub">
                <Crest src={l.team.logo} size={14} alt="" />
                {l.team.name}
                {l.matches ? ` · ${l.matches} apps` : ""}
              </div>
              <div className="track">
                <div style={{ width: `${(l.value / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Scatter ---- */

const tick = (t: number) => t.toFixed(2).replace(/0$/, "");

function Scatter({ rows, league }: { rows: TableRow[]; league: string }) {
  const W = 760;
  const H = 460;
  const m = { t: 24, r: 24, b: 48, l: 52 };
  const pts = rows.map((r) => ({ r, x: r.gf / r.gp, y: r.ga / r.gp }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = (lo: number, hi: number) => {
    const span = Math.max(hi - lo, 0.5);
    return [Math.max(0, lo - span * 0.12), hi + span * 0.12];
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  // Fewer goals conceded is better, so the y-axis runs low → high from the top.
  const sy = (v: number) => m.t + ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const med = (a: number[]) => {
    const s = [...a].sort((p, q) => p - q);
    const k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  };
  const mx = med(xs);
  const my = med(ys);
  const ticks = (lo: number, hi: number) => {
    const step = hi - lo > 2.4 ? 0.5 : hi - lo > 1.2 ? 0.25 : 0.2;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(2));
    return out;
  };
  const size = rows.length > 24 ? 22 : 28;
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scatter plot of goals scored per game against goals conceded per game">
        {ticks(x0, x1).map((t) => (
          <g key={`x${t}`}>
            <line className="gridline" x1={sx(t)} x2={sx(t)} y1={m.t} y2={H - m.b} />
            <text className="axis-label" x={sx(t)} y={H - m.b + 18} textAnchor="middle">
              {tick(t)}
            </text>
          </g>
        ))}
        {ticks(y0, y1).map((t) => (
          <g key={`y${t}`}>
            <line className="gridline" x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} />
            <text className="axis-label" x={m.l - 10} y={sy(t) + 4} textAnchor="end">
              {tick(t)}
            </text>
          </g>
        ))}
        <line className="median" x1={sx(mx)} x2={sx(mx)} y1={m.t} y2={H - m.b} />
        <line className="median" x1={m.l} x2={W - m.r} y1={sy(my)} y2={sy(my)} />
        <text className="quad" x={W - m.r - 8} y={m.t + 16} textAnchor="end">
          Strong both ends
        </text>
        <text className="quad" x={m.l + 8} y={m.t + 16}>
          Hard to beat
        </text>
        <text className="quad" x={W - m.r - 8} y={H - m.b - 10} textAnchor="end">
          Open games
        </text>
        <text className="quad" x={m.l + 8} y={H - m.b - 10}>
          Struggling
        </text>
        <text className="axis-title" x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
          Goals scored per game →
        </text>
        <text className="axis-title" transform={`translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">
          ← Fewer conceded per game
        </text>
        {pts.map((p, i) => (
          <Link
            key={p.r.team.id}
            to={`/team/${league}/${p.r.team.id}`}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${p.r.team.name}: ${p.x.toFixed(2)} scored, ${p.y.toFixed(2)} conceded per game`}
          >
            <circle className="dot-hit" cx={sx(p.x)} cy={sy(p.y)} r={18} />
            <image
              className={`crest-mark${hover === i ? " on" : hover != null ? " dim" : ""}`}
              href={sized(p.r.team.logo, 64)}
              x={sx(p.x) - size / 2}
              y={sy(p.y) - size / 2}
              width={size}
              height={size}
            />
          </Link>
        ))}
      </svg>
      {hp && (
        <div
          className="tooltip glass-strong"
          style={{ left: `${(sx(hp.x) / W) * 100}%`, top: `${(sy(hp.y) / H) * 100}%` }}
        >
          <div className="tt-head">
            <Crest src={hp.r.team.logo} size={20} alt="" />
            {hp.r.team.name}
          </div>
          <div className="tt-row">
            Scored / game <b>{hp.x.toFixed(2)}</b>
          </div>
          <div className="tt-row">
            Conceded / game <b>{hp.y.toFixed(2)}</b>
          </div>
          <div className="tt-row">
            Points <b>{hp.r.pts}</b>
          </div>
        </div>
      )}
      <details style={{ marginTop: 10, fontSize: 13 }}>
        <summary className="muted" style={{ cursor: "pointer" }}>
          Show data table
        </summary>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Club</th>
              <th>GP</th>
              <th>GF / game</th>
              <th>GA / game</th>
            </tr>
          </thead>
          <tbody>
            {[...pts].sort((a, b) => b.x - a.x).map((p) => (
              <tr key={p.r.team.id}>
                <td>{p.r.team.name}</td>
                <td>{p.r.gp}</td>
                <td>{p.x.toFixed(2)}</td>
                <td>{p.y.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ---------------------------------------------------- Goal difference -- */

function GoalDiff({ rows, league }: { rows: TableRow[]; league: string }) {
  const sorted = [...rows].sort((a, b) => b.gd - a.gd || b.gf - a.gf);
  const max = Math.max(...sorted.map((r) => Math.abs(r.gd)), 1);
  return (
    <div role="list" aria-label="Goal difference by club">
      <div style={{ display: "flex", gap: 16, fontSize: 12.5, marginBottom: 10 }} className="muted">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--series-1)" }} /> Positive
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--series-neg)" }} /> Negative
        </span>
      </div>
      {sorted.map((r, i) => {
        const w = (Math.abs(r.gd) / max) * 46;
        return (
          <Link to={`/team/${league}/${r.team.id}`} key={r.team.id} className="gd-row" role="listitem" title={`${r.team.name}: ${r.gd > 0 ? "+" : ""}${r.gd}`}>
            <span className="subtle num" style={{ textAlign: "right" }}>
              {i + 1}
            </span>
            <span className="nm">
              <Crest src={r.team.logo} size={18} alt="" />
              <span>{r.team.short}</span>
            </span>
            <span className="gd-bar">
              <span className="zero" />
              {r.gd !== 0 && <span className={`b ${r.gd > 0 ? "pos" : "neg"}`} style={{ width: `${w}%` }} />}
              <span
                className="t num"
                style={
                  r.gd >= 0
                    ? { left: `calc(50% + ${w}% + 6px)` }
                    : { right: `calc(50% + ${w}% + 6px)` }
                }
              >
                {r.gd > 0 ? `+${r.gd}` : r.gd}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
