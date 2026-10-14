import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IconNews, IconStar } from "../components/Icons";
import { NewsCard } from "../components/news";
import { ClubPicker } from "../components/prefs";
import { Crest, Empty, Sheet, Skeleton } from "../components/ui";
import { t } from "../i18n";
import { endpoints, getJSON, normaliseNews, normaliseSchedule, type Article, type TeamGame } from "../lib/api";
import { fmtDayLong, fmtDayShort, fmtTime, relativeDayLabel } from "../lib/format";
import { useApi, useDocumentTitle } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { toggleFollow, useSettings, type FollowTeam } from "../lib/settings";

/* Your daily digest: followed clubs' latest result and next fixture,
   transfer talk and the top stories about them. */

const TRANSFER =
  /\b(transfers?|sign(s|ed|ing)?|bids?|loans?|deals?|contracts?|targets?|rumou?rs?|fees?|swaps?|linked|talks|agree(s|d)?|joins?|exit|departure|extension|window|move)\b/i;

function resultFor(g: TeamGame, id: string): "W" | "D" | "L" | null {
  const us = g.home.id === id ? g.home.score : g.away.score;
  const them = g.home.id === id ? g.away.score : g.home.score;
  if (us == null || them == null) return null;
  return us > them ? "W" : us < them ? "L" : "D";
}

function ClubDigest({ tm }: { tm: FollowTeam }) {
  const results = useApi<any>(endpoints.results(tm.league, tm.id));
  const fixtures = useApi<any>(endpoints.fixtures(tm.league, tm.id));
  const last = useMemo(
    () =>
      results.data
        ? normaliseSchedule(results.data)
            .filter((g) => g.state === "post")
            .sort((x, y) => y.date.localeCompare(x.date))[0] ?? null
        : null,
    [results.data],
  );
  const next = useMemo(
    () =>
      fixtures.data
        ? normaliseSchedule(fixtures.data)
            .filter((g) => g.state !== "post")
            .sort((x, y) => x.date.localeCompare(y.date))[0] ?? null
        : null,
    [fixtures.data],
  );
  const loading = results.loading || fixtures.loading;
  const opp = (g: TeamGame) => (g.home.id === tm.id ? g.away : g.home);
  const r = last ? resultFor(last, tm.id) : null;
  const slugOf = (g: TeamGame) => g.leagueSlug || tm.league;

  return (
    <article className="dg-club glass">
      <Link to={`/team/${tm.league}/${tm.id}`} className="dg-club-head">
        <Crest src={tm.logo} size={40} alt="" />
        <span>
          <b>{tm.name}</b>
          <small>{t(LEAGUE_BY_SLUG[tm.league]?.name ?? "")}</small>
        </span>
      </Link>
      {loading ? (
        <Skeleton h={96} r={14} />
      ) : (
        <div className="dg-rows">
          {last ? (
            <Link to={`/match/${slugOf(last)}/${last.id}`} className="dg-row">
              <span className="dg-k">{t("Last result")}</span>
              <span className="dg-v">
                {r && <span className={`form-dot ${r}`}>{t(`form::${r}`)}</span>}
                <Crest src={opp(last).logo} size={20} alt="" />
                <span className="dg-opp">{opp(last).short}</span>
                <b className="num">
                  {last.home.score}–{last.away.score}
                </b>
              </span>
              <span className="dg-when">{fmtDayShort(last.date)}</span>
            </Link>
          ) : (
            <p className="muted dg-none">{t("No results yet this season.")}</p>
          )}
          {next ? (
            <Link to={`/match/${slugOf(next)}/${next.id}`} className="dg-row">
              <span className="dg-k">{t("Next")}</span>
              <span className="dg-v">
                <span className="subtle">{next.home.id === tm.id ? t("vs") : t("at")}</span>
                <Crest src={opp(next).logo} size={20} alt="" />
                <span className="dg-opp">{opp(next).short}</span>
              </span>
              <span className="dg-when">
                {relativeDayLabel(new Date(next.date)) ?? fmtDayShort(next.date)} · {fmtTime(next.date)}
              </span>
            </Link>
          ) : (
            <p className="muted dg-none">{t("No upcoming fixtures scheduled.")}</p>
          )}
        </div>
      )}
    </article>
  );
}

export default function Digest() {
  useDocumentTitle(t("Your digest"));
  const [s] = useSettings();
  const [picker, setPicker] = useState(false);
  const [news, setNews] = useState<(Article & { team: FollowTeam })[] | null>(null);
  const key = s.teams.map((tm) => `${tm.league}:${tm.id}`).join(",");

  useEffect(() => {
    if (!s.teams.length) {
      setNews([]);
      return;
    }
    let cancelled = false;
    setNews(null);
    Promise.all(
      s.teams.map((tm) =>
        getJSON<any>(endpoints.teamNews(tm.league, tm.id))
          .then((d) => normaliseNews(d).map((a) => ({ ...a, team: tm })))
          .catch(() => []),
      ),
    ).then((lists) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const all = lists
        .flat()
        .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
        .sort((x, y) => (y.published || "").localeCompare(x.published || ""));
      setNews(all);
    });
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const transfers = (news ?? []).filter((a) => TRANSFER.test(`${a.headline} ${a.description}`)).slice(0, 10);
  const stories = (news ?? []).filter((a) => !transfers.includes(a)).slice(0, 9);

  return (
    <div className="page dg-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{fmtDayLong(new Date())}</p>
          <h1 className="large-title">{t("Your digest")}</h1>
        </div>
        {s.teams.length > 0 && (
          <button type="button" className="btn ghost dg-edit" onClick={() => setPicker(true)}>
            <IconStar width={16} height={16} />
            {t("Edit clubs")}
          </button>
        )}
      </div>

      {!s.teams.length ? (
        <Empty
          icon={<IconStar />}
          title={t("Follow your clubs")}
          action={
            <button type="button" className="btn" onClick={() => setPicker(true)}>
              {t("Choose your clubs")}
            </button>
          }
        >
          {t("Your digest brings together results, fixtures, transfer talk and news for the clubs you follow.")}
        </Empty>
      ) : (
        <>
          <div className="dg-clubs">
            {s.teams.map((tm) => (
              <ClubDigest key={`${tm.league}:${tm.id}`} tm={tm} />
            ))}
          </div>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">{t("Transfer talk")}</h2>
            </div>
            {news === null ? (
              <div className="rail">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} h={260} />
                ))}
              </div>
            ) : transfers.length ? (
              <div className="rail">
                {transfers.map((a, i) => (
                  <NewsCard key={a.id} a={a} index={i} />
                ))}
              </div>
            ) : (
              <p className="muted">{t("No transfer news about your clubs right now.")}</p>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2 className="section-title">{t("Top stories for you")}</h2>
            </div>
            {news === null ? (
              <div className="news-grid">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} h={300} />
                ))}
              </div>
            ) : stories.length ? (
              <div className="news-grid">
                {stories.map((a, i) => (
                  <NewsCard key={a.id} a={a} index={i} />
                ))}
              </div>
            ) : (
              <Empty icon={<IconNews />} title={t("No stories right now")} />
            )}
          </section>
        </>
      )}

      {picker && (
        <Sheet label={t("Choose your clubs")} onClose={() => setPicker(false)}>
          <div className="sheet-pad">
            <h2 className="sheet-title">{t("Choose your clubs")}</h2>
            <ClubPicker selected={s.teams} onToggle={(tm) => toggleFollow(tm)} />
            <button type="button" className="btn wide" onClick={() => setPicker(false)}>
              {t("Done")}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
