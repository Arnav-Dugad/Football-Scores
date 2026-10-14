import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconCalendar, IconChevronLeft, IconPeople, IconPin, IconTrophy } from "../components/Icons";
import { PlayerSheet, type PlayerRef } from "../components/PlayerSheet";
import { Crest, ErrorState, FormDots, Segmented, Skeleton, tsdbSize } from "../components/ui";
import {
  endpoints,
  fixText,
  normaliseRoster,
  normaliseSchedule,
  normaliseStandings,
  sized,
  type SquadPlayer,
  type TeamGame,
  type TeamInfo,
} from "../lib/api";
import { fmtDayShort, fmtTime, initials, teamTint } from "../lib/format";
import { useApi, useDocumentTitle, useInView, usePlayer } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";

type Tab = "overview" | "squad";

export default function Team() {
  const { league = "eng.1", id = "" } = useParams();
  const nav = useNavigate();
  const tq = useApi<any>(endpoints.team(league, id));
  const t = tq.data?.team;
  const name = fixText(t?.displayName ?? "");
  const color = teamTint(t?.color ? `#${t.color}` : null, "#1d1d1f");
  const logo = t?.logos?.[0]?.href ?? "";
  useDocumentTitle(name || "Club");

  const info = useApi<TeamInfo>(t ? endpoints.teamInfo(id, name) : null);
  const st = useApi<any>(endpoints.standings(league));
  const row = useMemo(() => {
    if (!st.data) return null;
    for (const g of normaliseStandings(st.data).groups) {
      const r = g.rows.find((x) => x.team.id === id);
      if (r) return { ...r, of: g.rows.length };
    }
    return null;
  }, [st.data, id]);

  const results = useApi<any>(endpoints.results(league, id));
  const fixtures = useApi<any>(endpoints.fixtures(league, id));
  const past = useMemo(
    () => (results.data ? normaliseSchedule(results.data).filter((g) => g.state === "post").sort((a, b) => b.date.localeCompare(a.date)) : []),
    [results.data],
  );
  const upcoming = useMemo(
    () => (fixtures.data ? normaliseSchedule(fixtures.data).filter((g) => g.state !== "post").sort((a, b) => a.date.localeCompare(b.date)) : []),
    [fixtures.data],
  );
  const form = past
    .slice(0, 5)
    .reverse()
    .map((g) => result(g, id))
    .join("");

  const [tab, setTab] = useState<Tab>("overview");
  const [player, setPlayer] = useState<PlayerRef | null>(null);

  const img = info.data?.fanart?.[0] || info.data?.stadiumPhoto || null;

  return (
    <div className="page">
      <button className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(`/tables/${league}`))}>
        <IconChevronLeft />
        Back
      </button>

      {tq.loading ? (
        <Skeleton h={320} r={32} />
      ) : tq.error && !t ? (
        <ErrorState onRetry={tq.reload} />
      ) : t ? (
        <>
          <section className="team-hero" style={{ background: color }}>
            {img && <img className="bgimg" src={tsdbSize(img, "medium") ?? img} alt="" />}
            <div
              className="shade"
              style={{
                background: img
                  ? `linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.25) 45%, color-mix(in srgb, ${color} 55%, black) 100%)`
                  : `radial-gradient(80% 120% at 85% 0%, color-mix(in srgb, ${color} 70%, white), ${color} 50%, color-mix(in srgb, ${color} 60%, black))`,
              }}
            />
            <div className="content">
              <div className="crestwrap">
                <Crest src={logo} size={76} alt={name} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                  {t.standingSummary || LEAGUE_BY_SLUG[league]?.name}
                </div>
                <h1>{name}</h1>
                <div className="facts">
                  {info.data?.stadium && (
                    <span>
                      <IconPin />
                      {info.data.stadium}
                      {info.data.capacity ? ` · ${Number(info.data.capacity).toLocaleString()}` : ""}
                    </span>
                  )}
                  {info.data?.formed && (
                    <span>
                      <IconTrophy />
                      Est. {info.data.formed}
                    </span>
                  )}
                  {info.data?.location && (
                    <span>
                      <IconPeople />
                      {info.data.location.split(",").slice(-2).join(",").trim()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {row && (
            <div className="tiles" style={{ marginTop: 16 }}>
              <div className="tile glass">
                <div className="k">Position</div>
                <div className="v">
                  {row.rank}
                  <span className="subtle" style={{ fontSize: 18, fontWeight: 600 }}>
                    {" "}
                    / {row.of}
                  </span>
                </div>
                <div className="s">{row.note?.description ?? LEAGUE_BY_SLUG[league]?.name}</div>
              </div>
              <div className="tile glass" style={{ animationDelay: "40ms" }}>
                <div className="k">Points</div>
                <div className="v">{row.pts}</div>
                <div className="s">
                  {row.gp ? (row.pts / row.gp).toFixed(2) : "0"} per game · {row.gp} played
                </div>
              </div>
              <div className="tile glass" style={{ animationDelay: "80ms" }}>
                <div className="k">Record</div>
                <div className="v num">
                  {row.w}-{row.d}-{row.l}
                </div>
                <div className="s">{form ? <FormDots form={form} /> : "W–D–L"}</div>
              </div>
              <div className="tile glass" style={{ animationDelay: "120ms" }}>
                <div className="k">Goal difference</div>
                <div className="v" style={{ color: row.gd > 0 ? "var(--good)" : row.gd < 0 ? "var(--bad)" : undefined }}>
                  {row.gd > 0 ? `+${row.gd}` : row.gd}
                </div>
                <div className="s">
                  {row.gf} scored · {row.ga} conceded
                </div>
              </div>
            </div>
          )}

          <div className="tabs-row">
            <Segmented
              options={[
                { value: "overview" as Tab, label: "Fixtures & results" },
                { value: "squad" as Tab, label: "Squad" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === "overview" ? (
            <div className="grid-2" style={{ alignItems: "start" }}>
              <GameList title="Upcoming" games={upcoming.slice(0, 8)} teamId={id} league={league} loading={fixtures.loading} empty="No upcoming fixtures scheduled." />
              <GameList title="Results" games={past.slice(0, 8)} teamId={id} league={league} loading={results.loading} empty="No results yet this season." />
            </div>
          ) : (
            <Squad league={league} id={id} teamName={name} color={color} logo={logo} onPick={setPlayer} />
          )}

          {info.data?.description && tab === "overview" && (
            <section className="section panel glass">
              <p className="panel-title">About the club</p>
              <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.6 }}>
                {info.data.description.split(/(?<=\.)\s+/).slice(0, 4).join(" ")}
              </p>
            </section>
          )}
        </>
      ) : null}

      {player && <PlayerSheet p={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}

function result(g: TeamGame, teamId: string): string {
  const us = g.home.id === teamId ? g.home : g.away;
  const them = g.home.id === teamId ? g.away : g.home;
  if (us.score == null || them.score == null) return "";
  return us.score > them.score ? "W" : us.score < them.score ? "L" : "D";
}

function GameList({
  title,
  games,
  teamId,
  league,
  loading,
  empty,
}: {
  title: string;
  games: TeamGame[];
  teamId: string;
  league: string;
  loading: boolean;
  empty: string;
}) {
  return (
    <div>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
      </div>
      {loading ? (
        <Skeleton h={360} />
      ) : (
        <div className="list glass">
          {games.map((g) => {
            const isHome = g.home.id === teamId;
            const opp = isHome ? g.away : g.home;
            const r = g.state === "post" ? result(g, teamId) : "";
            return (
              <Link key={g.id} to={`/match/${g.leagueSlug || league}/${g.id}`} className="row clickable">
                <Crest src={opp.logo} size={32} alt={opp.name} />
                <div className="grow">
                  <div className="title">
                    <span className="subtle" style={{ fontWeight: 500, marginRight: 6 }}>
                      {isHome ? "vs" : "at"}
                    </span>
                    {opp.name}
                  </div>
                  <div className="caption">
                    {fmtDayShort(g.date)} · {g.league}
                  </div>
                </div>
                {g.state === "post" ? (
                  <>
                    <span className="num" style={{ fontWeight: 650, fontSize: 16 }}>
                      {g.home.score}–{g.away.score}
                    </span>
                    {r && <span className={`form-dot ${r}`}>{r}</span>}
                  </>
                ) : (
                  <span className="pill">
                    <IconCalendar width={13} height={13} />
                    {fmtTime(g.date)}
                  </span>
                )}
              </Link>
            );
          })}
          {!games.length && <div className="row muted">{empty}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Squad ---- */

function Squad({
  league,
  id,
  teamName,
  color,
  logo,
  onPick,
}: {
  league: string;
  id: string;
  teamName: string;
  color: string;
  logo: string;
  onPick: (p: PlayerRef) => void;
}) {
  const q = useApi<any>(endpoints.roster(league, id));
  const players = useMemo(() => (q.data ? normaliseRoster(q.data) : []), [q.data]);
  const groups = useMemo(() => {
    const order: SquadPlayer["group"][] = ["Goalkeepers", "Defenders", "Midfielders", "Forwards", "Squad"];
    return order
      .map((g) => ({ g, list: players.filter((p) => p.group === g).sort((a, b) => Number(a.jersey || 99) - Number(b.jersey || 99)) }))
      .filter((x) => x.list.length);
  }, [players]);

  if (q.loading) return <Skeleton h={480} />;
  if (!players.length) return <ErrorState onRetry={q.reload} />;

  return (
    <div>
      {groups.map(({ g, list }) => (
        <section key={g} style={{ marginBottom: 28 }}>
          <div className="section-head">
            <h2 className="section-title">{g}</h2>
            <span className="subtle num">{list.length}</span>
          </div>
          <div className="squad-grid">
            {list.map((p, i) => (
              <PlayerCard
                key={p.id}
                p={p}
                team={teamName}
                color={color}
                index={i}
                onClick={() =>
                  onPick({
                    name: p.name,
                    id: p.id,
                    league,
                    jersey: p.jersey,
                    position: p.position,
                    nationality: p.nationality,
                    flag: p.flag,
                    dob: p.dob,
                    height: p.height,
                    team: { name: teamName, logo, color },
                  })
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PlayerCard({ p, team, color, index, onClick }: { p: SquadPlayer; team: string; color: string; index: number; onClick: () => void }) {
  const [ref, seen] = useInView<HTMLButtonElement>("200px");
  const { info } = usePlayer(p.name, team, { enabled: seen });
  const [err, setErr] = useState(false);
  const cut = tsdbSize(info?.cutout, "small");
  const photo = !cut ? tsdbSize(info?.photo, "small") : null;
  const src = !err ? cut || photo : null;
  return (
    <button ref={ref} className="player-card glass" onClick={onClick} style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <div className="photo">
        <div
          className="tint"
          style={{ background: `radial-gradient(100% 90% at 50% 100%, color-mix(in srgb, ${color} 75%, white 10%), color-mix(in srgb, ${color} 55%, black))` }}
        />
        {!src && <span className="ini">{initials(p.name)}</span>}
        {src && <img src={src} alt={p.name} className={cut ? "cutout" : ""} loading="lazy" onError={() => setErr(true)} />}
        {p.jersey && <span className="jn">{p.jersey}</span>}
      </div>
      <div className="meta">
        <b>{p.name}</b>
        <span>
          {p.flag && <img className="flag" src={sized(p.flag, 40)} alt="" loading="lazy" />}
          {p.age ? `${p.age} yrs` : p.position}
          {p.nationality ? ` · ${p.nationality}` : ""}
        </span>
      </div>
    </button>
  );
}
