import { useMemo, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ClubInfo } from "../components/club/ClubInfo";
import { clubPalette } from "../components/club/color";
import { homeVenue, useClubCore, useClubGames, useStanding, useTeamInfo } from "../components/club/data";
import { Fixtures } from "../components/club/Fixtures";
import { IconStadium } from "../components/club/icons";
import { Overview } from "../components/club/Overview";
import { Squad } from "../components/club/Squad";
import { Stats } from "../components/club/Stats";
import { ClubTabs, FollowButton, SeasonBuilding } from "../components/club/ui";
import { IconChevronLeft, IconPeople, IconTrophy } from "../components/Icons";
import { Crest, Empty, ErrorState, Skeleton, tsdbSize } from "../components/ui";
import { t } from "../i18n";
import { useAccent } from "../lib/accent";
import { useSwipe } from "../lib/gestures";
import { useDocumentTitle, useTheme } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { usePeople } from "../lib/season";

const TABS = ["overview", "fixtures", "squad", "stats", "club"] as const;
type Tab = (typeof TABS)[number];

export default function Team() {
  const { league = "eng.1", id = "" } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "overview";
  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === "overview") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  };

  const { dark } = useTheme();
  const club = useClubCore(league, id);
  const core = club.core;
  const leagueName = LEAGUE_BY_SLUG[league]?.name ?? "";
  useDocumentTitle(core?.name ?? (club.loading ? "" : t("Club")));
  useAccent(core ? [core.color, core.alt] : null);
  const pal = useMemo(() => clubPalette(core?.color, core?.alt, dark), [core?.color, core?.alt, dark]);

  const { info, loading: infoLoading } = useTeamInfo(core);
  const { season, games, loading: gamesLoading } = useClubGames(league, id, leagueName);
  const standing = useStanding(league, id, season.data);
  const people = usePeople(league);
  const venueName = info?.stadium || homeVenue(games, id);

  const swipeRef = useSwipe<HTMLDivElement>((dir) => {
    const i = TABS.indexOf(tab);
    const next = TABS[i + (dir === -1 ? 1 : -1)];
    if (next) setTab(next);
  });

  const vars = {
    "--club": pal.accent,
    "--club-ink": pal.ink,
    "--on-club": pal.onAccent,
    "--club-hero": pal.hero,
    "--club-2": pal.second,
  } as CSSProperties;

  const tabs = [
    { value: "overview" as Tab, label: t("Overview") },
    { value: "fixtures" as Tab, label: t("Fixtures") },
    { value: "squad" as Tab, label: t("Squad") },
    { value: "stats" as Tab, label: t("Stats") },
    { value: "club" as Tab, label: t("Club") },
  ];

  const back = (
    <button type="button" className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(`/tables/${league}`))}>
      <IconChevronLeft />
      {t("Back")}
    </button>
  );

  if (club.loading) {
    return (
      <div className="page cl-page" style={vars} aria-busy="true">
        {back}
        <HeroSkeleton />
      </div>
    );
  }
  if (!core) {
    return (
      <div className="page cl-page">
        {back}
        {club.error && !/\(404\)/.test(club.error.message) ? (
          <ErrorState onRetry={club.reload} />
        ) : (
          <Empty icon={<IconPeople />} title={t("Club not found")} action={<Link className="btn" to={`/tables/${league}`}>{t("Back to the table")}</Link>}>
            {t("We couldn’t find this club. It may have moved competition.")}
          </Empty>
        )}
      </div>
    );
  }

  const img = info?.fanart?.[0] || info?.stadiumPhoto || null;
  const formed = info?.formed && /^\d{4}$/.test(String(info.formed).trim()) && Number(info.formed) > 1800 ? String(info.formed).trim() : null;

  return (
    <div className="page cl-page" style={vars}>
      {back}
      <section className={`team-hero cl-hero${img ? " has-img" : ""}`} aria-labelledby="cl-name">
        {img && <img className="bgimg" src={tsdbSize(img, "medium") ?? img} alt="" />}
        <div className="shade" aria-hidden="true" />
        <div className="content">
          <div className="crestwrap">
            <Crest src={core.logo} size={76} alt="" />
          </div>
          <div className="cl-hero-text">
            <p className="cl-hero-eyebrow">{core.summary || leagueName}</p>
            <h1 id="cl-name">{core.name}</h1>
            <div className="facts">
              {venueName && (
                <Link to={`/stadium/${league}/${id}`} className="cl-fact-link">
                  <IconStadium />
                  {venueName}
                </Link>
              )}
              {formed && (
                <span>
                  <IconTrophy />
                  {t("Est. {year}", { year: formed })}
                </span>
              )}
            </div>
          </div>
          <div className="cl-hero-actions">
            <FollowButton team={{ id: core.id, league, name: core.name, logo: core.logo, color: core.color }} />
          </div>
        </div>
      </section>

      <div className="cl-tabs-row">
        <ClubTabs tabs={tabs} value={tab} onChange={setTab} label={t("Club sections")} idBase="team" />
      </div>
      {tab !== "club" && tab !== "squad" && <SeasonBuilding progress={season.progress} building={season.building} />}

      <div
        id="team-panel"
        role="tabpanel"
        aria-labelledby={`team-tab-${tab}`}
        className="cl-panel"
        ref={swipeRef}
        key={tab}
      >
        {tab === "overview" && (
          <Overview
            league={league}
            core={core}
            hero={pal.hero}
            games={games}
            gamesLoading={gamesLoading}
            season={season.data}
            standing={standing}
            people={people.data}
          />
        )}
        {tab === "fixtures" && <Fixtures teamId={id} games={games} loading={gamesLoading} season={season.data} />}
        {tab === "squad" && <Squad league={league} teamId={id} teamName={core.name} logo={core.logo} hero={pal.hero} />}
        {tab === "stats" && <Stats league={league} teamId={id} season={season.data} loading={season.loading} />}
        {tab === "club" && <ClubInfo league={league} teamId={id} name={core.name} info={info} loading={infoLoading} venueName={venueName} />}
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <>
      <div className="cl-hero-skel skel" aria-hidden="true">
        <span className="c" />
        <span className="l1" />
        <span className="l2" />
      </div>
      <div className="cl-tabs-row" aria-hidden="true">
        <Skeleton h={46} r={23} style={{ width: "min(100%, 560px)" }} />
      </div>
      <div className="grid-2" aria-hidden="true">
        <Skeleton h={208} r={28} />
        <Skeleton h={208} r={28} />
      </div>
    </>
  );
}
