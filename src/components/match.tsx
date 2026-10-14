import { Link } from "react-router-dom";
import type { Match, MatchDetail, Side } from "../lib/api";
import { endpoints } from "../lib/api";
import { fmtTime, lastName } from "../lib/format";
import { prefetch } from "../lib/hooks";
import { Crest } from "./ui";

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

export { scorersFor };
