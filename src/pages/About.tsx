import { useQuery } from "@tanstack/react-query";
import { useApp } from "../lib/state";
import { Title, SectionHead } from "../components/UI";
export default function About() {
  const { data } = useApp();
  const status = useQuery({
    queryKey: ["provider-status"],
    queryFn: async () => {
      const r = await fetch("/api/status");
      if (!r.ok) throw new Error("Status unavailable");
      return (await r.json()) as Record<string, string | number>;
    },
    retry: false,
  });
  return (
    <>
      <Title
        eyebrow="TRANSPARENCY IS PART OF THE DESIGN"
        title="Behind the numbers"
        description="Where our football comes from, and exactly what it can tell you."
      />
      <div className="two-column">
        <div className="panel methodology">
          <h2>Real data. Honest coverage.</h2>
          <p>
            OpenFootball supplies community-maintained fixtures and results for
            five major European leagues. It is not a live feed and updates are
            not guaranteed. Its schema, scripts and data are dedicated to the
            public domain.
          </p>
          <p>
            <a
              href="https://github.com/openfootball/football.json"
              target="_blank"
              rel="noreferrer"
            >
              OpenFootball source & licence ↗
            </a>
          </p>
          <p>
            The optional football-data.org API supplies delayed scores and
            fixtures on its free tier. Football data provided by the
            Football-Data.org API. A free API token and distributed request
            budget must be configured to enable it.
          </p>
          <p>
            <a
              href="https://www.football-data.org/pricing"
              target="_blank"
              rel="noreferrer"
            >
              football-data.org coverage & pricing ↗
            </a>
          </p>
        </div>
        <div className="panel methodology">
          <h2>Calculated, with care.</h2>
          <p>
            Season tables use completed scores: three points per win and one per
            draw. Ties use goal difference, goals scored, then alphabetical
            order. These tables exclude disciplinary point deductions and
            league-specific head-to-head rules.
          </p>
          <p>
            Analytics are descriptive summaries of recorded results. We show no
            invented xG, shot data or forecasts. Form is the last five completed
            games, oldest to newest. Latest results are sorted by date, with
            source order as a tie-break; there is no fabricated trending score.
          </p>
          <p>
            OpenFootball match times lack verified timezone metadata. We show
            dates only. UTC kickoff times from football-data.org are displayed
            in your browser’s timezone.
          </p>
        </div>
      </div>
      <SectionHead
        title="Provider status"
        subtitle="Configuration and retrieval information, not an uptime guarantee."
      />
      <div className="panel methodology">
        {status.isPending ? (
          <p role="status">Checking provider configuration…</p>
        ) : status.error ? (
          <p>
            Provider status unavailable. The current dataset’s source is shown
            below.
          </p>
        ) : (
          <dl className="status-list">
            {Object.entries(status.data ?? {}).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {data && (
          <>
            <p>
              Current data: {data.meta.source}. Retrieved{" "}
              {new Date(data.meta.fetchedAt).toLocaleString()}. Latest recorded
              result: {data.meta.latestResult ?? "None"}.{" "}
              {data.meta.stale
                ? "Saved snapshot is in use."
                : "Provider retrieval succeeded."}
            </p>
            <p>
              <a href={data.meta.sourceUrl} target="_blank" rel="noreferrer">
                Inspect the source ↗
              </a>
            </p>
          </>
        )}
      </div>
      <div className="two-column">
        <div className="panel methodology">
          <h2>Artwork & identity</h2>
          <p>
            Club initials and the pitch illustration are original interface
            artwork. Third-party club crests and player photographs are omitted
            until image-specific permissions or licence records are verified.
            API access alone does not grant image rights.
          </p>
        </div>
        <div className="panel methodology">
          <h2>Your privacy</h2>
          <p>
            No accounts, advertising trackers or analytics cookies. Favourites,
            recent searches and appearance preferences stay in browser storage.
            Providers and hosting platforms receive requests needed to deliver
            the service.
          </p>
          <p>
            Player name lookup is supplied by{" "}
            <a
              href="https://www.thesportsdb.com/"
              target="_blank"
              rel="noreferrer"
            >
              TheSportsDB
            </a>
            . Free lookup is limited and may return one player. Images and
            career statistics are unavailable.
          </p>
        </div>
      </div>
    </>
  );
}
