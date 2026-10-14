import { useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconChevronRight, IconStar, IconStarFill } from "../components/Icons";
import { Crest, FormDots, LeagueBadge } from "../components/ui";
import { WatchStrip } from "../components/watch";
import { t } from "../i18n";
import { endpoints, normaliseSummary, type Match, type Side } from "../lib/api";
import { fmtDayShort, fmtNum, fmtTime, relativeDayLabel, teamTint } from "../lib/format";
import { peekCache, useApi } from "../lib/hooks";
import { LEAGUES } from "../lib/leagues";
import { haptic, toggleFollow, useSettings } from "../lib/settings";
import { Dialog, useCloseOnRoute } from "./dialog";
import { Bone } from "./skeletons";
import { knownMatches, peekMatch, useAtom } from "./store";

/** Open the long-press preview for a match (idempotent). */
export function openPeek(m: Match) {
  if (peekMatch.get()?.id === m.id) return;
  haptic(10);
  peekMatch.set(m);
}

const QUICK_STATS: { key: string; label: string; pct?: boolean }[] = [
  { key: "possessionPct", label: "Possession", pct: true },
  { key: "totalShots", label: "Shots" },
  { key: "shotsOnTarget", label: "Shots on target" },
  { key: "wonCorners", label: "Corners" },
];

/** The club's domestic league if we know it (UEFA matches carry the UEFA slug). */
function homeLeagueOf(teamId: string, fallback: string): string {
  if (!fallback.startsWith("uefa.")) return fallback;
  for (const l of LEAGUES) {
    if (l.slug.startsWith("uefa.")) continue;
    const d = peekCache<any>(endpoints.standings(l.slug));
    const groups = d?.children ?? [];
    for (const g of groups) {
      if ((g.standings?.entries ?? []).some((e: any) => String(e.team?.id) === teamId)) return l.slug;
    }
  }
  return fallback;
}

export function PeekHost() {
  const m = useAtom(peekMatch);
  const close = useCallback(() => peekMatch.set(null), []);
  const { pathname } = useLocation();
  useCloseOnRoute(pathname, close);
  if (!m) return null;
  return <MatchPeek key={m.id} initial={m} onClose={close} />;
}

