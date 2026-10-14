import { useMemo } from "react";
import { IconNews } from "../components/Icons";
import { NewsCard, NewsFeature } from "../components/news";
import { Empty, ErrorState, Skeleton } from "../components/ui";
import { endpoints, normaliseNews } from "../lib/api";
import { useApi, useDocumentTitle } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { LeaguePicker, useLeagueParam } from "./Standings";

export default function News() {
  const league = useLeagueParam();
  const meta = LEAGUE_BY_SLUG[league];
  useDocumentTitle(`${meta.name} news`);
  const q = useApi<any>(endpoints.news(league), { refresh: 300_000 });
  const articles = useMemo(() => (q.data ? normaliseNews(q.data) : []), [q.data]);
  const [lead, ...rest] = articles.filter((a) => a.image);
  const textOnly = articles.filter((a) => !a.image);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{meta.name}</p>
          <h1 className="large-title">News</h1>
        </div>
      </div>
      <LeaguePicker value={league} base="/news" />

      {q.loading ? (
        <>
          <Skeleton h={420} r={32} />
          <div className="news-grid" style={{ marginTop: 16 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={300} />
            ))}
          </div>
        </>
      ) : q.error && !articles.length ? (
        <ErrorState onRetry={q.reload} />
      ) : !articles.length ? (
        <Empty icon={<IconNews />} title="No stories right now">
          Check back soon for the latest from {meta.name}.
        </Empty>
      ) : (
        <div className={q.stale ? "refreshing" : ""}>
          {lead && <NewsFeature a={lead} />}
          <div className="news-grid" style={{ marginTop: 16 }}>
            {[...rest, ...textOnly].map((a, i) => (
              <NewsCard key={a.id} a={a} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
