import { useMemo } from "react";
import { Link } from "react-router-dom";
import { t, tn } from "../../i18n";
import { expectedGoals, goalModel, isPlayed, outcomeProbs, played, table, type SeasonData } from "../../lib/analytics";
import { fmtDayShort, fmtNum, fmtPct } from "../../lib/format";
import { Crest } from "../ui";
import { teamOf, type TeamLite } from "./data";

/* "The story so far": automatic headlines computed from the season data. */

interface Headline {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  crests: string[];
  href: string;
  tone: "good" | "bad" | "neutral";
}

const HOME_ADV = 65;

function buildHeadlines(season: SeasonData, teams: Map<string, TeamLite>, league: string): Headline[] {
  const games = played(season);
  if (games.length < 8) return [];
  const name = (id: string) => teamOf(teams, id).short;
  const logo = (id: string) => teamOf(teams, id).logo;
  const out: Headline[] = [];

  // Biggest upset: replay Elo so each match uses the ratings as they stood before kick-off.
  const seeds = Object.values(season.seed);
  const avg = seeds.length ? seeds.reduce((a, b) => a + b, 0) / seeds.length : 1.37;
  const r = new Map(season.teams.map((tm) => [tm.id, season.seed[tm.id] !== undefined ? 1500 + (season.seed[tm.id] - avg) * 260 : 1440]));
  const gm = goalModel(season, HOME_ADV);
  let upset: { m: (typeof games)[number]; p: number } | null = null;
  for (const m of games) {
    const rh = r.get(m.h) ?? 1500;
    const ra = r.get(m.a) ?? 1500;
    if (m.hs !== m.as) {
      const [lh, la] = expectedGoals(rh + HOME_ADV / 2, ra - HOME_ADV / 2, gm);
      const pr = outcomeProbs(lh, la);
      const p = m.hs! > m.as! ? pr.h : pr.a;
      if (!upset || p < upset.p) upset = { m, p };
    }
    const we = 1 / (1 + 10 ** (-(rh + HOME_ADV - ra) / 400));
    const w = m.hs! > m.as! ? 1 : m.hs! < m.as! ? 0 : 0.5;
    const gd = Math.abs(m.hs! - m.as!);
    const k = 22 * (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);
    r.set(m.h, rh + k * (w - we));
    r.set(m.a, ra - k * (w - we));
  }
  if (upset && upset.p < 0.35) {
    const m = upset.m;
    const winner = m.hs! > m.as! ? m.h : m.a;
    const loser = winner === m.h ? m.a : m.h;
    out.push({
      key: "upset",
      kicker: t("Biggest upset"),
      title: t("{winner} stunned {loser}", { winner: name(winner), loser: name(loser) }),
      sub: t("{score} · {date} · {p} chance before kick-off", {
        score: `${m.hs}–${m.as}`,
        date: fmtDayShort(m.d),
        p: fmtPct(upset.p),
      }),
      crests: [logo(winner), logo(loser)],
      href: `/match/${league}/${m.id}`,
      tone: "neutral",
    });
  }

  // Current runs.
  const results = new Map<string, string>();
  for (const m of games) {
    for (const id of [m.h, m.a]) {
      const us = id === m.h ? m.hs! : m.as!;
      const them = id === m.h ? m.as! : m.hs!;
      results.set(id, (results.get(id) ?? "") + (us > them ? "W" : us < them ? "L" : "D"));
    }
  }
  const run = (s: string, ok: (c: string) => boolean) => {
    let n = 0;
    for (let i = s.length - 1; i >= 0 && ok(s[i]); i--) n++;
    return n;
  };
  const best = (fn: (s: string) => number) =>
    [...results.entries()].map(([id, s]) => ({ id, n: fn(s) })).sort((a, b) => b.n - a.n)[0];
  const wins = best((s) => run(s, (c) => c === "W"));
  const unbeaten = best((s) => run(s, (c) => c !== "L"));
  const winless = best((s) => run(s, (c) => c !== "W"));
  if (wins && wins.n >= 3) {
    out.push({
      key: "wins",
      kicker: t("Form team"),
      title: tn(wins.n, "{team} have won {n} in a row", "{team} have won {n} in a row", { team: name(wins.id) }),
      sub: t("The longest winning run in the league right now"),
      crests: [logo(wins.id)],
      href: `/team/${league}/${wins.id}`,
      tone: "good",
    });
  } else if (unbeaten && unbeaten.n >= 4) {
    out.push({
      key: "unbeaten",
      kicker: t("Form team"),
      title: t("{team} are unbeaten in {n}", { team: name(unbeaten.id), n: unbeaten.n }),
      sub: t("The longest unbeaten run in the league right now"),
      crests: [logo(unbeaten.id)],
      href: `/team/${league}/${unbeaten.id}`,
      tone: "good",
    });
  }
  if (winless && winless.n >= 4) {
    out.push({
      key: "winless",
      kicker: t("Under pressure"),
      title: t("{team} without a win in {n}", { team: name(winless.id), n: winless.n }),
      sub: t("The longest winless run in the league right now"),
      crests: [logo(winless.id)],
      href: `/team/${league}/${winless.id}`,
      tone: "bad",
    });
  }

  // Most improved vs last season (points per game).
  const tbl = table(season);
  const improved = tbl
    .filter((row) => row.gp >= 4 && season.seed[row.team] !== undefined)
    .map((row) => ({ id: row.team, delta: row.pts / row.gp - season.seed[row.team], ppg: row.pts / row.gp }))
    .sort((a, b) => b.delta - a.delta)[0];
  if (improved && improved.delta >= 0.4) {
    out.push({
      key: "improved",
      kicker: t("Most improved"),
      title: t("{team} are up {x} points a game", { team: name(improved.id), x: fmtNum(improved.delta, 2) }),
      sub: t("{now} per game this season, {then} last season", {
        now: fmtNum(improved.ppg, 2),
        then: fmtNum(season.seed[improved.id], 2),
      }),
      crests: [logo(improved.id)],
      href: `/team/${league}/${improved.id}`,
      tone: "good",
    });
  }

  // Goal-fest.
  const fest = [...games].sort((a, b) => b.hs! + b.as! - (a.hs! + a.as!))[0];
  if (fest && fest.hs! + fest.as! >= 5) {
    out.push({
      key: "fest",
      kicker: t("Goal-fest"),
      title: `${name(fest.h)} ${fest.hs}–${fest.as} ${name(fest.a)}`,
      sub: t("The highest-scoring game so far · {date}", { date: fmtDayShort(fest.d) }),
      crests: [logo(fest.h), logo(fest.a)],
      href: `/match/${league}/${fest.id}`,
      tone: "neutral",
    });
  }

  // Meanest defence.
  const defence = tbl.filter((row) => row.gp >= 4).sort((a, b) => a.ga / a.gp - b.ga / b.gp)[0];
  if (defence) {
    out.push({
      key: "defence",
      kicker: t("Meanest defence"),
      title: tn(defence.ga, "{team} have conceded {n} goal", "{team} have conceded {n} goals", { team: name(defence.team) }),
      sub: tn(defence.gp, "In {n} game", "In {n} games"),
      crests: [logo(defence.team)],
      href: `/team/${league}/${defence.team}`,
      tone: "good",
    });
  }

  // Top scorer (from synced goal events).
  const ids = new Set(games.map((m) => m.id));
  const scorers = new Map<string, { n: number; p: string; t: string; pid: string | null }>();
  for (const e of season.events) {
    if ((e.k !== "g" && e.k !== "pg") || !ids.has(e.m) || !e.p) continue;
    const key = e.pid ?? `${e.t}|${e.p}`;
    const s = scorers.get(key) ?? { n: 0, p: e.p, t: e.t, pid: e.pid };
    s.n++;
    scorers.set(key, s);
  }
  const top = [...scorers.values()].sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 3) {
    out.push({
      key: "scorer",
      kicker: t("Leading scorer"),
      title: tn(top.n, "{player} has {n} goal", "{player} has {n} goals", { player: top.p }),
      sub: name(top.t),
      crests: [logo(top.t)],
      href: top.pid ? `/player/${league}/${top.pid}` : `/team/${league}/${top.t}`,
      tone: "neutral",
    });
  }

  return out;
}

export function StorySoFar({ season, teams, league }: { season: SeasonData | undefined; teams: Map<string, TeamLite>; league: string }) {
  const items = useMemo(() => (season ? buildHeadlines(season, teams, league) : []), [season, teams, league]);
  if (!items.length || !season || !season.matches.some(isPlayed)) return null;
  return (
    <section className="section an-story" aria-labelledby="story-title">
      <div className="section-head">
        <h2 className="section-title" id="story-title">
          {t("The story so far")}
        </h2>
      </div>
      <div className="rail an-story-rail">
        {items.map((h, i) => (
          <Link key={h.key} to={h.href} className={`an-story-card glass tone-${h.tone}`} style={{ animationDelay: `${i * 50}ms` }}>
            <span className="an-story-kicker">{h.kicker}</span>
            <span className="an-story-crests" aria-hidden>
              {h.crests.map((c, j) => (
                <Crest key={j} src={c} size={34} alt="" />
              ))}
            </span>
            <b className="an-story-title">{h.title}</b>
            <span className="an-story-sub">{h.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
