import { useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import { outcomeProbs } from "../../lib/analytics";
import { endpoints, type KeyEvent, type Lineup, type LineupPlayer, type Side, type SummaryData } from "../../lib/api";
import { fmtDayShort, fmtPct } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useDrawIn } from "../../lib/motion";
import { minuteOf } from "../../../shared/scoreboard";
import { Pitch, type PickPlayer } from "../lineup";
import { IconExternal } from "../Icons";
import { Crest } from "../ui";
import type { Probs } from "./Hero";

/* ======================================================================
   Live win probability — how the odds moved through the match.
   Full-match scoring rates are fitted to the pre-match probabilities, then
   at every minute the remaining-time rates are applied to the live score
   (with a red-card adjustment) to get home / draw / away chances.
   ====================================================================== */

function poisson(k: number, l: number) {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

/** Fit full-match goal rates whose 1X2 probabilities best match the given ones. */
function fitRates(p: { h: number; d: number; a: number } | null): [number, number] {
  if (!p) return [1.45, 1.15];
  let best: [number, number] = [1.45, 1.15];
  let err = Infinity;
  for (const total of [2.2, 2.45, 2.7, 2.95, 3.2]) {
    for (let s = 0.15; s <= 0.85; s += 0.01) {
      const o = outcomeProbs(total * s, total * (1 - s));
      const e = (o.h - p.h) ** 2 + (o.a - p.a) ** 2 + (o.d - p.d) ** 2;
      if (e < err) {
        err = e;
        best = [total * s, total * (1 - s)];
      }
    }
  }
  return best;
}

function liveProbs(gh: number, ga: number, lh: number, la: number) {
  let h = 0;
  let d = 0;
  let a = 0;
  for (let i = 0; i <= 8; i++) {
    const pi = poisson(i, lh);
    for (let j = 0; j <= 8; j++) {
      const p = pi * poisson(j, la);
      const diff = gh + i - (ga + j);
      if (diff > 0) h += p;
      else if (diff < 0) a += p;
      else d += p;
    }
  }
  const s = h + d + a;
  return { h: h / s, d: d / s, a: a / s };
}

interface ProbPoint {
  min: number;
  h: number;
  d: number;
  a: number;
  gh: number;
  ga: number;
}

const evMinute = (e: KeyEvent) => (e.clockValue > 0 ? e.clockValue / 60 : minuteOf(e.clock));

export function probTimeline(s: SummaryData, pre: Probs | null): ProbPoint[] {
  const m = s.match;
  if (m.state === "pre") return [];
  const [lh0, la0] = fitRates(pre);
  const events = s.events.filter((e) => e.period >= 1 && e.period <= 2);
  const goals = events.filter((e) => e.scoring && e.teamId);
  const reds = events.filter((e) => /red-card/.test(e.type) && e.teamId);
  const lastEvent = Math.max(0, ...events.map(evMinute));
  const now = m.state === "in" ? Math.min(Math.max(minuteOf(m.clock), lastEvent), 120) : Math.max(90, Math.ceil(lastEvent));
  const out: ProbPoint[] = [];
  for (let min = 0; min <= now; min++) {
    const gh = goals.filter((e) => e.teamId === m.home.id && evMinute(e) <= min).length;
    const ga = goals.filter((e) => e.teamId === m.away.id && evMinute(e) <= min).length;
    const rh = reds.filter((e) => e.teamId === m.home.id && evMinute(e) <= min).length;
    const ra = reds.filter((e) => e.teamId === m.away.id && evMinute(e) <= min).length;
    const rem = min < 90 ? (90 - min) / 90 : Math.max(0.01, (94 - min) / 90);
    const diff = rh - ra;
    const fh = diff > 0 ? 0.72 ** diff : 1.25 ** -diff;
    const fa = diff < 0 ? 0.72 ** -diff : 1.25 ** diff;
    const p = liveProbs(gh, ga, lh0 * rem * fh, la0 * rem * fa);
    out.push({ min, ...p, gh, ga });
  }
  // A finished match ends with certainty.
  if (m.state === "post" && m.home.score != null && m.away.score != null && out.length) {
    const hs = m.home.score;
    const as = m.away.score;
    out.push({ min: now + 0.5, h: hs > as ? 1 : 0, d: hs === as ? 1 : 0, a: hs < as ? 1 : 0, gh: hs, ga: as });
  }
  return out;
}

export function LiveWinProb({ s, pre }: { s: SummaryData; pre: Probs | null }) {
  const pts = useMemo(() => probTimeline(s, pre), [s, pre]);
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  if (pts.length < 2) return null;
  const { home, away } = s.match;
  const W = 600;
  const H = 170;
  const maxMin = pts[pts.length - 1].min;
  const x = (min: number) => (min / maxMin) * W;
  const y = (v: number) => H - v * H;
  const area = (lo: (p: ProbPoint) => number, hi: (p: ProbPoint) => number) =>
    `M${pts.map((p) => `${x(p.min).toFixed(1)},${y(hi(p)).toFixed(1)}`).join("L")}L${[...pts]
      .reverse()
      .map((p) => `${x(p.min).toFixed(1)},${y(lo(p)).toFixed(1)}`)
      .join("L")}Z`;
  const cur = pts[hover ?? pts.length - 1];
  const goalMins = s.events.filter((e) => e.scoring && e.period <= 2).map((e) => ({ min: evMinute(e), home: e.teamId === home.id }));
  const live = s.match.state === "in";

  const onMove = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const min = ((e.clientX - r.left) / r.width) * maxMin;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(p.min - min) < Math.abs(pts[best].min - min)) best = i;
    });
    setHover(best);
  };

  return (
    <section className="panel glass mc-liveprob" ref={ref} aria-labelledby="mc-lp-t">
      <div className="mc-lp-head">
        <p className="panel-title" id="mc-lp-t">
          {live ? t("Live win probability") : t("How the win probability moved")}
        </p>
        <span className="subtle mc-lp-min">{hover != null ? `${Math.floor(cur.min)}'` : live ? t("Now") : t("Full time")}</span>
      </div>
      <div className="mc-lp-values" aria-live="polite">
        <span className="h">
          <Crest src={home.logo} size={20} alt="" />
          <b>{fmtPct(cur.h)}</b>
        </span>
        <span className="d">
          {t("Draw")} <b>{fmtPct(cur.d)}</b>
        </span>
        <span className="a">
          <b>{fmtPct(cur.a)}</b>
          <Crest src={away.logo} size={20} alt="" />
        </span>
      </div>
      <div
        className="mc-lp-chart"
        ref={box}
        dir="ltr"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={t("Win probability now: {home} {h}, draw {d}, {away} {a}", { home: home.short, away: away.short, h: fmtPct(cur.h), d: fmtPct(cur.d), a: fmtPct(cur.a) })}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={drawn ? "drawn" : ""}>
          <path className="lp-h" d={area(() => 0, (p) => p.h)} />
          <path className="lp-d" d={area((p) => p.h, (p) => p.h + p.d)} />
          <path className="lp-a" d={area((p) => p.h + p.d, () => 1)} />
          {maxMin > 45 && <line className="lp-ht" x1={x(45)} x2={x(45)} y1={0} y2={H} />}
          {goalMins.map((g, i) => (
            <line key={i} className={`lp-goal ${g.home ? "h" : "a"}`} x1={x(g.min)} x2={x(g.min)} y1={0} y2={H} />
          ))}
          {hover != null && <line className="lp-cross" x1={x(cur.min)} x2={x(cur.min)} y1={0} y2={H} />}
        </svg>
        <div className="mc-lp-axis">
          <span>0'</span>
          {maxMin > 45 && <span style={{ left: `${(45 / maxMin) * 100}%` }}>{t("HT")}</span>}
          <span className="end">{`${Math.floor(maxMin)}'`}</span>
        </div>
      </div>
      <p className="mc-lp-note">
        {pre
          ? t("Starts from {source} and updates with every goal and red card.", { source: pre.source })
          : t("Starts from league-average scoring and updates with every goal and red card.")}
      </p>
    </section>
  );
}

