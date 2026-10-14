import { Link, useSearchParams } from "react-router-dom";
import { IconChevronRight } from "../components/Icons";
import { BuildingBadge, LeagueNav } from "../components/league/chrome";
import { useLeagueData } from "../components/league/data";
import { DisciplineView } from "../components/league/DisciplineView";
import { FormView } from "../components/league/FormView";
import { Overview } from "../components/league/Overview";
import { PlayersView } from "../components/league/PlayersView";
import { ProjectionView } from "../components/league/ProjectionView";
import { RaceView } from "../components/league/RaceView";
import { RatingsView } from "../components/league/RatingsView";
import { ErrorState } from "../components/ui";
import { t } from "../i18n";
import { useDocumentTitle } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { LeaguePicker, useLeagueParam } from "./Standings";

type View = "overview" | "race" | "ratings" | "projection" | "form" | "players" | "discipline";
const VIEWS: View[] = ["overview", "race", "ratings", "projection", "form", "players", "discipline"];

export default function Analytics() {
  const league = useLeagueParam();
  // Remount per league so per-league state (projection, selections) never leaks across.
  return <Hub key={league} league={league} />;
}

function Hub({ league }: { league: string }) {
  const meta = LEAGUE_BY_SLUG[league];
  const [params, setParams] = useSearchParams();
  const raw = params.get("view") as View | null;
  const view: View = raw && VIEWS.includes(raw) ? raw : "overview";
  const data = useLeagueData(league);

  const labels: Record<View, string> = {
    overview: t("Overview"),
    race: t("Race"),
    ratings: t("Ratings"),
    projection: t("Projection"),
    form: t("Form"),
    players: t("Players"),
    discipline: t("Discipline"),
  };
  useDocumentTitle(view === "overview" ? t("{league} stats", { league: meta.name }) : `${meta.name} · ${labels[view]}`);

  const go = (v: View) => {
    const next = new URLSearchParams(params);
    if (v === "overview") next.delete("view");
    else next.set("view", v);
    setParams(next);
  };

  const failed = !!data.seasonError && !data.season && !!data.standingsError && !data.standings;

  return (
    <div className="page an-page">
      <div className="page-head an-pagehead">
        <div>
          <p className="eyebrow">{meta.name}</p>
          <h1 className="large-title">{t("Stats")}</h1>
        </div>
        <div className="an-headactions">
          <BuildingBadge building={data.building} progress={data.progress} />
          <Link to="/leagues" className="an-compare">
            {t("Compare leagues")}
            <IconChevronRight aria-hidden />
          </Link>
        </div>
      </div>
      <LeaguePicker value={league} base="/stats" keepSearch />
      <LeagueNav items={VIEWS.map((v) => ({ value: v, label: labels[v] }))} value={view} onChange={go} />

      <div className="an-view" key={view}>
        {failed ? (
          <ErrorState onRetry={() => (data.reloadSeason(), data.reloadStandings())} />
        ) : view === "overview" ? (
          <Overview data={data} />
        ) : view === "race" ? (
          <RaceView data={data} />
        ) : view === "ratings" ? (
          <RatingsView data={data} />
        ) : view === "projection" ? (
          <ProjectionView data={data} />
        ) : view === "form" ? (
          <FormView data={data} />
        ) : view === "players" ? (
          <PlayersView data={data} />
        ) : (
          <DisciplineView data={data} />
        )}
      </div>
    </div>
  );
}
