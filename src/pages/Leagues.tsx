import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RankedBars, SplitBars, type RankRow } from "../components/charts/Bars";
import { ChartCard } from "../components/charts/core";
import { IconChevronRight, IconGlobe } from "../components/Icons";
import { derive, scopeSeason, xgReliable } from "../components/league/scope";
import { Empty, LeagueBadge, Skeleton } from "../components/ui";
import { t } from "../i18n";
import { leagueSummary, type LeagueSummary, type SeasonData } from "../lib/analytics";
import { fmtNum, fmtPct } from "../lib/format";
import { useDocumentTitle } from "../lib/hooks";
import { TABLE_LEAGUES as LEAGUES, leagueLogo, type League } from "../lib/leagues";
import { useSeason } from "../lib/season";

interface Entry {
  l: League;
  s: LeagueSummary | null;
  building: boolean;
  progress: number;
  loading: boolean;
  failed: boolean;
}

type Key = "goalsPerGame" | "homeWin" | "draw" | "awayWin" | "goalless" | "over25" | "bothScore" | "cardsPerGame" | "xgPerGame" | "games";

/** All eleven season datasets, loaded in parallel (fixed list → stable hook order). */
function useAllSeasons(): Entry[] {
  const qs = LEAGUES.map((l) => ({ l, q: useSeason(l.slug) })); // eslint-disable-line react-hooks/rules-of-hooks
  return qs.map(({ l, q }) => ({
    l,
    s: q.data ? derive(q.data, "summary", () => summarise(q.data!)) : null,
    building: q.building,
    progress: q.progress,
    loading: q.loading,
    failed: !!q.error && !q.data,
  }));
}

/** Drop exhibition sides (e.g. All-Star games): clubs with fewer than three fixtures all season. */
function competitionOnly(season: SeasonData): SeasonData {
  const n = new Map<string, number>();
  for (const m of season.matches) for (const id of [m.h, m.a]) n.set(id, (n.get(id) ?? 0) + 1);
  const keep = season.teams.map((tm) => tm.id).filter((id) => (n.get(id) ?? 0) >= 3);
  return keep.length === season.teams.length ? season : scopeSeason(season, keep);
}

/** League summary over competition matches; xG dropped where the shot data is incomplete. */
function summarise(season: SeasonData): LeagueSummary | null {
  const scoped = competitionOnly(season);
  const s = leagueSummary(scoped);
  return s && s.xgPerGame !== null && !xgReliable(scoped) ? { ...s, xgPerGame: null } : s;
}

/** Below this many matches a league's rates are too noisy to crown a leader. */
const MIN_SAMPLE = 20;

