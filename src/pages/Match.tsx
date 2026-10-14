import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Commentary } from "../components/matchcentre/Commentary";
import {
  hasPlayerStats,
  momentum,
  parseOdds,
  parsePlays,
  parseReferee,
  parseRosters,
  parseShootout,
  parseShots,
  periodsFor,
  rate,
  substitutions,
  timeAxis,
  type RosterPlayer,
} from "../components/matchcentre/data";
import { h2hGames, H2HTab, type H2HGame } from "../components/matchcentre/H2H";
import { LiveChip, MatchCentreHero, type Probs } from "../components/matchcentre/Hero";
import { MomentumStrip } from "../components/matchcentre/Momentum";
import { ShotsTab } from "../components/matchcentre/Shots";
import { hasTeamStats, StatsTab } from "../components/matchcentre/Stats";
import {
  FormPanel,
  KickoffCard,
  MatchInfo,
  PotmCard,
  refereeFor,
  RefereeSheet,
  ShootoutCard,
  Timeline,
  Watch,
  WinProbCard,
} from "../components/matchcentre/Summary";
import { TabBar, type TabDef } from "../components/matchcentre/Tabs";
import { useVenueContext } from "../components/matchcentre/venue";
import { IconChevronLeft, IconStats } from "../components/Icons";
import { Bench, Pitch } from "../components/lineup";
import { PlayerSheet, type PlayerRef } from "../components/PlayerSheet";
import { StandingsTable } from "../components/table";
import { Empty, ErrorState, Skeleton } from "../components/ui";
import { t } from "../i18n";
import { elo, matchProbs, oddsToProbs } from "../lib/analytics";
import { endpoints, normaliseStandings, normaliseSummary, type LineupPlayer, type Side, type SummaryData } from "../lib/api";
import { useAccent } from "../lib/accent";
import { useApi, useDocumentTitle } from "../lib/hooks";
import { onPatch } from "../lib/live";
import { useSeason } from "../lib/season";
import { useSwipe } from "../lib/gestures";

type Tab = "summary" | "commentary" | "stats" | "shots" | "lineups" | "h2h" | "table";
const ORDER: Tab[] = ["summary", "commentary", "stats", "shots", "lineups", "h2h", "table"];

