import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Trophy } from "lucide-react";
import { useApp } from "../lib/state";
import { leagues, shortName } from "../../shared/model";
import {
  Title,
  DataGate,
  Table,
  MatchCard,
  SectionHead,
  Favorite,
  Crest,
  Empty,
} from "../components/UI";
export default function Competition() {
  const { data, league, season, path } = useApp();
  const [tab, setTab] = useState("overview");
  const l = leagues.find((x) => x.id === league)!;
  const completed =
    data?.matches
      .filter((m) => m.status === "finished")
      .sort((a, b) => b.date.localeCompare(a.date)) ?? [];
  const upcoming =
    data?.matches
      .filter((m) => m.status === "scheduled")
      .sort((a, b) => a.date.localeCompare(b.date)) ?? [];
  const rows = data?.standings ?? [];
  return (
    <>
      <Title
        eyebrow={`${l.country.toUpperCase()} · ${season}`}
        title={l.name}
        description="The rivalries. The race. The whole season."
        action={<Favorite id={`league:${league}`} label={l.name} />}
      />
      <div className="competition-banner panel">
        <span className="competition-symbol" style={{ color: l.accent }}>
          <Trophy size={42} />
        </span>
        <div>
          <span className="eyebrow">SEASON EXPLORER</span>
          <h2>
            {l.name} <span>{season}</span>
          </h2>
          <p>
            {rows.length} clubs · {completed.length} recorded results ·{" "}
            {upcoming.length} scheduled fixtures
          </p>
        </div>
        <Link className="button" to={path("/analytics")}>
          Explore analytics
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="tabs" role="tablist" aria-label="Competition views">
        {["overview", "fixtures", "results", "clubs"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <DataGate>
        {tab === "overview" ? (
          <div className="competition-overview">
            <section>
              <SectionHead
                title="The season table"
                subtitle="Calculated from recorded results"
                to={path("/standings")}
                link="All columns"
              />
              <div className="panel table-panel">
                <Table rows={rows} />
              </div>
            </section>
            <aside>
              <SectionHead title="Next up" subtitle="Dates from the provider" />
              <div className="stack">
                {upcoming.slice(0, 4).map((m) => (
                  <MatchCard match={m} key={m.id} />
                ))}
                {!upcoming.length && (
                  <div className="panel">
                    <Empty title="No upcoming fixtures">
                      Try another season.
                    </Empty>
                  </div>
                )}
              </div>
            </aside>
          </div>
        ) : tab === "clubs" ? (
          <div className="club-grid">
            {rows.map((r) => (
              <article className="panel club-card" key={r.team.id}>
                <Favorite
                  id={`team:${league}:${r.team.id}`}
                  label={r.team.name}
                />
                <Link to={path(`/team/${r.team.id}`)}>
                  <Crest team={r.team} large />
                  <h3>{shortName(r.team.name)}</h3>
                  <p>
                    {l.country} · {r.points} points
                  </p>
                  <span className="text-link">
                    Club profile
                    <ArrowUpRight size={15} />
                  </span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <>
            <SectionHead
              title={tab === "fixtures" ? "Coming up" : "The final whistles"}
              subtitle={`${tab === "fixtures" ? upcoming.length : completed.length} recorded matches`}
            />
            <div className="match-grid scores-grid">
              {(tab === "fixtures" ? upcoming : completed)
                .slice(0, 60)
                .map((m) => (
                  <MatchCard match={m} key={m.id} />
                ))}
            </div>
            {(tab === "fixtures" ? upcoming : completed).length > 60 && (
              <Link className="button load-more" to={path("/scores")}>
                Explore all in Scores
                <ArrowUpRight size={16} />
              </Link>
            )}
            {!(tab === "fixtures" ? upcoming : completed).length && (
              <Empty title="Nothing recorded for this view">
                Choose a different season.
              </Empty>
            )}
          </>
        )}
      </DataGate>
    </>
  );
}