export default function Leagues() {
  useDocumentTitle(t("Compare leagues"));
  const entries = useAllSeasons();
  const ready = entries.filter((e) => e.s && e.s.games > 0);
  const building = entries.filter((e) => e.building);
  const pending = entries.filter((e) => !e.s && !e.loading);
  const allLoading = entries.every((e) => e.loading);

  const metrics: { key: Key; title: string; sub: string; fmt: (v: number) => string }[] = [
    { key: "goalsPerGame", title: t("Goals per game"), sub: t("Average goals in a match."), fmt: (v) => fmtNum(v, 2) },
    { key: "over25", title: t("Over 2.5 goals"), sub: t("Share of matches with three or more goals."), fmt: (v) => fmtPct(v) },
    { key: "bothScore", title: t("Both teams score"), sub: t("Share of matches where both sides find the net."), fmt: (v) => fmtPct(v) },
    { key: "goalless", title: t("Goalless draws"), sub: t("Share of matches that finish 0–0."), fmt: (v) => fmtPct(v, 1) },
    { key: "cardsPerGame", title: t("Cards per game"), sub: t("Yellow and red cards shown per match."), fmt: (v) => fmtNum(v, 2) },
    { key: "xgPerGame", title: t("xG per game"), sub: t("Expected goals created per match (both sides). Leagues with incomplete shot data are left out."), fmt: (v) => fmtNum(v, 2) },
  ];

  const rowsFor = (key: Key, fmt: (v: number) => string): RankRow[] =>
    ready
      .filter((e) => e.s![key] !== null)
      .map((e) => ({
        key: e.l.slug,
        label: e.l.short,
        logo: leagueLogo(e.l.slug, false, 96),
        href: `/stats/${e.l.slug}`,
        value: e.s![key] as number,
        display: fmt(e.s![key] as number),
        note: e.s!.games < MIN_SAMPLE ? t("{n} matches", { n: e.s!.games }) : e.building ? t("building") : undefined,
        detail: [{ label: t("Matches"), value: fmtNum(e.s!.games) }],
      }))
      .sort((a, b) => b.value - a.value);

  const top = (key: Key) => [...ready].filter((e) => e.s![key] !== null && e.s!.games >= MIN_SAMPLE).sort((a, b) => (b.s![key] as number) - (a.s![key] as number))[0];
  const goals = top("goalsPerGame");
  const home = top("homeWin");
  const cards = top("cardsPerGame");

  return (
    <div className="page an-page">
      <div className="page-head an-pagehead">
        <div>
          <p className="eyebrow">{t("Across {n} competitions", { n: LEAGUES.length })}</p>
          <h1 className="large-title">{t("Compare leagues")}</h1>
        </div>
        <div className="an-headactions">
          <Link to="/stats" className="an-compare">
            {t("League stats")}
            <IconChevronRight aria-hidden />
          </Link>
        </div>
      </div>

      {building.length > 0 && (
        <div className="an-buildlist" role="status">
          <span className="an-buildlist-k">{t("Still building")}</span>
          {building.map((e) => (
            <span key={e.l.slug} className="pill an-buildchip">
              <img src={leagueLogo(e.l.slug, false, 48)} alt="" />
              {e.l.short} · {fmtPct(e.progress)}
            </span>
          ))}
        </div>
      )}

      {allLoading ? (
        <div className="an-stack">
          <div className="tiles">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={118} />
            ))}
          </div>
          <Skeleton h={420} r={32} />
        </div>
      ) : !ready.length ? (
        <Empty icon={<IconGlobe />} title={t("Season data is still building")}>
          {t("League summaries appear as soon as the first matches have synced.")}
        </Empty>
      ) : (
        <>
          <div className="tiles an-kpis an-kpis-3">
            {goals && <Leader e={goals} k={t("Most goals")} v={fmtNum(goals.s!.goalsPerGame, 2)} s={t("goals per game")} />}
            {home && <Leader e={home} k={t("Strongest home advantage")} v={fmtPct(home.s!.homeWin)} s={t("home wins")} />}
            {cards && <Leader e={cards} k={t("Most cards")} v={fmtNum(cards.s!.cardsPerGame!, 2)} s={t("cards per game")} />}
          </div>

          <ChartCard
            id="result-split"
            title={t("How matches end")}
            subtitle={t("Home wins, draws and away wins as a share of all matches, sorted by home wins.")}
          >
            <SplitBars
              rows={[...ready]
                .sort((a, b) => b.s!.homeWin - a.s!.homeWin)
                .map((e) => ({
                  key: e.l.slug,
                  label: e.l.short,
                  logo: leagueLogo(e.l.slug, false, 96),
                  href: `/stats/${e.l.slug}`,
                  parts: normalise([e.s!.homeWin, e.s!.draw, e.s!.awayWin]),
                }))}
              names={[t("Home win"), t("Draw"), t("Away win")]}
              colors={["var(--series-1)", "var(--an-neutral)", "var(--series-2)"]}
            />
          </ChartCard>

          <section className="section an-multiples" aria-label={t("League comparisons")}>
            {metrics.map((m) => {
              const rows = rowsFor(m.key, m.fmt);
              return (
                <figure key={m.key} className="an-panel glass an-multiple">
                  <figcaption>
                    <h2 className="an-mtitle">{m.title}</h2>
                    <p className="an-sub">{m.sub}</p>
                  </figcaption>
                  {rows.length ? (
                    <RankedBars rows={rows} valueLabel={m.title} kind="league" compactTable />
                  ) : (
                    <p className="an-empty-chart">{t("Not enough match details yet.")}</p>
                  )}
                </figure>
              );
            })}
          </section>

          <CompareTable entries={ready} />

          {pending.length > 0 && (
            <p className="an-note an-pending">
              {t("No completed matches yet: {list}.", { list: pending.map((e) => e.l.short).join(", ") })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function normalise(p: number[]): number[] {
  const s = p.reduce((a, b) => a + b, 0);
  return s > 0 ? p.map((v) => v / s) : p;
}

function Leader({ e, k, v, s }: { e: Entry; k: string; v: string; s: string }) {
  return (
    <Link to={`/stats/${e.l.slug}`} className="tile glass an-tile-link">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="s">
        <LeagueBadge slug={e.l.slug} size={20} />
        {e.l.short} · {s}
      </div>
    </Link>
  );
}

/* --------------------------------------------------------- sortable ---- */

function CompareTable({ entries }: { entries: Entry[] }) {
  const [sort, setSort] = useState<{ key: Key | "name"; dir: 1 | -1 }>({ key: "goalsPerGame", dir: -1 });
  const cols: { key: Key; label: string; title: string; fmt: (v: number) => string }[] = [
    { key: "games", label: t("Matches"), title: t("Completed matches"), fmt: (v) => fmtNum(v) },
    { key: "goalsPerGame", label: t("Goals/G"), title: t("Goals per game"), fmt: (v) => fmtNum(v, 2) },
    { key: "homeWin", label: t("Home"), title: t("Home win %"), fmt: (v) => fmtPct(v) },
    { key: "draw", label: t("Draw"), title: t("Draw %"), fmt: (v) => fmtPct(v) },
    { key: "awayWin", label: t("Away"), title: t("Away win %"), fmt: (v) => fmtPct(v) },
    { key: "goalless", label: t("0–0"), title: t("Goalless draw %"), fmt: (v) => fmtPct(v, 1) },
    { key: "over25", label: t("O2.5"), title: t("Over 2.5 goals %"), fmt: (v) => fmtPct(v) },
    { key: "bothScore", label: t("BTTS"), title: t("Both teams score %"), fmt: (v) => fmtPct(v) },
    { key: "cardsPerGame", label: t("Cards/G"), title: t("Cards per game"), fmt: (v) => fmtNum(v, 2) },
    { key: "xgPerGame", label: t("xG/G"), title: t("xG per game"), fmt: (v) => fmtNum(v, 2) },
  ];
  const rows = useMemo(() => {
    const val = (e: Entry) => (sort.key === "name" ? e.l.short : e.s![sort.key]);
    return [...entries].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // missing values always last
      if (vb === null) return -1;
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * sort.dir;
      return (va - vb) * sort.dir;
    });
  }, [entries, sort]);
  const click = (key: Key | "name") => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  const aria = (key: Key | "name") => (sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none");
  const arrow = (key: Key | "name") => (sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : "");

  return (
    <ChartCard id="all-leagues" title={t("All leagues")} subtitle={t("Every metric side by side. Select a column to sort.")} flush>
      <div className="table-scroll">
        <table className="standings an-table an-compare-table">
          <thead>
            <tr>
              <th scope="col" className="club" aria-sort={aria("name")}>
                <button type="button" className="an-sort" onClick={() => click("name")}>
                  {t("League")} <span aria-hidden>{arrow("name")}</span>
                </button>
              </th>
              {cols.map((c) => (
                <th key={c.key} scope="col" aria-sort={aria(c.key)} title={c.title}>
                  <button type="button" className="an-sort" onClick={() => click(c.key)}>
                    {c.label} <span aria-hidden>{arrow(c.key)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.l.slug}>
                <td className="club">
                  <Link to={`/stats/${e.l.slug}`} className="inner">
                    <LeagueBadge slug={e.l.slug} size={26} />
                    <span>{e.l.short}</span>
                    {e.building && <span className="an-mini-pill">{t("building")}</span>}
                  </Link>
                </td>
                {cols.map((c) => {
                  const v = e.s![c.key];
                  return (
                    <td key={c.key} className={sort.key === c.key ? "an-sorted" : ""}>
                      {v === null ? "–" : c.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
