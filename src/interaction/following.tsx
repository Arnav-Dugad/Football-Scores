import { useMemo } from "react";
import { Link } from "react-router-dom";
import { IconChevronRight, IconStarFill } from "../components/Icons";
import { MatchCard } from "../components/match";
import { Crest } from "../components/ui";
import { t } from "../i18n";
import { endpoints, normaliseSchedule, type Match, type TeamGame } from "../lib/api";
import { fmtDayShort, fmtTime, relativeDayLabel } from "../lib/format";
import { useApi } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import type { FollowTeam } from "../lib/settings";
import { Bone, Dot } from "./skeletons";

/**
 * "Your clubs" — first section on Scores. Followed clubs' matches for the
 * selected day; when there are none, each followed club's next fixture.
 */
export function YourClubs({ matches, teams, featuredId }: { matches: Match[]; teams: FollowTeam[]; featuredId?: string }) {
  if (!teams.length) return null;
  return (
    <section className="ix-yours" aria-labelledby="yours-title">
      <div className="ix-yours-head">
        <span className="ix-yours-ic" aria-hidden>
          <IconStarFill />
        </span>
        <h2 id="yours-title">{t("Your clubs")}</h2>
        <Link to="/settings" className="link">
          {t("Edit")}
          <IconChevronRight width={14} height={14} />
        </Link>
      </div>
      {matches.length ? (
        <div className="match-grid">
          {matches.map((m, i) => (
            <MatchCard key={m.id} m={m} index={i} showLeague vt={m.id !== featuredId} />
          ))}
        </div>
      ) : (
        <div className="ix-next-grid">
          {teams.slice(0, 6).map((tm, i) => (
            <NextFixture key={tm.id} team={tm} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function NextFixture({ team, index }: { team: FollowTeam; index: number }) {
  const q = useApi<any>(endpoints.fixtures(team.league, team.id));
  const next = useMemo<TeamGame | null>(() => {
    if (!q.data) return null;
    try {
      const now = Date.now();
      return (
        normaliseSchedule(q.data)
          .filter((g) => g.state === "in" || (g.state === "pre" && new Date(g.date).getTime() > now - 3 * 3600e3))
          .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
      );
    } catch {
      return null;
    }
  }, [q.data]);

  const delay = { animationDelay: `${Math.min(index, 6) * 40}ms` };

  if (q.loading) {
    return (
      <div className="ix-next glass" style={delay} aria-hidden>
        <Dot size={36} />
        <div className="ix-next-text">
          <Bone w="70%" h={14} />
          <Bone w="45%" h={11} />
        </div>
      </div>
    );
  }

  if (!next) {
    return (
      <Link to={`/team/${team.league}/${team.id}`} className="ix-next glass" style={delay}>
        <Crest src={team.logo} size={36} alt="" />
        <span className="ix-next-text">
          <b>{team.name}</b>
          <small>{q.error && !q.data ? t("Fixtures unavailable right now") : t("No upcoming fixtures scheduled")}</small>
        </span>
        <IconChevronRight className="chev" width={16} height={16} />
      </Link>
    );
  }

  const slug = next.leagueSlug && LEAGUE_BY_SLUG[next.leagueSlug] ? next.leagueSlug : team.league;
  const d = new Date(next.date);
  const when = `${relativeDayLabel(d) ?? fmtDayShort(d)} · ${fmtTime(d)}`;
  const comp = LEAGUE_BY_SLUG[slug]?.name ?? next.league;
  return (
    <Link
      to={`/match/${slug}/${next.id}`}
      className="ix-next glass"
      style={delay}
      aria-label={t("Next: {home} v {away}, {when}", { home: next.home.name, away: next.away.name, when })}
    >
      <span className="ix-next-crests" aria-hidden>
        <Crest src={next.home.logo} size={30} alt="" />
        <Crest src={next.away.logo} size={30} alt="" />
      </span>
      <span className="ix-next-text">
        <small className="ix-next-kicker">{t("Next match")}</small>
        <b>
          {next.home.short || next.home.name} <span className="subtle">{t("v")}</span> {next.away.short || next.away.name}
        </b>
        <small>
          {next.state === "in" ? <span className="ix-next-live">{t("Live now")}</span> : when}
          {comp ? ` · ${t(comp)}` : ""}
        </small>
      </span>
      <IconChevronRight className="chev" width={16} height={16} />
    </Link>
  );
}
