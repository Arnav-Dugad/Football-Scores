import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconBall, IconChevronLeft, IconPeople, IconPin, IconStats, IconSub, IconWhistle } from "../components/Icons";
import { Bench, Pitch } from "../components/lineup";
import { MatchHero } from "../components/match";
import { PlayerSheet, type PlayerRef } from "../components/PlayerSheet";
import { StandingsTable } from "../components/table";
import { Crest, Empty, ErrorState, Segmented, Skeleton } from "../components/ui";
import {
  endpoints,
  normaliseStandings,
  normaliseSummary,
  type KeyEvent,
  type LineupPlayer,
  type Side,
  type SummaryData,
} from "../lib/api";
import { fmtDayShort } from "../lib/format";
import { useApi, useDocumentTitle } from "../lib/hooks";

type Tab = "summary" | "stats" | "lineups" | "table";

export default function MatchPage() {
  const { league = "eng.1", id = "" } = useParams();
  const nav = useNavigate();
  const [live, setLive] = useState(false);
  const q = useApi<any>(endpoints.summary(league, id), { refresh: live ? 20_000 : 120_000 });
  const s = useMemo(() => (q.data ? normaliseSummary(q.data, league) : null), [q.data, league]);
  if (s && (s.match.state === "in") !== live) setLive(s.match.state === "in");

  const [tab, setTab] = useState<Tab>("summary");
  const [player, setPlayer] = useState<PlayerRef | null>(null);

  useDocumentTitle(s ? `${s.match.home.short} ${s.match.home.score ?? ""}–${s.match.away.score ?? ""} ${s.match.away.short}`.replace(" –", " v") : "Match");

  const hasStats = !!s && Object.values(s.stats).some((v) => v.length > 0);
  const hasLineups = !!s && s.lineups.some((l) => l.players.some((p) => p.starter));

  const tabs: { value: Tab; label: string }[] = [
    { value: "summary", label: "Summary" },
    ...(hasStats ? [{ value: "stats" as Tab, label: "Stats" }] : []),
    ...(hasLineups ? [{ value: "lineups" as Tab, label: "Lineups" }] : []),
    { value: "table", label: "Table" },
  ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "summary";

  const pick = (p: LineupPlayer, side: Side) =>
    setPlayer({ name: p.name, id: p.id, jersey: p.jersey, position: p.posName, league, team: { name: side.name, logo: side.logo, color: side.color } });

  return (
    <div className="page">
      <button className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav("/"))}>
        <IconChevronLeft />
        Back
      </button>

      {q.loading ? (
        <>
          <Skeleton h={330} r={32} />
          <Skeleton h={44} r={14} style={{ margin: "22px auto", maxWidth: 520 }} />
          <Skeleton h={420} />
        </>
      ) : q.error && !s ? (
        <ErrorState onRetry={q.reload} />
      ) : s ? (
        <>
          <MatchHero m={s.match} link={false} />
          <div className="tabs-row">
            <Segmented options={tabs} value={activeTab} onChange={setTab} />
          </div>
          {activeTab === "summary" && <Summary s={s} />}
          {activeTab === "stats" && <Stats s={s} />}
          {activeTab === "lineups" && (
            <div className="lineup-wrap">
              <Bench side={s.match.home} lineup={s.lineups.find((l) => l.teamId === s.match.home.id)} onPick={pick} cls="home" />
              <Pitch home={s.match.home} away={s.match.away} lineups={s.lineups} onPick={pick} />
              <Bench side={s.match.away} lineup={s.lineups.find((l) => l.teamId === s.match.away.id)} onPick={pick} cls="away" />
            </div>
          )}
          {activeTab === "table" && <MatchTable league={league} ids={[s.match.home.id, s.match.away.id]} />}
        </>
      ) : null}

      {player && <PlayerSheet p={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------ Summary -- */

function Summary({ s }: { s: SummaryData }) {
  const { home, away } = s.match;
  const events = s.events.filter((e) =>
    /goal|penalty---scored|card|substitution|halftime|end-regular-time|kickoff|end-extra|shootout/.test(e.type) || e.scoring,
  );

  let h = 0;
  let a = 0;

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="panel glass">
        <p className="panel-title">Timeline</p>
        {events.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {s.match.state === "pre" ? `Kick-off ${fmtDayShort(s.match.date)}. Events will appear here live.` : "No key events recorded."}
          </p>
        ) : (
          <div className="timeline">
            {events.map((e, i) => {
              if (e.scoring) {
                if (e.teamId === home.id) h++;
                else if (e.teamId === away.id) a++;
              }
              if (e.type === "kickoff") return <Divider key={e.id} label="Kick-off" />;
              if (e.type === "halftime") return <Divider key={e.id} label={`Half-time · ${h}–${a}`} />;
              if (e.type === "end-regular-time") return <Divider key={e.id} label={`Full time · ${h}–${a}`} />;
              if (/end-extra|shootout/.test(e.type) && !e.teamId) return <Divider key={e.id} label={e.text || "Extra time"} />;
              if (!e.teamId) return null;
              const isHome = e.teamId === home.id;
              return <EventRow key={e.id} e={e} home={isHome} delay={i * 25} score={e.scoring ? `${h}–${a}` : null} />;
            })}
          </div>
        )}
      </div>

      <div>
        <FormPanel s={s} />
        <div className="panel glass">
          <p className="panel-title">Match info</p>
          <InfoRow icon={<IconPin />} k="Venue" v={[s.venue, s.city].filter(Boolean).join(", ") || "—"} />
          {s.attendance > 0 && <InfoRow icon={<IconPeople />} k="Attendance" v={s.attendance.toLocaleString()} />}
          {s.officials[0] && <InfoRow icon={<IconWhistle />} k="Referee" v={s.officials[0]} />}
          <InfoRow icon={<IconStats />} k="Competition" v={s.match.note || s.match.league.name} />
        </div>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="tl-divider">
      <span>{label}</span>
    </div>
  );
}

function EventRow({ e, home, delay, score }: { e: KeyEvent; home: boolean; delay: number; score: string | null }) {
  const [p1, p2] = e.players;
  let icon: JSX.Element;
  let title = p1?.name ?? e.text;
  let sub = "";
  if (e.scoring) {
    icon = (
      <span className="tl-icon goal">
        <IconBall />
      </span>
    );
    sub = [score, e.ownGoal ? "Own goal" : e.penalty ? "Penalty" : p2 ? `Assist: ${p2.name}` : "Goal"].filter(Boolean).join(" · ");
  } else if (e.type.includes("yellow")) {
    icon = (
      <span className="tl-icon">
        <i className="card-y" />
      </span>
    );
    sub = "Yellow card";
  } else if (e.type.includes("red")) {
    icon = (
      <span className="tl-icon">
        <i className="card-r" />
      </span>
    );
    sub = "Red card";
  } else if (e.type === "substitution") {
    icon = (
      <span className="tl-icon">
        <IconSub />
      </span>
    );
    title = p1?.name ?? "Substitution";
    sub = p2 ? `Off: ${p2.name}` : "Substitution";
  } else {
    icon = <span className="tl-icon" />;
    sub = e.text;
  }
  const body = (
    <span className="who">
      <b>{title}</b>
      <small>{sub}</small>
    </span>
  );
  return (
    <div className="tl-row" style={{ animationDelay: `${Math.min(delay, 600)}ms` }}>
      <div className="tl-ev home">{home && <>{body}{icon}</>}</div>
      <span className="tl-min">{e.clock.replace(/'\+(\d+)'/, "+$1'")}</span>
      <div className="tl-ev away">{!home && <>{icon}{body}</>}</div>
    </div>
  );
}

function InfoRow({ icon, k, v }: { icon: JSX.Element; k: string; v: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "0.5px solid var(--hairline)" }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, background: "var(--fill-2)", display: "grid", placeItems: "center", color: "var(--ink-2)", flex: "none" }}>
        {icon && <span style={{ width: 16, height: 16, display: "grid" }}>{icon}</span>}
      </span>
      <span className="muted" style={{ fontSize: 14, width: 96, flex: "none" }}>
        {k}
      </span>
      <span style={{ fontWeight: 550, fontSize: 14.5, minWidth: 0 }}>{v}</span>
    </div>
  );
}

