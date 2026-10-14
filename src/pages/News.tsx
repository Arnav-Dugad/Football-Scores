import { useMemo } from "react";
import { IconNews } from "../components/Icons";
import { NewsCard, NewsFeature } from "../components/news";
import { Empty, ErrorState } from "../components/ui";
import { t } from "../i18n";
import { NewsPageSkeleton } from "../interaction/skeletons";
import { endpoints, normaliseNews } from "../lib/api";
import { useApi, useDocumentTitle } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { LeaguePicker, useLeagueParam } from "./Standings";

export default function News() {
  const league = useLeagueParam();
  const meta = LEAGUE_BY_SLUG[league];
  const leagueName = t(meta.name);
  useDocumentTitle(t("{league} news", { league: leagueName }));
  const q = useApi<any>(endpoints.news(league), { refresh: 300_000 });
  const articles = useMemo(() => (q.data ? normaliseNews(q.data) : []), [q.data]);
  const withImage = articles.filter((a) => a.image);
  const [lead, ...rest] = withImage;
  const textOnly = articles.filter((a) => !a.image);
  // Switching league with nothing cached: show the skeleton, not the previous league's stories.
  const pending = q.loading || q.stale;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{leagueName}</p>
          <h1 className="large-title">{t("News")}</h1>
        </div>
      </div>
      <LeaguePicker value={league} base="/news" />

      {pending ? (
        <NewsPageSkeleton />
      ) : q.error && !articles.length ? (
        <ErrorState onRetry={q.reload} />
      ) : !articles.length ? (
        <Empty icon={<IconNews />} title={t("No stories right now")}>
          {t("Check back soon for the latest from {league}.", { league: leagueName })}
        </Empty>
      ) : (
        <div key={league}>
          {lead && <NewsFeature a={lead} />}
          {rest.length + textOnly.length > 0 && (
            <div className="news-grid" style={{ marginTop: 16 }}>
              {[...rest, ...textOnly].map((a, i) => (
                <NewsCard key={a.id} a={a} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
