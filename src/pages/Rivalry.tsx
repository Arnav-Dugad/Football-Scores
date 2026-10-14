import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconChevronLeft, IconSwap } from "../components/Icons";
import type { H2HGame } from "../components/matchcentre/H2H";
import { Crest, Empty, ErrorState, Skeleton } from "../components/ui";
import { t, tn } from "../i18n";
import { isUpcoming } from "../lib/analytics";
import { endpoints, fixText } from "../lib/api";
import { fmtDate, fmtDayShort, fmtNum, fmtTime, teamTint } from "../lib/format";
import { useApi, useDocumentTitle } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { derbyFor, rivalryHref } from "../lib/rivals";
import { useSeason } from "../lib/season";

interface Club {
  id: string;
  name: string;
  short: string;
  logo: string;
  color: string;
}

function useClub(league: string, id: string): Club | null {
  const q = useApi<any>(id ? endpoints.team(league, id) : null);
  const tm = q.data?.team;
  if (!tm) return null;
  return {
    id,
    name: fixText(tm.displayName),
    short: fixText(tm.shortDisplayName || tm.displayName),
    logo: tm.logos?.[0]?.href ?? "",
    color: teamTint(tm.color ? `#${tm.color}` : null, "#5e5ce6"),
  };
}

export default function Rivalry() {
  const { league = "eng.1", a = "", b = "" } = useParams();
  const nav = useNavigate();
  const A = useClub(league, a);
  const B = useClub(league, b);
  const derby = derbyFor(a, b);
  const q = useApi<{ games?: H2HGame[] }>(a && b ? endpoints.h2h(league, a, b) : null);
  const season = useSeason(league);
  useDocumentTitle(derby ? t(derby.name) : A && B ? t("{home} v {away}", { home: A.short, away: B.short }) : t("Rivalry"));

  const games = useMemo(
    () => (q.data?.games ?? []).filter((g) => g.hs !== null && g.as !== null && Number.isFinite(g.hs) && Number.isFinite(g.as)),
    [q.data],
  );

  const stats = useMemo(() => {
    const goalsFor = (g: H2HGame, id: string) => (g.h === id ? g.hs! : g.as!);
    const winner = (g: H2HGame) => (g.hs! > g.as! ? g.h : g.hs! < g.as! ? g.a : null);
    let aw = 0;
    let bw = 0;
    let d = 0;
    let ag = 0;
    let bg = 0;
    for (const g of games) {
      const w = winner(g);
      if (w === a) aw++;
      else if (w === b) bw++;
      else d++;
      ag += goalsFor(g, a);
      bg += goalsFor(g, b);
    }
    const margin = (g: H2HGame) => Math.abs(g.hs! - g.as!);
    const biggest = (id: string) =>
      games.filter((g) => winner(g) === id).sort((x, y) => margin(y) - margin(x) || goalsFor(y, id) - goalsFor(x, id))[0] ?? null;
    const highest = [...games].sort((x, y) => y.hs! + y.as! - (x.hs! + x.as!))[0] ?? null;
    // Current run (games are newest first).
    let run: { id: string | null; n: number; kind: "unbeaten" | "draws" } | null = null;
    if (games.length) {
      const first = winner(games[0]);
      if (first) {
        let n = 0;
        for (const g of games) {
          if (winner(g) === (first === a ? b : a)) break;
          n++;
        }
        run = { id: first, n, kind: "unbeaten" };
      } else {
        let n = 0;
        for (const g of games) {
          if (winner(g) !== null) break;
          n++;
        }
        run = { id: null, n, kind: "draws" };
      }
    }
    return { aw, bw, d, ag, bg, bigA: biggest(a), bigB: biggest(b), highest, run, since: games.length ? games[games.length - 1].d : null };
  }, [games, a, b]);

  const next = useMemo(() => {
    const s = season.data;
    if (!s) return null;
    return (
      s.matches
        .filter((m) => isUpcoming(m) && ((m.h === a && m.a === b) || (m.h === b && m.a === a)))
        .sort((x, y) => x.d.localeCompare(y.d))[0] ?? null
    );
  }, [season.data, a, b]);

  const back = () => (window.history.length > 1 ? nav(-1) : nav(`/tables/${league}`));
  const loading = q.loading || !A || !B;
  const total = games.length;
  const nameOf = (id: string | null) => (id === a ? A?.short : id === b ? B?.short : "") ?? "";

  const Score = ({ g }: { g: H2HGame }) => (
    <Link to={`/match/${league}/${g.id}`} className="rv-meeting">
      <span className="rv-date">{fmtDate(g.d)}</span>
      <span className="rv-side">
        <span className="nm">{fixText(g.hn)}</span>
        <Crest src={g.hl} size={22} alt="" />
      </span>
      <b className="rv-score num">
        {g.hs}–{g.as}
      </b>
      <span className="rv-side away">
        <Crest src={g.al} size={22} alt="" />
        <span className="nm">{fixText(g.an)}</span>
      </span>
    </Link>
  );

  return (
    <div className="page rv-page" style={A && B ? ({ ["--ca" as string]: A.color, ["--cb" as string]: B.color } as React.CSSProperties) : undefined}>
      <button className="back" onClick={back}>
        <IconChevronLeft />
        {t("Back")}
      </button>

      {q.error && !q.data ? (
        <ErrorState onRetry={q.reload} />
      ) : loading ? (
        <>
          <Skeleton h={300} r={32} />
          <Skeleton h={220} style={{ marginTop: 16 }} />
        </>
      ) : (
        <>
          <section className="rv-hero">
            <div className="rv-hero-bg" aria-hidden />
            <p className="rv-kicker">{t(LEAGUE_BY_SLUG[league]?.name ?? "")}</p>
            <h1 className="rv-title">{derby ? t(derby.name) : t("{home} v {away}", { home: A!.short, away: B!.short })}</h1>
            <div className="rv-clubs">
              <Link to={`/team/${league}/${a}`} className="rv-club">
                <Crest src={A!.logo} size={96} alt={A!.name} />
                <span>{A!.name}</span>
              </Link>
              <Link to={rivalryHref(league, b, a)} replace className="rv-swap" aria-label={t("Swap sides")}>
                <IconSwap />
              </Link>
              <Link to={`/team/${league}/${b}`} className="rv-club">
                <Crest src={B!.logo} size={96} alt={B!.name} />
                <span>{B!.name}</span>
              </Link>
            </div>
            {stats.since && (
              <p className="rv-since">
                {tn(total, "{n} league meeting since {date}", "{n} league meetings since {date}", { date: fmtDate(stats.since) })}
              </p>
            )}
          </section>

          {!total ? (
            <Empty icon={<IconSwap />} title={t("No recent meetings")}>
              {t("These clubs haven’t met in this competition in recent seasons.")}
            </Empty>
          ) : (
            <>
              <section className="panel glass rv-record">
                <div className="rv-record-nums">
                  <div>
                    <b className="num">{fmtNum(stats.aw)}</b>
                    <span>{t("{team} wins", { team: A!.short })}</span>
                  </div>
                  <div className="mid">
                    <b className="num">{fmtNum(stats.d)}</b>
                    <span>{t("Draws")}</span>
                  </div>
                  <div>
                    <b className="num">{fmtNum(stats.bw)}</b>
                    <span>{t("{team} wins", { team: B!.short })}</span>
                  </div>
                </div>
                <div className="rv-bar" role="img" aria-label={t("{a} wins, {d} draws, {b} wins", { a: stats.aw, d: stats.d, b: stats.bw })}>
                  <i style={{ flexGrow: stats.aw || 0.0001, background: "var(--ca)" }} />
                  <i style={{ flexGrow: stats.d || 0.0001 }} className="d" />
                  <i style={{ flexGrow: stats.bw || 0.0001, background: "var(--cb)" }} />
                </div>
                <p className="rv-goals muted">
                  {t("Goals: {a} – {b} · {avg} per game", {
                    a: `${A!.short} ${stats.ag}`,
                    b: `${stats.bg} ${B!.short}`,
                    avg: fmtNum((stats.ag + stats.bg) / total, 1),
                  })}
                </p>
              </section>

              <div className="rv-cards">
                {stats.run && stats.run.n >= 2 && (
                  <div className="tile glass">
                    <div className="k">{t("Current run")}</div>
                    <div className="v rv-v">
                      {stats.run.kind === "draws"
                        ? tn(stats.run.n, "{n} draw in a row", "{n} draws in a row")
                        : tn(stats.run.n, "{team} unbeaten in {n}", "{team} unbeaten in {n}", { team: nameOf(stats.run.id) })}
                    </div>
                  </div>
                )}
                {[
                  { g: stats.bigA, label: t("Biggest {team} win", { team: A!.short }) },
                  { g: stats.bigB, label: t("Biggest {team} win", { team: B!.short }) },
                  { g: stats.highest, label: t("Highest-scoring meeting") },
                ]
                  .filter((c) => c.g)
                  .map((c) => (
                    <Link key={c.label} to={`/match/${league}/${c.g!.id}`} className="tile glass rv-tile">
                      <div className="k">{c.label}</div>
                      <div className="v rv-v num">
                        {c.g!.hs}–{c.g!.as}
                      </div>
                      <div className="s">
                        {fixText(c.g!.hn)} v {fixText(c.g!.an)} · {fmtDate(c.g!.d)}
                      </div>
                    </Link>
                  ))}
              </div>

              {next && (
                <Link to={`/match/${league}/${next.id}`} className="panel glass rv-next">
                  <span className="panel-title">{t("Next meeting")}</span>
                  <b>
                    {fmtDayShort(next.d)} · {fmtTime(next.d)}
                  </b>
                  {next.v && <span className="muted">{next.v}</span>}
                </Link>
              )}

              <section className="section">
                <div className="section-head">
                  <h2 className="section-title">{t("Every meeting")}</h2>
                </div>
                <div className="list glass rv-list">
                  {games.map((g) => (
                    <Score key={g.id} g={g} />
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
