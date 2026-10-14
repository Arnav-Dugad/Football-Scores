import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconChevronLeft, IconPeople } from "../components/Icons";
import { CareerTimeline, Honours, useCareer } from "../components/player/Career";
import { CompTable } from "../components/player/CompTable";
import { FormChart } from "../components/player/FormChart";
import { HeroSkeleton, NextMatch, PlayerHero, footLabel } from "../components/player/Hero";
import { Milestones } from "../components/player/Milestones";
import { ShotMap } from "../components/player/ShotMap";
import { Tiles, TilesSkeleton, seasonLine, tilesFor } from "../components/player/Tiles";
import { computeMilestones, overviewPath, parseOverview, shortBio, shotsFor } from "../components/player/data";
import { useProfile, type Profile } from "../components/player/profile";
import { Empty, ErrorState, Skeleton } from "../components/ui";
import { t } from "../i18n";
import { fmtDate } from "../lib/format";
import { useApi, useDocumentTitle } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { usePeople, useSeason, useShots } from "../lib/season";

export default function Player() {
  const { league = "", id = "" } = useParams();
  const nav = useNavigate();
  const p = useProfile(league, id);
  useDocumentTitle(p.name || t("Player"));

  const back = (
    <button className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(LEAGUE_BY_SLUG[league] ? `/stats/${league}` : "/stats"))}>
      <IconChevronLeft />
      {t("Back")}
    </button>
  );

  if (!p.valid || (p.notFound && !p.error)) {
    return (
      <div className="page pl-page">
        {back}
        <Empty
          icon={<IconPeople />}
          title={t("Player not found")}
          action={
            <Link className="btn" to="/stats">
              {t("Browse stats")}
            </Link>
          }
        >
          {t("We couldn’t find this player. They may have left the competition, or the link is incomplete.")}
        </Empty>
      </div>
    );
  }
  if (p.error && !p.name) {
    return (
      <div className="page pl-page">
        {back}
        <ErrorState onRetry={p.reload} />
      </div>
    );
  }
  if (p.loading || !p.name) {
    return (
      <div className="page pl-page" aria-busy="true">
        {back}
        <PlayerSkeleton />
      </div>
    );
  }
  return (
    <div className="page pl-page">
      {back}
      <PlayerBody key={`${p.league}:${p.id}`} p={p} />
    </div>
  );
}

