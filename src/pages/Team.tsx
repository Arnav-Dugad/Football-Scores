import { useParams, Link } from "react-router-dom";
import { useApp } from "../lib/state";
import { leagues, shortName, outcomes } from "../../shared/model";
import {
  Title,
  DataGate,
  Crest,
  Metrics,
  Form,
  Favorite,
  SectionHead,
  MatchCard,
  Empty,
} from "../components/UI";
export default function Team() {
  const { id } = useParams();
  const { data, league, path } = useApp();
  const r = data?.standings.find((r) => r.team.id === id);
  const l = leagues.find((x) => x.id === league)!;
  const games =
    data?.matches.filter((m) => m.home.id === id || m.away.id === id) ?? [];
  const completed = games
    .filter((m) => m.status === "finished")
    .sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = games
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date));
  const home = outcomes(games, id ?? "").filter((m) => m.home),
    away = outcomes(games, id ?? "").filter((m) => !m.home);
  return (
    <>
      <Title
        eyebrow={`${l.name.toUpperCase()} · CLUB PROFILE`}
        title={r ? shortName(r.team.name) : "Club profile"}
        description={`${l.country} · Selected season records`}
        action={
          r && (
            <Favorite id={`team:${league}:${r.team.id}`} label={r.team.name} />
          )
        }
      />
      <DataGate>
        {r ? (
          <>
            <div className="team-banner panel">
              <Crest team={r.team} large />
              <div>
                <h2>{r.team.name}</h2>
                <p>
                  {l.name} · Position #{r.position} in the calculated table
                </p>
                <Form form={r.form} />
              </div>
              <Link className="text-link" to={path("/standings")}>
                Season table
              </Link>
            </div>
            <Metrics
              items={[
                { label: "Points", value: r.points },
                { label: "Recorded matches", value: r.played },
                { label: "Goals scored", value: r.gf },
                {
                  label: "Goal difference",
                  value: `${r.gd > 0 ? "+" : ""}${r.gd}`,
                },
              ]}
            />
            <div className="two-column">
              <section>
                <SectionHead
                  title="Recent results"
                  subtitle="Newest completed matches first"
                />
                <div className="stack">
                  {completed.slice(0, 6).map((m) => (
                    <MatchCard match={m} key={m.id} />
                  ))}
                </div>
              </section>
              <section>
                <SectionHead title="Next fixtures" />
                <div className="stack">
                  {upcoming.slice(0, 6).map((m) => (
                    <MatchCard match={m} key={m.id} />
                  ))}
                </div>
                {!upcoming.length && (
                  <div className="panel">
                    <Empty title="Season fixtures complete">
                      No upcoming games recorded.
                    </Empty>
                  </div>
                )}
              </section>
            </div>
            <SectionHead
              title="Home comforts, away days"
              subtitle="Only completed recorded matches are included."
            />
            <div className="two-column">
              {[
                ["Home", home],
                ["Away", away],
              ].map(([name, ms]) => {
                const list = ms as typeof home;
                return (
                  <div className="panel split-card" key={name as string}>
                    <h3>{name as string}</h3>
                    <Metrics
                      items={[
                        { label: "Played", value: list.length },
                        {
                          label: "Points",
                          value: list.reduce((s, m) => s + m.points, 0),
                        },
                        {
                          label: "Goals",
                          value: list.reduce((s, m) => s + m.gf, 0),
                        },
                      ]}
                    />
                  </div>
                );
              })}
            </div>
            <div className="methodology panel">
              <h3>A profile grounded in results</h3>
              <p>
                Squad lists, stadium details and career history are not included
                in this dataset. Club initials are original fallback artwork;
                verified licensed crests can be added without changing the data
                model.
              </p>
            </div>
          </>
        ) : (
          <Empty title="Club not found in this season">
            Switch the competition or season to explore available clubs.
          </Empty>
        )}
      </DataGate>
    </>
  );
}
