import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { IconTable } from "../components/Icons";
import { BuildingBadge, PartialNote, shortGroup } from "../components/league/chrome";
import { derive, useLeagueData, type LeagueData } from "../components/league/data";
import { xgReliable } from "../components/league/scope";
import { movesVsTable } from "../components/league/FormView";
import { useLiveTables } from "../components/league/live";
import { rankedIds } from "../components/league/RaceView";
import { ComputedTable, StandingsTable, XgTable } from "../components/table";
import { Empty, ErrorState, Segmented, Skeleton } from "../components/ui";
import { t, tn } from "../i18n";
import { table, teamXg } from "../lib/analytics";
import { endpoints } from "../lib/api";
import { useApi, useDocumentTitle, useStored } from "../lib/hooks";
import { DEFAULT_LEAGUE, LEAGUES, LEAGUE_BY_SLUG, TABLE_LEAGUES, leagueLogo } from "../lib/leagues";

export function LeaguePicker({ value, base, keepSearch }: { value: string; base: string; keepSearch?: boolean }) {
  const nav = useNavigate();
  const { search } = useLocation();
  const [, setLast] = useStored<string>("pitch.league", DEFAULT_LEAGUE);
  return (
    <div className="chips" style={{ marginBottom: 22 }} role="group" aria-label={t("Competition")}>
      {(base === "/news" ? LEAGUES : TABLE_LEAGUES).map((l) => (
        <button
          key={l.slug}
          type="button"
          className={`chip${value === l.slug ? " active" : ""}`}
          aria-pressed={value === l.slug}
          onClick={() => {
            setLast(l.slug);
            nav(`${base}/${l.slug}${keepSearch ? search : ""}`, { replace: true });
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
  const { pathname } = useLocation();
  const [last] = useStored<string>("pitch.league", DEFAULT_LEAGUE);
  // Cups have news but no table or season analytics.
  const ok = (slug: string | undefined) => !!slug && !!LEAGUE_BY_SLUG[slug] && (pathname.startsWith("/news") || LEAGUE_BY_SLUG[slug].kind !== "cup");
  return ok(league) ? league! : ok(last) ? last : DEFAULT_LEAGUE;
}

type View = "overall" | "form" | "home" | "away" | "xg";
const VIEWS: View[] = ["overall", "form", "home", "away", "xg"];

export default function Standings() {
  const league = useLeagueParam();
  return <TablesPage key={league} league={league} />;
}

function TablesPage({ league }: { league: string }) {
  const meta = LEAGUE_BY_SLUG[league];
  useDocumentTitle(t("{league} table", { league: meta.name }));
  const [params, setParams] = useSearchParams();
  const raw = params.get("view") as View | null;
  const view: View = raw && VIEWS.includes(raw) ? raw : "overall";
  const setView = (v: View) => {
    const next = new URLSearchParams(params);
    if (v === "overall") next.delete("view");
    else next.set("view", v);
    setParams(next, { replace: true });
  };

  const data = useLeagueData(league);
  const espnGroups = useMemo(() => (data.standings?.groups ?? []).filter((g) => g.rows.length), [data.standings]);
  const { live, tables } = useLiveTables(league, espnGroups, data.season);
  // Keep the authoritative table fresh while matches are in play.
  useApi<unknown>(endpoints.standings(league), { refresh: live.length ? 60_000 : false });

  const computedView = view !== "overall";

  return (
    <div className="page an-page">
      <div className="page-head an-pagehead">
        <div>
          <p className="eyebrow">{data.standings?.season || meta.region}</p>
          <h1 className="large-title">{t("Tables")}</h1>
        </div>
        <div className="an-headactions">
          {live.length > 0 && (
            <span className="pill live an-livepill" role="status">
              <span className="pulse" aria-hidden />
              {tn(live.length, "{n} match live", "{n} matches live")}
            </span>
          )}
          {computedView && <BuildingBadge building={data.building} progress={data.progress} />}
        </div>
      </div>
      <LeaguePicker value={league} base="/tables" keepSearch />

      <div className="an-tabs">
        <Segmented
          options={[
            { value: "overall", label: t("Overall") },
            { value: "form", label: t("Form") },
            { value: "home", label: t("Home") },
            { value: "away", label: t("Away") },
            { value: "xg", label: t("xG") },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "overall" ? (
        <Overall data={data} tables={tables} />
      ) : (
        <Computed data={data} view={view} />
      )}
    </div>
  );
}

function Overall({ data, tables }: { data: LeagueData; tables: ReturnType<typeof useLiveTables>["tables"] }) {
  const meta = LEAGUE_BY_SLUG[data.league];
  const groups = (data.standings?.groups ?? []).filter((g) => g.rows.length);
  if (data.standingsLoading) return <Skeleton h={760} />;
  if (data.standingsError && !data.standings) return <ErrorState onRetry={data.reloadStandings} />;
  if (!groups.length)
    return (
      <Empty icon={<IconTable />} title={t("Table not available yet")}>
        {t("{league} hasn’t published standings for this stage.", { league: meta.name })}
      </Empty>
    );
  if (tables) {
    return (
      <div className="an-tables">
        <p className="an-livenote">
          <span className="pulse" aria-hidden />
          {t("Live table — positions update as goals go in. Arrows show movement since kick-off.")}
        </p>
        {tables.map((g) => (
          <StandingsTable key={g.group.name} group={g.group} league={data.league} showTitle={tables.length > 1} live={g.live} moves={g.moves} liveMode />
        ))}
      </div>
    );
  }
  return (
    <div className="an-tables">
      {groups.map((g) => (
        <StandingsTable key={g.name} group={g} league={data.league} showTitle={groups.length > 1} />
      ))}
    </div>
  );
}

function Computed({ data, view }: { data: LeagueData; view: Exclude<View, "overall"> }) {
  const { season, groups, teams, league } = data;
  const [n, setN] = useState<"5" | "10">("5");

  const tablesFor = useMemo(() => {
    if (!season) return [];
    return groups.map((g, gi) => {
      const ids = g.teams;
      const real = rankedIds(data, gi);
      if (view === "xg") {
        if (!xgReliable(season)) return { name: g.name, xg: [], unreliable: true };
        const xg = derive(season, "teamXg", () => teamXg(season));
        return {
          name: g.name,
          xg: ids.map((id) => ({ team: id, ...(xg.get(id) ?? { xgf: 0, xga: 0, games: 0, gf: 0, ga: 0 }) })).filter((r) => r.games > 0),
        };
      }
      const opts = view === "form" ? { lastN: Number(n), teams: ids } : { venue: view as "home" | "away", teams: ids };
      const rows = derive(season, `${view}${view === "form" ? n : ""}|${gi}`, () => table(season, opts));
      return { name: g.name, rows, moves: movesVsTable(rows, real) };
    });
  }, [season, groups, view, n, data]);

  if (data.seasonLoading) return <Skeleton h={760} />;
  if (data.seasonError && !season) return <ErrorState onRetry={data.reloadSeason} />;
  if (!season)
    return (
      <Empty icon={<IconTable />} title={t("Table not available yet")}>
        {t("Season data for this competition hasn’t loaded yet.")}
      </Empty>
    );

  const multi = tablesFor.length > 1;
  const caption =
    view === "form"
      ? t("Each club’s last {n} matches. Arrows compare with the real table.", { n })
      : view === "home"
        ? t("Home matches only. Arrows compare with the real table.")
        : view === "away"
          ? t("Away matches only. Arrows compare with the real table.")
          : t("Expected goals created and allowed, from the Pitch xG model. Sorted by xG difference.");

  return (
    <div className="an-tables">
      <div className="an-tablebar">
        <p className="an-sub">{caption}</p>
        {view === "form" && (
          <Segmented
            options={[
              { value: "5", label: t("Last 5") },
              { value: "10", label: t("Last 10") },
            ]}
            value={n}
            onChange={setN}
          />
        )}
      </div>
      <PartialNote building={data.building} progress={data.progress} />
      {tablesFor.map((g) =>
        "xg" in g ? (
          g.xg && g.xg.length ? (
            <XgTable key={g.name} rows={g.xg} teams={teams} league={league} title={multi ? shortGroup(g.name) || g.name : undefined} />
          ) : (
            <Empty key={g.name} icon={<IconTable />} title={"unreliable" in g ? t("xG isn’t available for this competition") : t("xG isn’t available yet")}>
              {"unreliable" in g
                ? t("The provider’s shot data is incomplete here, so expected goals would be misleading.")
                : t("Expected goals appear once match details with shot data have synced.")}
            </Empty>
          )
        ) : (
          <ComputedTable
            key={g.name}
            rows={g.rows!}
            teams={teams}
            league={league}
            title={multi ? g.name : undefined}
            moves={g.moves}
            showForm={view === "form"}
            formMax={Number(n)}
          />
        ),
      )}
    </div>
  );
}