function MatchPeek({ initial, onClose }: { initial: Match; onClose: () => void }) {
  const nav = useNavigate();
  const [s] = useSettings();
  const openBtn = useRef<HTMLButtonElement>(null);
  // Prefer the freshest copy (live patches land in knownMatches / the scores cache).
  const m = knownMatches.get(initial.id) ?? initial;
  // Pre-match previews don't need the (heavy) summary.
  const q = useApi<any>(m.state === "pre" ? null : endpoints.summary(m.league.slug, m.id));
  const sum = useMemo(() => {
    if (!q.data) return null;
    try {
      return normaliseSummary(q.data, m.league.slug);
    } catch {
      return null;
    }
  }, [q.data, m.league.slug]);
  const live = sum?.match && sum.match.id === m.id ? { ...m, ...sum.match, league: m.league } : m;

  const hc = teamTint(live.home.color, "#0a84ff");
  const ac = teamTint(live.away.color, "#ff9f0a");
  const showScore = live.state !== "pre" && live.home.score !== null && live.away.score !== null;

  const events = useMemo(() => {
    const list = sum
      ? sum.events
          .filter((e) => e.scoring || /red-card|yellow-red/.test(e.type))
          .map((e) => ({
            id: e.id,
            clock: e.clock,
            teamId: e.teamId ?? "",
            kind: e.scoring ? ("goal" as const) : ("red" as const),
            who: e.players[0]?.name ?? "",
            tag: e.penalty ? t("pen") : e.ownGoal ? t("og") : "",
          }))
      : live.details
          .filter((d) => d.kind !== "yellow")
          .map((d, i) => ({
            id: String(i),
            clock: d.clock,
            teamId: d.teamId,
            kind: d.kind as "goal" | "red",
            who: d.player,
            tag: d.penalty ? t("pen") : d.ownGoal ? t("og") : "",
          }));
    return list.slice(-8);
  }, [sum, live.details]);

  const stats = useMemo(() => {
    if (!sum) return [];
    const h = sum.stats[live.home.id] ?? [];
    const a = sum.stats[live.away.id] ?? [];
    return QUICK_STATS.map((qs) => {
      const hv = h.find((x) => x.name === qs.key)?.value;
      const av = a.find((x) => x.name === qs.key)?.value;
      if (hv == null || av == null) return null;
      const hn = Number(hv);
      const an = Number(av);
      if (!Number.isFinite(hn) || !Number.isFinite(an)) return null;
      return { ...qs, h: hn, a: an };
    }).filter(Boolean) as { key: string; label: string; pct?: boolean; h: number; a: number }[];
  }, [sum, live.home.id, live.away.id]);

  const open = () => {
    // Unmount first so the page transition never captures the sheet.
    onClose();
    nav(`/match/${m.league.slug}/${m.id}`);
  };

  const starBtn = (side: Side) => {
    const on = s.teams.some((x) => x.id === side.id);
    return (
      <button
        key={side.id}
        type="button"
        className={`ix-star${on ? " on" : ""}`}
        aria-pressed={on}
        aria-label={on ? t("Unfollow {team}", { team: side.name }) : t("Follow {team}", { team: side.name })}
        onClick={() => {
          const now = toggleFollow({
            id: side.id,
            league: homeLeagueOf(side.id, m.league.slug),
            name: side.name,
            logo: side.logo,
            color: side.color,
          });
          haptic(now ? [10, 30, 10] : 8);
        }}
      >
        {on ? <IconStarFill /> : <IconStar />}
        <span className="ix-star-name">{side.short || side.name}</span>
      </button>
    );
  };

  return (
    <Dialog label={t("{home} v {away}", { home: m.home.name, away: m.away.name })} onClose={onClose} variant="peek" initialFocus={openBtn} closeButton>
      {() => (
        <div className="ix-peek-body">
          <div
            className="ix-peek-hero"
            style={{
              background: `radial-gradient(60% 80% at 15% 30%, color-mix(in srgb, ${hc} 34%, transparent), transparent 70%), radial-gradient(60% 80% at 85% 30%, color-mix(in srgb, ${ac} 34%, transparent), transparent 70%)`,
            }}
          >
            <div className="ix-peek-league">
              <LeagueBadge slug={m.league.slug} src={m.league.logo} size={22} />
              <span>{m.note || m.league.name}</span>
            </div>
            <div className="ix-peek-teams">
              <div className="ix-peek-team">
                <Crest src={live.home.logo} size={56} alt="" />
                <b>{live.home.short || live.home.name}</b>
                {live.home.form && <FormDots form={live.home.form} />}
              </div>
              <div className="ix-peek-score">
                {showScore ? (
                  <span className="num">
                    {live.home.score}
                    <span className="sep">–</span>
                    {live.away.score}
                  </span>
                ) : (
                  <span className="kick num">{fmtTime(live.date)}</span>
                )}
                <small className={live.state === "in" ? "live" : ""}>
                  {live.state === "in" && <span className="pulse" aria-hidden />}
                  {live.state === "in"
                    ? live.statusName === "STATUS_HALFTIME"
                      ? t("Half-time")
                      : <bdi dir="ltr">{live.clock || live.status}</bdi>
                    : live.state === "post"
                      ? t("Full time")
                      : relativeDayLabel(new Date(live.date)) ?? fmtDayShort(live.date)}
                </small>
              </div>
              <div className="ix-peek-team">
                <Crest src={live.away.logo} size={56} alt="" />
                <b>{live.away.short || live.away.name}</b>
                {live.away.form && <FormDots form={live.away.form} />}
              </div>
            </div>
          </div>

          {events.length > 0 && (
            <section className="ix-peek-section" aria-label={t("Key events")}>
              <h3>{t("Key events")}</h3>
              <ul className="ix-peek-events">
                {events.map((e) => (
                  <li key={e.id} className={e.teamId === live.away.id ? "away" : "home"}>
                    <span className="min num">
                      <bdi dir="ltr">{e.clock}</bdi>
                    </span>
                    <span className={`ic ${e.kind}`} aria-label={e.kind === "goal" ? t("Goal") : t("Red card")} role="img" />
                    <span className="who">
                      {e.who || (e.kind === "goal" ? t("Goal") : t("Red card"))}
                      {e.tag && <small> ({e.tag})</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {live.state !== "pre" &&
            (stats.length > 0 ? (
              <section className="ix-peek-section" aria-label={t("Quick stats")}>
                <h3>{t("Quick stats")}</h3>
                <div className="ix-peek-stats">
                  {stats.map((st) => {
                    const total = st.h + st.a || 1;
                    return (
                      <div className="ix-stat" key={st.key}>
                        <div className="ix-stat-head">
                          <b className="num">{st.pct ? `${fmtNum(st.h)}%` : fmtNum(st.h)}</b>
                          <span>{t(st.label)}</span>
                          <b className="num">{st.pct ? `${fmtNum(st.a)}%` : fmtNum(st.a)}</b>
                        </div>
                        <div className="ix-stat-bar" aria-hidden>
                          <span style={{ width: `${(st.h / total) * 100}%`, background: hc }} />
                          <span style={{ width: `${(st.a / total) * 100}%`, background: ac }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : q.loading ? (
              <section className="ix-peek-section" aria-hidden>
                <Bone w={110} h={12} />
                <Bone h={8} r={4} style={{ marginTop: 14 }} />
                <Bone h={8} r={4} style={{ marginTop: 14 }} />
              </section>
            ) : null)}

          {live.state === "pre" && (
            <section className="ix-peek-section ix-peek-meta">
              <span>{[live.venue, live.city].filter(Boolean).join(", ")}</span>
              <WatchStrip league={m.league.slug} max={3} />
            </section>
          )}

          <div className="ix-peek-follow">
            {starBtn(live.home)}
            {starBtn(live.away)}
          </div>

          <button ref={openBtn} type="button" className="btn ix-peek-open" onClick={open}>
            {t("Open match")}
            <IconChevronRight width={16} height={16} />
          </button>
        </div>
      )}
    </Dialog>
  );
}
