import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CalendarDays,
  Globe2,
  Trophy,
} from "lucide-react";
import { useApp } from "../lib/state";
import { leagues, shortName, matchDate } from "../../shared/model";
import {
  Title,
  DataGate,
  SectionHead,
  MatchCard,
  Crest,
  Table,
  Empty,
  Favorite,
  matchStatus,
} from "../components/UI";
export default function Dashboard() {
  const { data, league, season, path, favorites } = useApp();
  const competition = leagues.find((l) => l.id === league)!;
  const today = new Date().toLocaleDateString("en-CA");
  const todays = data?.matches.filter((m) => matchDate(m) === today) ?? [];
  const finished =
    data?.matches
      .filter((m) => m.status === "finished")
      .sort(
        (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      ) ?? [];
  const spotlight = finished[0] ?? data?.matches[0];
  const top = data?.standings[0];
  const count = finished.length;
  const total = finished.reduce(
    (sum, m) => sum + (m.score?.[0] ?? 0) + (m.score?.[1] ?? 0),
    0,
  );
  return (
    <>
      <Title
        eyebrow="YOUR FOOTBALL COMMAND CENTER"
        title="The beautiful game. In focus."
        description="Every result. Every rivalry. A little closer to the game."
        action={
          <span className="today-label">
            <CalendarDays size={16} />
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </span>
        }
      />
      <DataGate>
        <section className="hero-grid">
          <div className="hero-story">
            <div className="hero-content">
              <span className="pill">
                <span className="status-dot" />
                THE MATCHDAY EDIT
              </span>
              <h2>
                All the football.
                <br />
                <span>None of the noise.</span>
              </h2>
              <p>
                A clearer view of {competition.name}. Explore the scores, follow
                your clubs, and find the stories in the numbers.
              </p>
              <Link className="button primary" to={path("/scores")}>
                Explore matchday
                <ArrowRight size={17} />
              </Link>
              <div className="hero-meta">
                <span>
                  <Globe2 size={14} />5 European leagues
                </span>
                <span>Authentic data. Always.</span>
              </div>
            </div>
            <div className="pitch-art" aria-hidden="true">
              <div className="pitch-lines">
                <span className="pitch-circle" />
                <span className="pitch-half" />
                <span className="pitch-box box-left" />
                <span className="pitch-box box-right" />
              </div>
              <div className="pitch-ball" />
            </div>
          </div>
          {spotlight && (
            <article className="spotlight panel">
              <div className="spotlight-head">
                <span className="eyebrow">LATEST RESULT</span>
                <Favorite
                  id={`match:${league}:${season}:${spotlight.id}`}
                  label="featured match"
                />
              </div>
              <div className="spotlight-league">
                <Trophy size={15} />
                {competition.name} · {spotlight.round}
              </div>
              <div className="spotlight-score">
                <Link to={path(`/team/${spotlight.home.id}`)}>
                  <Crest team={spotlight.home} large />
                  <span>{shortName(spotlight.home.name)}</span>
                </Link>
                <div>
                  <strong>
                    {spotlight.score?.[0] ?? "–"}
                    <em>:</em>
                    {spotlight.score?.[1] ?? "–"}
                  </strong>
                  <span className="pill score-pill">
                    {matchStatus(spotlight)}
                  </span>
                </div>
                <Link to={path(`/team/${spotlight.away.id}`)}>
                  <Crest team={spotlight.away} large />
                  <span>{shortName(spotlight.away.name)}</span>
                </Link>
              </div>
              <div className="spotlight-date">
                {new Date(
                  matchDate(spotlight) + "T12:00:00",
                ).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {spotlight.half && (
                  <span>Half time {spotlight.half.join(" : ")}</span>
                )}
              </div>
              <Link
                className="spotlight-link"
                to={path(`/match/${spotlight.id}`)}
              >
                Inside the match
                <ArrowUpRight size={17} />
              </Link>
            </article>
          )}
        </section>
        <div className="dashboard-grid">
          <section>
            <SectionHead
              title="On the pitch today"
              subtitle={`${competition.name} · ${todays.length} recorded fixtures`}
              to={path("/scores")}
              link="Match calendar"
            />
            {todays.length ? (
              <div className="match-grid">
                {todays.map((m) => (
                  <MatchCard match={m} key={m.id} />
                ))}
              </div>
            ) : (
              <div className="panel quiet-card">
                <CalendarDays size={23} />
                <div>
                  <h3>A breather between matchdays.</h3>
                  <p>
                    No fixtures recorded for today in this competition. Explore
                    the calendar for the next round.
                  </p>
                </div>
                <Link to={path("/scores")} aria-label="Open match calendar">
                  <ArrowUpRight size={20} />
                </Link>
              </div>
            )}
            <SectionHead
              title="The latest whistles"
              subtitle="Completed matches, newest first"
              to={path("/scores")}
            />
            <div className="match-grid">
              {finished.slice(0, 4).map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
            {!finished.length && (
              <Empty title="No recorded results">
                Results will appear when supplied by the data source.
              </Empty>
            )}
            <SectionHead
              title="Your football, your way"
              subtitle="Five leagues. Endless stories."
            />
            <div className="league-grid">
              {leagues.map((l, i) => (
                <Link
                  className="league-tile panel"
                  key={l.id}
                  to={path("/competition", l.id)}
                >
                  <span className="league-symbol" style={{ color: l.accent }}>
                    {["✦", "◉", "▰", "◇", "✧"][i]}
                  </span>
                  <span>
                    {l.name}
                    <small>{l.country}</small>
                  </span>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          </section>
          <aside>
            <SectionHead
              title="Season lens"
              subtitle={`${season} · result-derived`}
            />
            <div className="panel lens-card">
              <span className="eyebrow">THE NUMBERS THAT MATTER</span>
              <div className="lens-value">
                {count ? (total / count).toFixed(2) : "–"}
                <span>goals / match</span>
              </div>
              <p>
                {total} goals across {count} recorded completed matches.
              </p>
              <div className="mini-metrics">
                <span>
                  <strong>{data?.standings.length ?? 0}</strong>clubs
                </span>
                <span>
                  <strong>
                    {data?.matches.filter((m) => m.status === "scheduled")
                      .length ?? 0}
                  </strong>
                  fixtures ahead
                </span>
              </div>
              <Link className="text-link" to={path("/analytics")}>
                Find the patterns
                <ChartNoAxesCombined size={16} />
              </Link>
            </div>
            <SectionHead
              title="At the top"
              to={path("/standings")}
              link="Full table"
            />
            <div className="panel table-panel">
              <Table rows={data?.standings ?? []} limit={5} sort={false} />
            </div>
            {top && (
              <div className="leader-note">
                <Crest team={top.team} />
                <p>
                  <strong>{shortName(top.team.name)}</strong> lead the
                  result-derived table with {top.points} points.
                </p>
              </div>
            )}
            <SectionHead
              title="Your clubs"
              to={path("/favorites")}
              link="Manage"
            />
            <div className="panel saved-preview">
              {data?.standings
                .filter((r) =>
                  favorites.includes(`team:${league}:${r.team.id}`),
                )
                .map((r) => (
                  <Link
                    key={r.team.id}
                    className="search-result"
                    to={path(`/team/${r.team.id}`)}
                  >
                    <Crest team={r.team} />
                    {shortName(r.team.name)}
                  </Link>
                ))}
              {!data?.standings.some((r) =>
                favorites.includes(`team:${league}:${r.team.id}`),
              ) && (
                <p>Tap a star on a club profile to make this space yours.</p>
              )}
            </div>
          </aside>
        </div>
      </DataGate>
    </>
  );
}
