import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconTable } from "../components/Icons";
import { StandingsTable } from "../components/table";
import { Empty, ErrorState, Skeleton } from "../components/ui";
import { endpoints, normaliseStandings } from "../lib/api";
import { useApi, useDocumentTitle, useStored } from "../lib/hooks";
import { DEFAULT_LEAGUE, LEAGUES, LEAGUE_BY_SLUG, leagueLogo } from "../lib/leagues";

export function LeaguePicker({ value, base }: { value: string; base: string }) {
  const nav = useNavigate();
  const [, setLast] = useStored<string>("pitch.league", DEFAULT_LEAGUE);
  return (
    <div className="chips" style={{ marginBottom: 22 }} role="tablist" aria-label="Competition">
      {LEAGUES.map((l) => (
        <button
          key={l.slug}
          className={`chip${value === l.slug ? " active" : ""}`}
          aria-pressed={value === l.slug}
          onClick={() => {
            setLast(l.slug);
            nav(`${base}/${l.slug}`, { replace: true });
          }}
        >
          <span className="chip-logo">
            <img src={leagueLogo(l.slug, false, 64)} alt="" loading="lazy" />
          </span>
          {l.short}
        </button>
      ))}
    </div>
  );
}

export function useLeagueParam(): string {
  const { league } = useParams();
  const [last] = useStored<string>("pitch.league", DEFAULT_LEAGUE);
  return league && LEAGUE_BY_SLUG[league] ? league : LEAGUE_BY_SLUG[last] ? last : DEFAULT_LEAGUE;
}

export default function Standings() {
  const league = useLeagueParam();
  const meta = LEAGUE_BY_SLUG[league];
  useDocumentTitle(`${meta.name} table`);
  const q = useApi<any>(endpoints.standings(league));
  const data = useMemo(() => (q.data ? normaliseStandings(q.data) : null), [q.data]);
  const groups = data?.groups.filter((g) => g.rows.length) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{data?.season || meta.region}</p>
          <h1 className="large-title">Tables</h1>
        </div>
      </div>
      <LeaguePicker value={league} base="/tables" />

      {q.loading ? (
        <Skeleton h={760} />
      ) : q.error && !data ? (
        <ErrorState onRetry={q.reload} />
      ) : !groups.length ? (
        <Empty icon={<IconTable />} title="Table not available yet">
          {meta.name} hasn’t published standings for this stage.
        </Empty>
      ) : (
        <div className={q.stale ? "refreshing" : ""} style={{ display: "grid", gap: 16 }}>
          {groups.map((g) => (
            <StandingsTable key={g.name} group={g} league={league} showTitle={groups.length > 1} />
          ))}
        </div>
      )}
    </div>
  );
}
