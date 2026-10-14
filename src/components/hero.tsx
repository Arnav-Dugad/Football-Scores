import { Link } from "react-router-dom";
import type { Match, Side } from "../lib/api";
import { endpoints } from "../lib/api";
import { fmtDayShort, fmtTime, relativeDayLabel, teamTint } from "../lib/format";
import { prefetch } from "../lib/hooks";
import { IconCalendar, IconPin } from "./Icons";
import { StatusBadge, matchHref, scorersFor } from "./match";
import { Crest, FormDots, LeagueBadge } from "./ui";

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
