import { useState } from "react";
import { useApp } from "../lib/state";
import { shortName, outcomes, type Match, type Team } from "../../shared/model";
import {
  Title,
  DataGate,
  SectionHead,
  Metrics,
  Crest,
  Empty,
} from "../components/UI";
function Trend({ matches, teams }: { matches: Match[]; teams: Team[] }) {
  const lines = teams.map((t) => {
    let p = 0;
    return {
      team: t,
      values: outcomes(matches, t.id).map((m, i) => ({
        round: i + 1,
        date: m.date,
        points: (p += m.points),
      })),
    };
  });
  const max = Math.max(
    1,
    ...lines.flatMap((l) => l.values.map((v) => v.points)),
  );
  const games = Math.max(1, ...lines.map((l) => l.values.length));
  const colors = ["#ae8bff", "#54c9ae"];
  return (
    <>
      <div className="chart-legend">
        {lines.map((l, i) => (
          <span key={l.team.id}>
            <i style={{ background: colors[i] }} />
            {shortName(l.team.name)}
          </span>
        ))}
      </div>
      <svg
        className="trend-chart"
        viewBox="0 0 680 280"
        role="img"
        aria-labelledby="trend-title trend-desc"
      >
        <title id="trend-title">Cumulative points by completed match</title>
        <desc id="trend-desc">
          {lines
            .map(
              (l) =>
                `${l.team.name}: ${l.values.at(-1)?.points ?? 0} points from ${l.values.length} recorded matches.`,
            )
            .join(" ")}{" "}
          Exact values are available in the data table below.
        </desc>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1="38"
              x2="665"
              y1={240 - f * 210}
              y2={240 - f * 210}
              className="grid-line"
            />
            <text x="28" y={244 - f * 210} textAnchor="end">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {lines.map((l, i) => (
          <polyline
            key={l.team.id}
            fill="none"
            stroke={colors[i]}
            strokeWidth="3"
            strokeLinejoin="round"
            points={[
              [38, 240],
              ...l.values.map((v) => [
                38 + (v.round / games) * 627,
                240 - (v.points / max) * 210,
              ]),
            ]
              .map((p) => p.join(","))
              .join(" ")}
          />
        ))}
        <text x="38" y="267">
          Start
        </text>
        <text x="665" y="267" textAnchor="end">
          {games} recorded matches
        </text>
      </svg>
      <details className="chart-data">
        <summary>View accessible chart data</summary>
        {lines.map((l) => (
          <div key={l.team.id}>
            <h3>{shortName(l.team.name)}</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Match</th>
                  <th>Cumulative points</th>
                </tr>
              </thead>
              <tbody>
                {l.values.map((v) => (
                  <tr key={v.round}>
                    <td>{v.date}</td>
                    <td>{v.round}</td>
                    <td>{v.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </details>
    </>
  );
}
export default function Analytics() {
  const { data } = useApp();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [location, setLocation] = useState("all");
  const rows = data?.standings ?? [];
  const a = rows.find((r) => r.team.id === first) ?? rows[0];
  const b =
    rows.find((r) => r.team.id === second) ??
    rows.find((r) => r.team.id !== a?.team.id);
  const completed = data?.matches.filter((m) => m.status === "finished") ?? [];
  const total = completed.reduce(
    (s, m) => s + (m.score?.[0] ?? 0) + (m.score?.[1] ?? 0),
    0,
  );
  const wins = completed.filter((m) => m.score![0] > m.score![1]).length,
    draws = completed.filter((m) => m.score![0] === m.score![1]).length,
    away = completed.length - wins - draws;
  return (
    <>
      <Title
        eyebrow="FIND THE STORY IN THE NUMBERS"
        title="Analytics studio"
        description="Real results. Clear definitions. A deeper view of the season."
      />
      <DataGate>
        <Metrics
          items={[
            { label: "Recorded games", value: completed.length },
            { label: "Total goals", value: total },
            {
              label: "Goals per game",
              value: completed.length
                ? (total / completed.length).toFixed(2)
                : "–",
            },
            {
              label: "Draw rate",
              value: completed.length
                ? `${((draws / completed.length) * 100).toFixed(1)}%`
                : "–",
            },
          ]}
        />
        {a && b ? (
          <>
            <SectionHead
              title="Two clubs. One conversation."
              subtitle="Compare results within the selected competition and season."
            />
            <div className="panel comparison">
              <div className="compare-controls">
                <label>
                  First club
                  <select
                    aria-label="First comparison club"
                    value={a.team.id}
                    onChange={(e) => setFirst(e.target.value)}
                  >
                    {rows.map((r) => (
                      <option key={r.team.id} value={r.team.id}>
                        {shortName(r.team.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <span>VS</span>
                <label>
                  Second club
                  <select
                    aria-label="Second comparison club"
                    value={b.team.id}
                    onChange={(e) => setSecond(e.target.value)}
                  >
                    {rows.map((r) => (
                      <option key={r.team.id} value={r.team.id}>
                        {shortName(r.team.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Venue
                  <select
                    aria-label="Comparison venue"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  >
                    <option value="all">Home & away</option>
                    <option value="home">Home</option>
                    <option value="away">Away</option>
                  </select>
                </label>
              </div>
              <div className="compare-head">
                <span>
                  <Crest team={a.team} />
                  {shortName(a.team.name)}
                </span>
                <span>
                  <Crest team={b.team} />
                  {shortName(b.team.name)}
                </span>
              </div>
              {[
                "Recorded matches",
                "Points",
                "Goals scored",
                "Goals conceded",
                "Wins",
              ].map((label, i) => {
                const get = (id: string) => {
                  const list = outcomes(completed, id).filter(
                    (m) =>
                      location === "all" || m.home === (location === "home"),
                  );
                  return [
                    list.length,
                    list.reduce((s, m) => s + m.points, 0),
                    list.reduce((s, m) => s + m.gf, 0),
                    list.reduce((s, m) => s + m.ga, 0),
                    list.filter((m) => m.points === 3).length,
                  ][i];
                };
                const av = get(a.team.id),
                  bv = get(b.team.id),
                  sum = av + bv;
                return (
                  <div className="compare-row" key={label}>
                    <div>
                      <strong>{av}</strong>
                      <span>{label}</span>
                      <strong>{bv}</strong>
                    </div>
                    <div className="compare-bar">
                      <i style={{ width: `${sum ? (av / sum) * 100 : 50}%` }} />
                      <i style={{ width: `${sum ? (bv / sum) * 100 : 50}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <SectionHead
              title="The points journey"
              subtitle="Cumulative points, by each club’s recorded completed matches. All venues."
            />
            <div className="panel chart-panel">
              <Trend matches={completed} teams={[a.team, b.team]} />
            </div>
          </>
        ) : (
          <Empty title="More results needed">
            Club comparisons require two clubs in the selected dataset.
          </Empty>
        )}
        <div className="two-column">
          <section>
            <SectionHead
              title="How games are won"
              subtitle="Match outcome distribution"
            />
            <div className="panel distribution">
              {[
                ["Home win", wins],
                ["Draw", draws],
                ["Away win", away],
              ].map(([label, count], i) => (
                <div className="distribution-row" key={label as string}>
                  <div>
                    <span>{label}</span>
                    <strong>
                      {completed.length
                        ? `${((Number(count) / completed.length) * 100).toFixed(1)}%`
                        : "–"}
                      <small>{count} games</small>
                    </strong>
                  </div>
                  <div className="distribution-bar">
                    <i
                      style={{
                        width: `${completed.length ? (Number(count) / completed.length) * 100 : 0}%`,
                        background: ["#ae8bff", "#7797bb", "#54c9ae"][i],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <SectionHead
              title="Attacking output"
              subtitle="Total goals from recorded results"
            />
            <div className="panel goal-ranking">
              {[...rows]
                .sort((a, b) => b.gf - a.gf)
                .slice(0, 6)
                .map((r) => (
                  <div key={r.team.id}>
                    <Crest team={r.team} />
                    <span>{shortName(r.team.name)}</span>
                    <strong>{r.gf}</strong>
                  </div>
                ))}
            </div>
          </section>
        </div>
        <div className="methodology panel">
          <h3>Measured, never imagined.</h3>
          <p>
            Every metric on this page is calculated from the recorded final
            scores. Three points for a win, one for a draw. No predictions,
            expected goals, shot maps or invented performance ratings are shown.
            Records may be incomplete; calculated points exclude deductions.
          </p>
        </div>
      </DataGate>
    </>
  );
}