/* ======================================================================
   Highlights (ESPN video clips, when published)
   ====================================================================== */

interface Clip {
  id: string;
  title: string;
  duration: number;
  thumb: string;
  href: string;
}

export function parseClips(raw: any): Clip[] {
  return ((raw?.videos ?? []) as any[])
    .map((v) => ({
      id: String(v.id ?? v.headline),
      title: String(v.headline ?? ""),
      duration: Number(v.duration ?? 0),
      thumb: String(v.thumbnail ?? ""),
      href: String(v.links?.web?.href ?? ""),
    }))
    .filter((c) => c.href.startsWith("https://") && c.title)
    .slice(0, 12);
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function Highlights({ clips }: { clips: Clip[] }) {
  if (!clips.length) return null;
  return (
    <section className="mc-highlights" aria-labelledby="mc-hl-t">
      <div className="section-head">
        <h2 className="section-title" id="mc-hl-t">
          {t("Highlights")}
        </h2>
        <span className="subtle mc-hl-note">{t("Opens on ESPN · availability depends on your region")}</span>
      </div>
      <div className="rail">
        {clips.map((c) => (
          <a key={c.id} href={c.href} target="_blank" rel="noopener noreferrer" className="mc-clip glass">
            <span className="mc-clip-img">
              {c.thumb && <img src={c.thumb} alt="" loading="lazy" />}
              <span className="mc-clip-play" aria-hidden>
                <svg viewBox="0 0 24 24">
                  <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                </svg>
              </span>
              {c.duration > 0 && <span className="mc-clip-dur">{mmss(c.duration)}</span>}
            </span>
            <span className="mc-clip-title">
              {c.title}
              <IconExternal width={13} height={13} aria-hidden />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ======================================================================
   Projected lineups (before kick-off): each club's most recent starting XI.
   ====================================================================== */

interface LastLineup {
  match: string;
  date: string;
  opponent: string;
  formation: string | null;
  players: { id: string; name: string; pos: string; jersey: string; inj: string | null; posName: string }[];
}

function toLineup(teamId: string, l: LastLineup): Lineup {
  return {
    teamId,
    formation: l.formation ?? "",
    players: l.players.map(
      (p, i): LineupPlayer => ({
        id: p.id,
        name: p.name,
        short: p.name,
        jersey: p.jersey,
        pos: p.pos,
        posName: p.posName,
        starter: true,
        subbedIn: false,
        subbedOut: false,
        subMinute: null,
        place: i + 1,
        goals: 0,
        yellow: false,
        red: false,
      }),
    ),
  };
}

export function useProjectedLineups(league: string, home: Side | null, away: Side | null, enabled: boolean) {
  const hq = useApi<LastLineup | null>(enabled && home ? endpoints.lineup(league, home.id) : null);
  const aq = useApi<LastLineup | null>(enabled && away ? endpoints.lineup(league, away.id) : null);
  const ok = (v: LastLineup | null | undefined) => !!v && v.players.length >= 10;
  return { home: ok(hq.data) ? hq.data! : null, away: ok(aq.data) ? aq.data! : null };
}

export function ProjectedLineups({
  home,
  away,
  hl,
  al,
  onPick,
}: {
  home: Side;
  away: Side;
  hl: LastLineup | null;
  al: LastLineup | null;
  onPick: PickPlayer;
}) {
  const lineups = [hl ? toLineup(home.id, hl) : null, al ? toLineup(away.id, al) : null].filter(Boolean) as Lineup[];
  const doubts = [
    ...(hl?.players.filter((p) => p.inj).map((p) => ({ p, side: home })) ?? []),
    ...(al?.players.filter((p) => p.inj).map((p) => ({ p, side: away })) ?? []),
  ];
  return (
    <div className="mc-projected">
      <div className="panel glass mc-proj-head">
        <p className="panel-title">{t("Projected lineups")}</p>
        <p className="muted mc-proj-sub">{t("Based on each club’s most recent starting XI. Official lineups appear about an hour before kick-off.")}</p>
        <ul className="mc-proj-src">
          {[
            { side: home, l: hl },
            { side: away, l: al },
          ].map(({ side, l }) =>
            l ? (
              <li key={side.id}>
                <Crest src={side.logo} size={18} alt="" />
                <span>
                  {t("{team}: last XI vs {opponent}, {date}", { team: side.short, opponent: l.opponent, date: fmtDayShort(l.date) })}
                  {l.formation ? ` · ${l.formation}` : ""}
                </span>
              </li>
            ) : null,
          )}
        </ul>
        {doubts.length > 0 && (
          <p className="mc-proj-doubts">
            {t("Fitness doubts: {list}", { list: doubts.map((d) => `${d.p.name} (${d.p.inj})`).join(", ") })}
          </p>
        )}
      </div>
      <div className="mc-proj-pitch">
        <Pitch home={home} away={away} lineups={lineups} onPick={onPick} />
      </div>
    </div>
  );
}