function PlayerBody({ p }: { p: Profile }) {
  const ovQ = useApi<any>(overviewPath(p.league, p.id));
  const ov = useMemo(() => (ovQ.data ? parseOverview(ovQ.data, p.league, p.team?.id ?? null) : null), [ovQ.data, p.league, p.team?.id]);
  const known = LEAGUE_BY_SLUG[p.league] ? p.league : null;
  const season = useSeason(known);
  const people = usePeople(known);
  const teamId = p.person?.t ?? p.team?.id ?? null;
  const shotsQ = useShots(known, teamId ? { team: teamId } : { player: p.name });
  const shots = useMemo(() => shotsFor(shotsQ.data?.shots ?? [], p.name), [shotsQ.data, p.name]);
  const career = useCareer(p.info?.tsdbId);

  const teamName = p.team?.short || p.team?.name || "";
  const keeper = p.pos === "G";
  const line = seasonLine(p, ov);
  const cleanSheets = keeper ? line.clean : null;
  const milestones = useMemo(
    () =>
      computeMilestones({
        season: season.data,
        person: p.person,
        people: people.data?.players ?? [],
        shots,
        who: { id: p.id, name: p.name, team: teamId },
        league: p.league,
        teamName,
        cleanSheets,
      }),
    [season.data, p.person, people.data, shots, p.id, p.name, teamId, p.league, teamName, cleanSheets],
  );

  const tiles = tilesFor(line, keeper);
  const leagueName = LEAGUE_BY_SLUG[p.league]?.name;
  const tilesLoading = line.source === "none" && (ovQ.loading || people.loading);
  const bio = shortBio(p.info?.bio);
  const showShots = !!known && (p.pos !== "G" || shots.length > 0);

  return (
    <>
      <PlayerHero p={p} />
      {ov?.next && <NextMatch g={ov.next} team={p.team} />}

      <section className="section" aria-labelledby="pl-season-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t("This season")}</p>
            <h2 className="section-title" id="pl-season-title">
              {leagueName ? t("{league} season", { league: leagueName }) : t("League season")}
            </h2>
          </div>
          {line.source === "espn" && <span className="pill">{t("Source: ESPN")}</span>}
        </div>
        {tilesLoading ? (
          <TilesSkeleton />
        ) : line.source === "none" ? (
          <p className="glass pl-card pl-empty-line">{t("No league appearances recorded this season yet.")}</p>
        ) : (
          <Tiles tiles={tiles} />
        )}
      </section>

      <div className="pl-grid pl-grid-form section">
        {ovQ.loading && !ov ? <Skeleton h={300} r={28} /> : <FormChart games={ov?.games ?? []} keeper={keeper} />}
        <Milestones items={milestones} building={season.building} />
      </div>

      {showShots && (
        <div className="section">
          {shotsQ.loading && !shotsQ.data ? (
            <Skeleton h={420} r={28} />
          ) : (
            <ShotMap shots={shots} season={season.data} league={p.league} building={season.building} />
          )}
        </div>
      )}

      <div className="pl-grid section">
        {ovQ.loading && !ov ? (
          <Skeleton h={260} r={28} />
        ) : ov ? (
          <CompTable ov={ov} league={p.league} />
        ) : (
          <section className="glass pl-card">
            <h2 className="panel-title">{t("By competition")}</h2>
            <p className="pl-empty-line">{t("Competition stats are unavailable right now.")}</p>
          </section>
        )}
        <About p={p} bio={bio} />
      </div>

      <div className="pl-grid section">
        <CareerTimeline
          data={career.data}
          loading={career.loading || (!p.infoDone && !career.data)}
          current={p.team ? { name: p.team.name, logo: p.team.logo } : null}
        />
        <Honours data={career.data} loading={career.loading || (!p.infoDone && !career.data)} />
      </div>
    </>
  );
}

function About({ p, bio }: { p: Profile; bio: string | null }) {
  const born = p.dob && !Number.isNaN(Date.parse(p.dob)) ? fmtDate(`${p.dob}T12:00:00`) : null;
  const facts: [string, string][] = [];
  if (born) facts.push([t("Born"), p.info?.birthplace ? `${born} · ${p.info.birthplace}` : born]);
  if (p.nat) facts.push([t("Nationality"), p.nat]);
  if (p.posName) facts.push([t("Position"), t(p.posName)]);
  if (p.height) facts.push([t("Height"), p.height]);
  const foot = footLabel(p.foot);
  if (foot) facts.push([t("Preferred foot"), foot]);
  return (
    <section className="glass pl-card" aria-labelledby="pl-about-title">
      <header className="pl-card-head">
        <div className="pl-card-titles">
          <h2 className="panel-title" id="pl-about-title">
            {t("About")}
          </h2>
        </div>
      </header>
      {facts.length > 0 && (
        <dl className="pl-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {bio ? (
        <p className="pl-bio" lang="en" dir="auto">
          {bio}
        </p>
      ) : p.infoDone ? (
        <p className="pl-empty-line">{t("No biography available.")}</p>
      ) : (
        <div className="pl-bio-skel" aria-hidden>
          <Skeleton h={12} r={6} />
          <Skeleton h={12} r={6} />
          <Skeleton h={12} r={6} style={{ width: "60%" }} />
        </div>
      )}
      {p.info?.source && (
        <p className="pl-credit">
          {p.info.source === "thesportsdb" ? t("Photo and biography: TheSportsDB") : t("Photo and biography: Wikimedia Commons")}
        </p>
      )}
    </section>
  );
}

function PlayerSkeleton() {
  return (
    <>
      <HeroSkeleton />
      <div className="section">
        <Skeleton h={14} r={7} style={{ width: 120, marginBottom: 10 }} />
        <Skeleton h={26} r={10} style={{ width: 260, marginBottom: 16 }} />
        <TilesSkeleton />
      </div>
      <div className="pl-grid pl-grid-form section">
        <Skeleton h={300} r={28} />
        <Skeleton h={300} r={28} />
      </div>
      <div className="section">
        <Skeleton h={420} r={28} />
      </div>
    </>
  );
}
