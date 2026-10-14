import { Fragment, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n";
import { openPeek } from "../interaction/peek";
import { observeMatch, returnMatch } from "../interaction/store";
import type { Match, MatchDetail, Side } from "../lib/api";
import { endpoints } from "../lib/api";
import { fmtTime, lastName, teamTint } from "../lib/format";
import { useLongPress } from "../lib/gestures";
import { prefetch } from "../lib/hooks";
import { useScoreFlash } from "../lib/motion";
import { useSettings } from "../lib/settings";
import { IconStarFill } from "./Icons";
import { Crest } from "./ui";
import { WatchStrip } from "./watch";

export function matchHref(m: Pick<Match, "id" | "league">) {
  return `/match/${m.league.slug}/${m.id}`;
}

/** Shared view-transition names (the match hero uses the same ones). */
export const vtNames = (id: string) => ({
  home: `vt-crest-${id}-home`,
  away: `vt-crest-${id}-away`,
  score: `vt-score-${id}`,
});

function isHalfTime(m: Match) {
  return m.statusName === "STATUS_HALFTIME" || /^(HT|half)/i.test(m.status);
}

/** Localised status for finished/odd states; ESPN's own text otherwise. */
function postLabel(m: Match): string {
  const n = m.statusName;
  if (/POSTPONED/.test(n)) return t("Postponed");
  if (/CANCELED|CANCELLED/.test(n)) return t("Cancelled");
  if (/ABANDONED/.test(n)) return t("Abandoned");
  if (/SUSPENDED/.test(n)) return t("Suspended");
  if (/FINAL_AET|AET/.test(n) || /^AET$/i.test(m.status)) return t("After extra time");
  if (/PEN/.test(n) || /pens/i.test(m.status)) return t("Penalties");
  if (!m.status || /^FT$/i.test(m.status) || n === "STATUS_FULL_TIME" || n === "STATUS_FINAL") return t("Full time");
  return m.status;
}

export function StatusBadge({ m, big }: { m: Match; big?: boolean }) {
  if (m.state === "in") {
    // Clocks like 45'+2' are Latin-direction text: isolate them so RTL doesn't flip the apostrophes.
    const label = isHalfTime(m) ? t("Half-time") : <bdi dir="ltr">{m.clock || m.status}</bdi>;
    return (
      <span className={big ? "pill live" : "status live"}>
        <span className="pulse" aria-hidden />
        {label}
      </span>
    );
  }
  if (m.state === "post") return <span className={big ? "pill" : "status post"}>{postLabel(m)}</span>;
  if (/POSTPONED/.test(m.statusName)) return <span className={big ? "pill" : "status post"}>{t("Postponed")}</span>;
  if (big) return <span className="pill">{t("Upcoming")}</span>;
  return <span className="status pre">{fmtTime(m.date)}</span>;
}

function scorersFor(details: MatchDetail[], teamId: string) {
  const goals = details.filter((d) => d.kind === "goal" && d.teamId === teamId);
  const by = new Map<string, string[]>();
  for (const g of goals) {
    const n = lastName(g.player || t("Goal"));
    const tag = g.clock + (g.penalty ? ` ${t("pen")}` : g.ownGoal ? ` ${t("og")}` : "");
    by.set(n, [...(by.get(n) ?? []), tag]);
  }
  return [...by.entries()].map(([n, mins]) => `${n} ${mins.join(", ")}`);
}

function Team({
  side,
  other,
  m,
  followed,
  vtName,
  vtStyle,
}: {
  side: Side;
  other: Side;
  m: Match;
  followed: boolean;
  vtName?: string;
  vtStyle?: CSSProperties;
}) {
  const decided = m.state === "post" && side.score !== null && other.score !== null;
  const cls = decided ? (side.winner ? " winner" : other.winner ? " loser" : "") : "";
  const reds = m.details.filter((d) => d.kind === "red" && d.teamId === side.id).length;
  return (
    <div className={`mc-team${cls}`}>
      <span className="mc-crest" data-vt={vtName} style={vtStyle}>
        <Crest src={side.logo} size={30} alt="" />
      </span>
      <span className="mc-name">
        <span className="mc-name-text">{side.name}</span>
        {followed && (
          <span className="mc-follow" title={t("Following")}>
            <IconStarFill width={12} height={12} />
          </span>
        )}
        {reds > 0 && (
          <span className="redcard" role="img" aria-label={t(reds > 1 ? "{n} red cards" : "{n} red card", { n: reds })} />
        )}
      </span>
    </div>
  );
}

export function MatchCard({
  m,
  index = 0,
  showLeague,
  vt = true,
}: {
  m: Match;
  index?: number;
  showLeague?: boolean;
  /** Allow shared-element (view transition) names on this instance. Only one instance per match may carry them. */
  vt?: boolean;
}) {
  const [s] = useSettings();
  const ref = useRef<HTMLAnchorElement>(null);
  const flash = useScoreFlash(m.home.score, m.away.score);
  const followH = s.teams.some((x) => x.id === m.home.id);
  const followA = s.teams.some((x) => x.id === m.away.id);
  const followed = followH || followA;

  useEffect(() => (ref.current ? observeMatch(ref.current, m.id) : undefined), [m.id]);

  const peek = useCallback(() => openPeek(m), [m]);
  const press = useLongPress(peek);

  const goals = m.state !== "pre" ? [...scorersFor(m.details, m.home.id), ...scorersFor(m.details, m.away.id)] : [];
  const names = vtNames(m.id);
  // Name the crests statically only for the card the viewer came back from.
  const morph = vt && returnMatch.get() === m.id;
  const vtStyle = (name: string): CSSProperties | undefined => (morph ? ({ viewTransitionName: name } as CSSProperties) : undefined);

  const hs = m.home.score;
  const as = m.away.score;
  const showScore = m.state !== "pre" && hs !== null && as !== null;
  const decided = m.state === "post" && showScore;
  const sweep = flash ? teamTint(flash === "home" ? m.home.color : m.away.color, "#30d158") : null;

  const label =
    (showScore
      ? t("{home} {hs}, {away} {as}", { home: m.home.name, hs: hs ?? 0, away: m.away.name, as: as ?? 0 })
      : t("{home} v {away}", { home: m.home.name, away: m.away.name })) +
    ` · ${m.state === "in" ? `${t("Live")} ${isHalfTime(m) ? t("Half-time") : m.clock}` : m.state === "post" ? postLabel(m) : fmtTime(m.date)}` +
    (followed ? ` · ${t("Following")}` : "");

  return (
    <Link
      ref={ref}
      to={matchHref(m)}
      className={`match-card glass${followed ? " followed" : ""}${m.state === "in" ? " is-live" : ""}${flash ? " scored" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onPointerEnter={() => prefetch(endpoints.summary(m.league.slug, m.id))}
      onFocus={() => prefetch(endpoints.summary(m.league.slug, m.id))}
      aria-label={label}
      {...press}
      onContextMenu={(e) => {
        // Right-click, the context-menu key and Android long-press open the peek.
        // Shift+right-click keeps the browser's own menu.
        if (e.shiftKey) return;
        e.preventDefault();
        peek();
      }}
    >
      {sweep && <span key={`${flash}-${hs}-${as}`} className="mc-sweep" style={{ ["--sweep" as string]: sweep }} aria-hidden />}
      <div className="mc-body">
        <Team side={m.home} other={m.away} m={m} followed={followH} vtName={vt ? names.home : undefined} vtStyle={vtStyle(names.home)} />
        <Team side={m.away} other={m.home} m={m} followed={followA} vtName={vt ? names.away : undefined} vtStyle={vtStyle(names.away)} />
        <div className="mc-scores" data-vt={vt ? names.score : undefined} style={vtStyle(names.score)} aria-hidden>
          {showScore ? (
            <>
              <span className={`mc-score${decided && m.away.winner ? " loser" : ""}${flash === "home" ? " goal-flash" : ""}`}>{hs}</span>
              <span className={`mc-score${decided && m.home.winner ? " loser" : ""}${flash === "away" ? " goal-flash" : ""}`}>{as}</span>
            </>
          ) : null}
        </div>
      </div>
      {goals.length > 0 && (
        <div className="mc-scorers">
          <span aria-hidden>⚽︎ </span>
          {goals.map((g, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              <bdi>{g}</bdi>
            </Fragment>
          ))}
        </div>
      )}
      <div className="mc-foot">
        <StatusBadge m={m} />
        <span className="mc-foot-end">
          <span className="venue">{showLeague ? m.league.name : m.venue}</span>
          {m.state !== "post" && <WatchStrip league={m.league.slug} max={2} />}
        </span>
      </div>
    </Link>
  );
}

export { scorersFor };
