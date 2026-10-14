import { Link } from "react-router-dom";
import type { Match, MatchDetail, Side } from "../lib/api";
import { endpoints } from "../lib/api";
import { fmtDayShort, fmtTime, lastName, relativeDayLabel, teamTint } from "../lib/format";
import { prefetch } from "../lib/hooks";
import { IconCalendar, IconPin } from "./Icons";
import { Crest, FormDots, LeagueBadge } from "./ui";

export function matchHref(m: Pick<Match, "id" | "league">) {
  return `/match/${m.league.slug}/${m.id}`;
}

export function StatusBadge({ m, big }: { m: Match; big?: boolean }) {
  if (m.state === "in") {
    const label = /half/i.test(m.status) || m.statusName === "STATUS_HALFTIME" ? "Half-time" : m.clock || m.status;
    return (
      <span className={big ? "pill live" : "status live"}>
        <span className="pulse" />
        {label}
      </span>
    );
  }
  if (m.state === "post") {
    const s = /postp|cancel|abandon|suspend/i.test(m.statusName) ? m.status : m.status === "FT" || !m.status ? "Full time" : m.status;
    return <span className={big ? "pill" : "status post"}>{s.replace(/^FT$/, "Full time")}</span>;
  }
  if (big) return <span className="pill">{/postp/i.test(m.statusName) ? "Postponed" : "Upcoming"}</span>;
  return <span className="status pre">{fmtTime(m.date)}</span>;
}

function scorersFor(details: MatchDetail[], teamId: string) {
  const goals = details.filter((d) => d.kind === "goal" && d.teamId === teamId);
  const by = new Map<string, string[]>();
  for (const g of goals) {
    const n = lastName(g.player || "Goal");
    const tag = g.clock + (g.penalty ? " pen" : g.ownGoal ? " og" : "");
    by.set(n, [...(by.get(n) ?? []), tag]);
  }
  return [...by.entries()].map(([n, mins]) => `${n} ${mins.join(", ")}`);
}

function Row({ side, other, m }: { side: Side; other: Side; m: Match }) {
  const decided = m.state === "post" && side.score !== null && other.score !== null;
  const cls = decided ? (side.winner ? "winner" : other.winner ? "loser" : "") : "";
  const reds = m.details.filter((d) => d.kind === "red" && d.teamId === side.id).length;
  return (
    <div className={`mc-row ${cls}`}>
      <Crest src={side.logo} size={30} alt={side.name} />
      <span className="mc-name">
        {side.name}
        {reds > 0 && <span className="redcard" title={`${reds} red card${reds > 1 ? "s" : ""}`} />}
      </span>
      <span className="mc-score">{side.score ?? ""}</span>
    </div>
  );
}

export function MatchCard({ m, index = 0, showLeague }: { m: Match; index?: number; showLeague?: boolean }) {
  const goals = m.state !== "pre" ? [...scorersFor(m.details, m.home.id), ...scorersFor(m.details, m.away.id)] : [];
  return (
    <Link
      to={matchHref(m)}
      className="match-card glass"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onPointerEnter={() => prefetch(endpoints.summary(m.league.slug, m.id))}
      aria-label={`${m.home.name} ${m.home.score ?? ""} ${m.away.name} ${m.away.score ?? ""}`}
    >
      <Row side={m.home} other={m.away} m={m} />
      <Row side={m.away} other={m.home} m={m} />
      {goals.length > 0 && <div className="mc-scorers">⚽︎ {goals.join(" · ")}</div>}
      <div className="mc-foot">
        <StatusBadge m={m} />
        <span className="venue">{showLeague ? m.league.name : m.venue}</span>
      </div>
    </Link>
  );
}

/* ---------------------------------------------------------------- Hero -- */

export function MatchHero({ m, link = true, form }: { m: Match; link?: boolean; form?: { home?: string; away?: string } }) {
  const hc = teamTint(m.home.color, "#0a84ff");
  const ac = teamTint(m.away.color, "#ff9f0a");
  const hs = scorersFor(m.details, m.home.id);
  const as = scorersFor(m.details, m.away.id);
  const inner = (
    <>
      <div
        className="hero-glow"
        style={{
          background: `radial-gradient(40% 50% at 18% 40%, ${hc}, transparent 70%), radial-gradient(40% 50% at 82% 40%, ${ac}, transparent 70%)`,
        }}
      />
      <div className="hero-top">
        <span className="league">
          <LeagueBadge slug={m.league.slug} src={m.league.logo} size={26} />
          <span>{m.note || m.league.name}</span>
        </span>
        <StatusBadge m={m} big />
      </div>
      <div className="hero-body">
        <TeamCol side={m.home} league={m.league.slug} form={form?.home ?? m.home.form} link={!link} />
        <div className="hero-score">
          {m.state === "pre" ? (
            <>
              <div className="kick">{fmtTime(m.date)}</div>
              <div className="sub muted" style={{ fontSize: 14, fontWeight: 500 }}>
                {relativeDayLabel(new Date(m.date)) ?? fmtDayShort(m.date)}
              </div>
            </>
          ) : (
            <>
              <div className="big">
                {m.home.score ?? 0}
                <span className="sep">–</span>
                {m.away.score ?? 0}
              </div>
              {m.home.shootout != null && m.away.shootout != null && (
                <div className="sub muted" style={{ fontSize: 13 }}>
                  Pens {m.home.shootout}–{m.away.shootout}
                </div>
              )}
            </>
          )}
        </div>
        <TeamCol side={m.away} league={m.league.slug} form={form?.away ?? m.away.form} link={!link} />
      </div>
      {(hs.length > 0 || as.length > 0) && (
        <div className="hero-scorers">
          <div>
            {hs.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <span />
          <div>
            {as.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      )}
      <div className="hero-meta">
        {m.venue && (
          <span>
            <IconPin />
            {m.venue}
            {m.city ? `, ${m.city}` : ""}
          </span>
        )}
        <span>
          <IconCalendar />
          {fmtDayShort(m.date)} · {fmtTime(m.date)}
        </span>
      </div>
    </>
  );
  if (link) {
    return (
      <Link to={matchHref(m)} className="hero glass" onPointerEnter={() => prefetch(endpoints.summary(m.league.slug, m.id))}>
        {inner}
      </Link>
    );
  }
  return <section className="hero glass">{inner}</section>;
}

function TeamCol({ side, league, form, link }: { side: Side; league: string; form?: string; link: boolean }) {
  const body = (
    <>
      <Crest src={side.logo} size={88} alt={side.name} style={{ width: "clamp(56px, 12vw, 96px)", height: "clamp(56px, 12vw, 96px)" }} />
      <span className="name">{side.name}</span>
      {form ? (
        <span className="form">
          <FormDots form={form} />
        </span>
      ) : null}
    </>
  );
  return link ? (
    <Link to={`/team/${league}/${side.id}`} className="hero-team">
      {body}
    </Link>
  ) : (
    <div className="hero-team">{body}</div>
  );
}