export default function MatchPage() {
  const { league = "eng.1", id = "" } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [live, setLive] = useState(false);
  const q = useApi<any>(endpoints.summary(league, id), { refresh: live ? 20_000 : 120_000 });
  const raw = q.data;
  const s = useMemo<SummaryData | null>(() => {
    if (!raw?.header) return null;
    try {
      return normaliseSummary(raw, league);
    } catch {
      return null;
    }
  }, [raw, league]);
  // useApi keeps the previous match visible while the next one loads — never show the wrong match.
  const current = s && String(s.match.id) === String(id) ? s : null;
  const isLive = current?.match.state === "in";
  if (current && isLive !== live) setLive(isLive);

  // Live: re-fetch the summary as soon as the hub reports a change to this match.
  const reload = q.reload;
  useEffect(() => {
    let timer: number | undefined;
    const off = onPatch((ms) => {
      if (!ms.some((m) => String(m.id) === String(id))) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(reload, 1200);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [id, reload]);

  const x = useMemo(() => {
    if (!current || !raw) return null;
    const { home, away } = current.match;
    const plays = parsePlays(raw, home, away);
    const rosters = parseRosters(raw, home, away);
    const periods = periodsFor(plays, current.match);
    return {
      plays,
      shots: parseShots(raw, home, away),
      rosters,
      subs: substitutions(raw, rosters),
      kicks: parseShootout(raw, plays, home, away),
      odds: parseOdds(raw),
      referee: parseReferee(raw) ?? current.officials[0] ?? null,
      bins: momentum(plays, current.match),
      axis: timeAxis(periods, plays, current.match),
      ratings: hasPlayerStats(rosters) && current.match.state !== "pre" ? rate(rosters, current.match) : [],
      country: String(raw.gameInfo?.venue?.address?.country ?? ""),
      hasStandings: !!raw.standings?.groups?.some((g: any) => g?.standings?.entries?.length),
      // The header's competitor form is often empty; the team object carries it.
      form: Object.fromEntries(
        ((raw.header?.competitions?.[0]?.competitors ?? []) as any[]).map((c) => [String(c?.team?.id ?? ""), String(c?.form || c?.team?.form || "")]),
      ) as Record<string, string>,
      narrative: plays.filter((p) => p.kind !== "start" && p.kind !== "end" && !/lineups are announced/i.test(p.text)).length,
    };
  }, [current, raw]);

  const m = current?.match ?? null;
  const heroMatch = useMemo(
    () =>
      m && x
        ? {
            ...m,
            home: { ...m.home, form: m.home.form || x.form[m.home.id] || "" },
            away: { ...m.away, form: m.away.form || x.form[m.away.id] || "" },
          }
        : null,
    [m, x],
  );
  useAccent(m ? [m.home.color, m.away.color] : null);
  useDocumentTitle(
    m
      ? m.state === "pre"
        ? t("{home} v {away}", { home: m.home.short, away: m.away.short })
        : `${m.home.short} ${m.home.score ?? 0}–${m.away.score ?? 0} ${m.away.short}`
      : t("Match"),
  );

  /* ---- tabs ---- */
  const [tabState, setTabState] = useState<Tab>(() => (ORDER.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "summary"));
  const [dir, setDir] = useState<"next" | "prev" | "none">("none");
  const tabParam = params.get("tab");
  useEffect(() => {
    // A different match (e.g. from H2H or form) starts on its own tab.
    setTabState(ORDER.includes(tabParam as Tab) ? (tabParam as Tab) : "summary");
    setDir("none");
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- win probability ---- */
  const oddsProbs = useMemo<Probs | null>(() => {
    if (!x?.odds) return null;
    const p = oddsToProbs(x.odds.home, x.odds.draw, x.odds.away);
    return p ? { ...p, source: x.odds.provider || t("Bookmaker odds"), kind: "odds" } : null;
  }, [x?.odds]);
  const needModel = !!m && !oddsProbs && m.state === "pre";
  const needSeason = !!m && (needModel || (tabState === "summary" && !!x?.referee));
  const season = useSeason(needSeason ? league : null);
  const modelProbs = useMemo<Probs | null>(() => {
    const sd = season.data;
    if (!needModel || !sd || !m) return null;
    const ids = new Set(sd.teams.map((tm) => tm.id));
    if (!ids.has(m.home.id) || !ids.has(m.away.id)) return null;
    try {
      const p = matchProbs(sd, elo(sd), m.home.id, m.away.id);
      return [p.h, p.d, p.a].every(Number.isFinite) ? { h: p.h, d: p.d, a: p.a, source: t("Pitch model"), kind: "model" } : null;
    } catch {
      return null;
    }
  }, [season.data, needModel, m]);
  const probs = oddsProbs ?? modelProbs;
  const refRecord = useMemo(() => refereeFor(season.data, x?.referee ?? null), [season.data, x?.referee]);

  /* ---- head to head ---- */
  const h2h = useApi<{ games?: H2HGame[] }>(m ? endpoints.h2h(league, m.home.id, m.away.id) : null);
  const games = useMemo(() => (m ? h2hGames(h2h.data, m) : []), [h2h.data, m]);

  /* ---- stadium context ---- */
  const venue = useVenueContext(current, x?.country ?? "", { backdrop: isLive });

  const hasLineups = !!current && current.lineups.some((l) => l.players.some((p) => p.starter));
  const tabs: TabDef<Tab>[] = useMemo(() => {
    if (!current || !x) return [];
    const list: TabDef<Tab>[] = [{ value: "summary", label: t("Summary") }];
    if (x.narrative > 0) list.push({ value: "commentary", label: t("Commentary"), badge: isLive ? t("Live") : null });
    if (current.match.state !== "pre" && hasTeamStats(current)) list.push({ value: "stats", label: t("Stats") });
    if (x.shots.length || x.plays.some((p) => p.x !== null && p.side)) list.push({ value: "shots", label: t("Shots") });
    if (hasLineups) list.push({ value: "lineups", label: t("Lineups") });
    if (games.length) list.push({ value: "h2h", label: t("H2H") });
    if (x.hasStandings) list.push({ value: "table", label: t("Table") });
    return list;
  }, [current, x, isLive, hasLineups, games.length]);
  const tab: Tab = tabs.some((tb) => tb.value === tabState) ? tabState : "summary";

  const go = (next: Tab) => {
    if (next === tab) return;
    const a = tabs.findIndex((tb) => tb.value === tab);
    const b = tabs.findIndex((tb) => tb.value === next);
    setDir(b > a ? "next" : "prev");
    setTabState(next);
    const p = new URLSearchParams(params);
    if (next === "summary") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true, preventScrollReset: true });
  };
  const swipeRef = useSwipe<HTMLDivElement>(
    (d) => {
      const i = tabs.findIndex((tb) => tb.value === tab);
      const n = tabs[i + (d === -1 ? 1 : -1)];
      if (n) go(n.value);
    },
    { enabled: tabs.length > 1 },
  );

  /* ---- player sheet & referee ---- */
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const pick = (p: LineupPlayer, side: Side) =>
    setPlayer({ name: p.name, id: p.id, jersey: p.jersey, position: p.posName, league, team: { name: side.name, logo: side.logo, color: side.color } });
  const pickRated = (p: RosterPlayer) => {
    const side = p.side === "home" ? m!.home : m!.away;
    setPlayer({ name: p.name, id: p.id, jersey: p.jersey, position: p.posName, league, team: { name: side.name, logo: side.logo, color: side.color } });
  };

  const heroRef = useRef<HTMLElement>(null);

  return (
    <div className="page mc-page">
      <button className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav("/"))}>
        <IconChevronLeft />
        {t("Back")}
      </button>

      {!current && q.error ? (
        <ErrorState onRetry={q.reload} />
      ) : !current || !x || !m ? (
        <MatchSkeleton />
      ) : (
        <>
          <MatchCentreHero
            key={m.id}
            m={heroMatch ?? m}
            heroRef={heroRef}
            probs={probs}
            weather={venue.weather}
            timezone={venue.timezone}
            backdrop={venue.photo}
          />
          {m.state !== "pre" && x.bins.length > 0 && <MomentumStrip bins={x.bins} m={m} />}

          <TabBar tabs={tabs} value={tab} onChange={go} label={t("Match sections")} idPrefix="mc" />

          <div
            ref={swipeRef}
            className={`mc-pane-wrap${q.stale ? " refreshing" : ""}`}
            id="mc-panel"
            role="tabpanel"
            aria-labelledby={`mc-tab-${tab}`}
          >
            <div key={tab} className={`mc-pane ${dir}`}>
              {tab === "summary" && (
                <SummaryTab
                  s={current}
                  x={x}
                  probs={probs}
                  venue={venue}
                  refAvailable={!!refRecord}
                  onReferee={() => setRefOpen(true)}
                  onPickRated={pickRated}
                />
              )}
              {tab === "commentary" && <Commentary plays={x.plays} m={m} />}
              {tab === "stats" && <StatsTab s={current} shots={x.shots} />}
              {tab === "shots" && <ShotsTab m={m} shots={x.shots} plays={x.plays} axis={x.axis} />}
              {tab === "lineups" && <LineupsTab s={current} subs={x.subs} onPick={pick} />}
              {tab === "h2h" && <H2HTab m={m} games={games} />}
              {tab === "table" && <MatchTable league={league} ids={[m.home.id, m.away.id]} />}
            </div>
          </div>

          <LiveChip m={m} heroRef={heroRef} />
        </>
      )}

      {player && <PlayerSheet p={player} onClose={() => setPlayer(null)} />}
      {refOpen && x?.referee && (
        <RefereeSheet
          name={x.referee}
          season={season.data}
          building={season.building}
          progress={season.progress}
          league={league}
          onClose={() => setRefOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Summary -- */

function SummaryTab({
  s,
  x,
  probs,
  venue,
  refAvailable,
  onReferee,
  onPickRated,
}: {
  s: SummaryData;
  x: {
    kicks: ReturnType<typeof parseShootout>;
    ratings: ReturnType<typeof rate>;
    referee: string | null;
  };
  probs: Probs | null;
  venue: ReturnType<typeof useVenueContext>;
  refAvailable: boolean;
  onReferee: () => void;
  onPickRated: (p: RosterPlayer) => void;
}) {
  const m = s.match;
  const pre = m.state === "pre";
  const top = x.ratings[0];
  const showPotm = !!top && (m.state === "post" || m.state === "in") && (top.rating > 6 || top.chips.length > 0);
  const info = <MatchInfo s={s} referee={x.referee} refAvailable={refAvailable} onReferee={onReferee} />;

  if (pre) {
    return (
      <div className="mc-summary">
        <div className="mc-grid-2">
          {probs ? <WinProbCard s={s} p={probs} title={t("Win probability")} /> : null}
          <KickoffCard s={s} weather={venue.weather} loading={venue.weatherLoading} timezone={venue.timezone} />
        </div>
        <Watch s={s} />
        <div className="mc-grid-2">
          <FormPanel s={s} />
          {info}
        </div>
      </div>
    );
  }

  return (
    <div className="mc-summary">
      {(showPotm || x.kicks.length > 0) && (
        <div className={x.kicks.length > 0 && showPotm ? "mc-grid-2" : ""}>
          {showPotm && <PotmCard r={top} s={s} live={m.state === "in"} onOpen={() => onPickRated(top.player)} />}
          {x.kicks.length > 0 && <ShootoutCard kicks={x.kicks} s={s} />}
        </div>
      )}
      <div className="mc-grid-2 mc-summary-main">
        <Timeline s={s} />
        <div className="mc-stack">
          <FormPanel s={s} />
          {info}
          {probs && <WinProbCard s={s} p={probs} title={t("Pre-match win probability")} />}
          <Watch s={s} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Lineups -- */

function LineupsTab({ s, subs, onPick }: { s: SummaryData; subs: Map<string, { id: string; name: string; jersey: string; minute: string }>; onPick: (p: LineupPlayer, side: Side) => void }) {
  const { home, away } = s.match;
  const anySubs = s.lineups.some((l) => l.players.some((p) => p.subbedOut));
  const [show, setShow] = useState(s.match.state !== "pre");
  const replaced = useMemo(() => {
    const names = new Map(s.lineups.flatMap((l) => l.players.map((p) => [p.id, p.name] as const)));
    const out = new Map<string, string>();
    for (const [outId, inc] of subs) out.set(inc.id, names.get(outId) ?? "");
    return out;
  }, [s.lineups, subs]);
  return (
    <div className="mc-lineups">
      {anySubs && (
        <div className="mc-lineup-bar">
          <button type="button" className={`mc-switch${show ? " on" : ""}`} role="switch" aria-checked={show} onClick={() => setShow((v) => !v)}>
            <span className="mc-switch-track" aria-hidden>
              <span className="mc-switch-knob" />
            </span>
            {t("Show changes")}
          </button>
        </div>
      )}
      <div className="lineup-wrap">
        <Bench side={home} lineup={s.lineups.find((l) => l.teamId === home.id)} onPick={onPick} cls="home" replaced={replaced} />
        <Pitch home={home} away={away} lineups={s.lineups} onPick={onPick} changes={subs} showChanges={show && anySubs} />
        <Bench side={away} lineup={s.lineups.find((l) => l.teamId === away.id)} onPick={onPick} cls="away" replaced={replaced} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Table -- */

function MatchTable({ league, ids }: { league: string; ids: string[] }) {
  const q = useApi<any>(endpoints.standings(league));
  const data = useMemo(() => (q.data ? normaliseStandings(q.data) : null), [q.data]);
  if (q.loading) return <TableSkeleton />;
  const groups = data?.groups.filter((g) => g.rows.length) ?? [];
  if (!groups.length) return <Empty icon={<IconStats />} title={t("No table for this competition")} />;
  const relevant = groups.filter((g) => g.rows.some((r) => ids.includes(r.team.id)));
  return (
    <div className="mc-table">
      {(relevant.length ? relevant : groups).map((g) => (
        <StandingsTable key={g.name} group={g} league={league} highlight={ids} compact showTitle={groups.length > 1} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- skeletons -- */

function MatchSkeleton() {
  return (
    <div className="mc-skeleton" aria-busy="true" aria-label={t("Loading match")}>
      <div className="mc-sk-hero glass">
        <div className="mc-sk-top">
          <Skeleton h={26} r={13} style={{ width: 160 }} />
          <Skeleton h={26} r={13} style={{ width: 80 }} />
        </div>
        <div className="mc-sk-body">
          <div className="mc-sk-team">
            <Skeleton h={80} r={40} style={{ width: 80 }} />
            <Skeleton h={16} r={8} style={{ width: 110 }} />
          </div>
          <Skeleton h={64} r={18} style={{ width: 150 }} />
          <div className="mc-sk-team">
            <Skeleton h={80} r={40} style={{ width: 80 }} />
            <Skeleton h={16} r={8} style={{ width: 110 }} />
          </div>
        </div>
        <Skeleton h={14} r={7} style={{ width: 240, margin: "0 auto" }} />
      </div>
      <Skeleton h={50} r={18} style={{ margin: "18px 0" }} />
      <div className="mc-grid-2">
        <div className="panel glass mc-sk-panel">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="mc-sk-row">
              <Skeleton h={12} r={6} style={{ width: `${40 + ((i * 17) % 35)}%` }} />
              <Skeleton h={24} r={12} style={{ width: 44 }} />
              <Skeleton h={12} r={6} style={{ width: `${30 + ((i * 23) % 40)}%` }} />
            </div>
          ))}
        </div>
        <div className="panel glass mc-sk-panel">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="mc-sk-line">
              <Skeleton h={30} r={10} style={{ width: 30 }} />
              <Skeleton h={12} r={6} style={{ width: `${45 + ((i * 13) % 40)}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="table-card glass mc-sk-table" aria-busy="true">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="mc-sk-line">
          <Skeleton h={12} r={6} style={{ width: 18 }} />
          <Skeleton h={26} r={13} style={{ width: 26 }} />
          <Skeleton h={12} r={6} style={{ width: `${30 + ((i * 19) % 30)}%` }} />
        </div>
      ))}
    </div>
  );
}