function FormPanel({ s }: { s: SummaryData }) {
  const sides = [s.match.home, s.match.away].filter((t) => s.form[t.id]?.length);
  if (!sides.length) return null;
  return (
    <div className="panel glass">
      <p className="panel-title">Recent form</p>
      <div className="grid-2" style={{ gap: 18 }}>
        {sides.map((t) => (
          <div key={t.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 6 }}>
              <Crest src={t.logo} size={22} alt={t.name} />
              {t.short}
            </div>
            {s.form[t.id].map((g) => (
              <Link
                key={g.id}
                to={`/match/${s.match.league.slug}/${g.id}`}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "0.5px solid var(--hairline)", fontSize: 14 }}
              >
                <span className={`form-dot ${g.result}`}>{g.result}</span>
                <Crest src={g.opponentLogo} size={20} alt={g.opponent} />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.opponent}</span>
                <span className="num muted">{g.score}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Stats -- */

const STAT_ROWS: { key: string; label: string; pct?: boolean }[] = [
  { key: "totalShots", label: "Shots" },
  { key: "shotsOnTarget", label: "Shots on target" },
  { key: "blockedShots", label: "Blocked shots" },
  { key: "wonCorners", label: "Corners" },
  { key: "accuratePasses", label: "Accurate passes" },
  { key: "passAccuracy", label: "Pass accuracy", pct: true },
  { key: "totalCrosses", label: "Crosses" },
  { key: "totalLongBalls", label: "Long balls" },
  { key: "totalTackles", label: "Tackles" },
  { key: "interceptions", label: "Interceptions" },
  { key: "effectiveClearance", label: "Clearances" },
  { key: "saves", label: "Saves" },
  { key: "foulsCommitted", label: "Fouls" },
  { key: "offsides", label: "Offsides" },
  { key: "yellowCards", label: "Yellow cards" },
  { key: "redCards", label: "Red cards" },
];

function statMap(list: { name: string; value: string }[] = []) {
  const m: Record<string, number> = {};
  for (const s of list) {
    const n = parseFloat(s.value);
    if (!Number.isNaN(n)) m[s.name] = n;
  }
  if (m.totalPasses) m.passAccuracy = Math.round(((m.accuratePasses ?? 0) / m.totalPasses) * 100);
  return m;
}

function Stats({ s }: { s: SummaryData }) {
  const { home, away } = s.match;
  const H = statMap(s.stats[home.id]);
  const A = statMap(s.stats[away.id]);
  const hp = H.possessionPct ?? 0;
  const ap = A.possessionPct ?? 0;
  const rows = STAT_ROWS.filter((r) => H[r.key] !== undefined || A[r.key] !== undefined);

  if (!rows.length && !hp) {
    return <Empty icon={<IconStats />} title="No statistics yet">Team statistics appear once the match is under way.</Empty>;
  }

  return (
    <div className="panel glass" style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="legend-row">
        <span className="legend-team">
          <span className="key home" />
          <Crest src={home.logo} size={26} alt={home.name} />
          <span>{home.short}</span>
        </span>
        <span className="legend-team away">
          <span className="key away" />
          <Crest src={away.logo} size={26} alt={away.name} />
          <span>{away.short}</span>
        </span>
      </div>

      {hp + ap > 0 && (
        <div className="possession">
          <div className="vals">
            <span>{Math.round(hp)}%</span>
            <span>{Math.round(ap)}%</span>
          </div>
          <div className="label">Possession</div>
          <div className="split-bar" role="img" aria-label={`Possession ${home.short} ${Math.round(hp)}%, ${away.short} ${Math.round(ap)}%`}>
            <div className="h" style={{ flexGrow: hp }} title={`${home.short} ${hp}%`} />
            <div className="a" style={{ flexGrow: ap }} title={`${away.short} ${ap}%`} />
          </div>
        </div>
      )}

      {rows.map((r) => {
        const hv = H[r.key] ?? 0;
        const av = A[r.key] ?? 0;
        const max = r.pct ? 100 : Math.max(hv, av, 1);
        return (
          <div className="cmp-row" key={r.key} title={`${r.label}: ${home.short} ${hv}${r.pct ? "%" : ""}, ${away.short} ${av}${r.pct ? "%" : ""}`}>
            <div className="cmp-head">
              <span className={`v${hv > av ? " lead" : ""}`}>
                {hv}
                {r.pct ? "%" : ""}
              </span>
              <span className="l">{r.label}</span>
              <span className={`v${av > hv ? " lead" : ""}`}>
                {av}
                {r.pct ? "%" : ""}
              </span>
            </div>
            <div className="cmp-bars">
              <div className="cmp-track home">
                <div className={`cmp-fill${hv < av ? " dim" : ""}`} style={{ width: `${(hv / max) * 100}%` }} />
              </div>
              <div className="cmp-track away">
                <div className={`cmp-fill${av < hv ? " dim" : ""}`} style={{ width: `${(av / max) * 100}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- Table -- */

function MatchTable({ league, ids }: { league: string; ids: string[] }) {
  const q = useApi<any>(endpoints.standings(league));
  const data = useMemo(() => (q.data ? normaliseStandings(q.data) : null), [q.data]);
  if (q.loading) return <Skeleton h={520} />;
  const groups = data?.groups.filter((g) => g.rows.length) ?? [];
  if (!groups.length) return <Empty icon={<IconStats />} title="No table for this competition" />;
  const relevant = groups.filter((g) => g.rows.some((r) => ids.includes(r.team.id)));
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 860, margin: "0 auto" }}>
      {(relevant.length ? relevant : groups).map((g) => (
        <StandingsTable key={g.name} group={g} league={league} highlight={ids} compact showTitle={groups.length > 1} />
      ))}
    </div>
  );
}

