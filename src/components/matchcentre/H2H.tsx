import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t, tn } from "../../i18n";
import type { Match } from "../../lib/api";
import { fmtDate, fmtNum, fmtPct } from "../../lib/format";
import { useDrawIn } from "../../lib/motion";
import { IconChevronRight, IconSwap } from "../Icons";
import { Crest, Empty } from "../ui";
import { Legend, Swatch } from "./charts";

/* Head-to-head: record across recent seasons and the list of meetings. */

export interface H2HGame {
  id: string;
  d: string;
  league: string;
  h: string;
  a: string;
  hn: string;
  an: string;
  hl: string;
  al: string;
  hs: number | null;
  as: number | null;
}

export function h2hGames(data: { games?: H2HGame[] } | undefined, m: Match): H2HGame[] {
  return (data?.games ?? []).filter((g) => g.id !== m.id && g.hs !== null && g.as !== null && Number.isFinite(g.hs) && Number.isFinite(g.as));
}

export function H2HTab({ m, games }: { m: Match; games: H2HGame[] }) {
  const [all, setAll] = useState(false);
  const [ref, drawn] = useDrawIn<HTMLDivElement>();
  const rec = useMemo(() => {
    let w = 0;
    let d = 0;
    let l = 0;
    let gf = 0;
    let ga = 0;
    for (const g of games) {
      const homeIsA = g.h === m.home.id;
      const a = homeIsA ? g.hs! : g.as!;
      const b = homeIsA ? g.as! : g.hs!;
      gf += a;
      ga += b;
      if (a > b) w++;
      else if (a < b) l++;
      else d++;
    }
    return { w, d, l, gf, ga, n: games.length };
  }, [games, m.home.id]);

  if (!games.length) {
    return (
      <Empty icon={<IconSwap />} title={t("No previous meetings")}>
        {t("We couldn’t find earlier games between these clubs in recent seasons.")}
      </Empty>
    );
  }
  const shown = all ? games : games.slice(0, 10);
  const n = rec.n || 1;

  return (
    <div className="mc-h2h" ref={ref}>
      <section className="panel glass mc-h2h-sum" aria-labelledby="mc-h2h-t">
        <p className="panel-title" id="mc-h2h-t">
          {tn(rec.n, "Last {n} meeting", "Last {n} meetings")}
        </p>
        <div className="mc-h2h-tiles">
          <div className="mc-h2h-tile">
            <Crest src={m.home.logo} size={40} alt="" />
            <b>{fmtNum(rec.w)}</b>
            <span>{tn(rec.w, "{team} win", "{team} wins", { team: m.home.short })}</span>
          </div>
          <div className="mc-h2h-tile draw">
            <span className="mc-h2h-eq" aria-hidden>
              =
            </span>
            <b>{fmtNum(rec.d)}</b>
            <span>{tn(rec.d, "Draw", "Draws")}</span>
          </div>
          <div className="mc-h2h-tile">
            <Crest src={m.away.logo} size={40} alt="" />
            <b>{fmtNum(rec.l)}</b>
            <span>{tn(rec.l, "{team} win", "{team} wins", { team: m.away.short })}</span>
          </div>
        </div>
        <div
          className="mc-prob-bar lg"
          role="img"
          aria-label={t("{home} won {w}, {d} drawn, {away} won {l}", { home: m.home.short, away: m.away.short, w: rec.w, d: rec.d, l: rec.l })}
        >
          {rec.w > 0 && <i className="h" style={{ flexGrow: drawn ? rec.w : 0.0001 }} />}
          {rec.d > 0 && <i className="d" style={{ flexGrow: drawn ? rec.d : 0.0001 }} />}
          {rec.l > 0 && <i className="a" style={{ flexGrow: drawn ? rec.l : 0.0001 }} />}
        </div>
        <div className="mc-prob-labels" aria-hidden>
          <span>{fmtPct(rec.w / n)}</span>
          <span>{fmtPct(rec.d / n)}</span>
          <span>{fmtPct(rec.l / n)}</span>
        </div>
        <Legend
          items={[
            { key: "h", label: t("{team} win", { team: m.home.short }), swatch: <Swatch side="home" /> },
            { key: "d", label: t("Draw"), swatch: <Swatch neutral /> },
            { key: "a", label: t("{team} win", { team: m.away.short }), swatch: <Swatch side="away" /> },
          ]}
        />
        <dl className="mc-h2h-goals">
          <div>
            <dt>{t("Goals per game")}</dt>
            <dd>
              <span>
                <Crest src={m.home.logo} size={18} alt={m.home.short} /> {fmtNum(rec.gf / n, 1)}
              </span>
              <span>
                {fmtNum(rec.ga / n, 1)} <Crest src={m.away.logo} size={18} alt={m.away.short} />
              </span>
            </dd>
          </div>
          <div>
            <dt>{t("Total goals")}</dt>
            <dd>
              <span>{fmtNum(rec.gf)}</span>
              <span>{fmtNum(rec.ga)}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="mc-h2h-list" aria-label={t("Meetings")}>
        <ul className="list glass">
          {shown.map((g) => {
            const same = !!g.league && !!m.league.abbr && g.league.toLowerCase() === m.league.abbr.toLowerCase();
            const hw = g.hs! > g.as!;
            const aw = g.as! > g.hs!;
            const body = (
              <>
                <span className="mc-h2h-date">
                  <span>{fmtDate(g.d)}</span>
                  {g.league && <span className="pill mc-h2h-comp">{g.league}</span>}
                </span>
                <span className={`mc-h2h-side home${hw ? " win" : aw ? " lose" : ""}`}>
                  <span className="nm">{g.hn}</span>
                  <Crest src={g.hl} size={24} alt="" />
                </span>
                <span className="mc-h2h-score num">
                  {g.hs}–{g.as}
                </span>
                <span className={`mc-h2h-side away${aw ? " win" : hw ? " lose" : ""}`}>
                  <Crest src={g.al} size={24} alt="" />
                  <span className="nm">{g.an}</span>
                </span>
                {same ? <IconChevronRight className="chev" /> : <span className="chev" aria-hidden />}
              </>
            );
            return (
              <li key={g.id}>
                {same ? (
                  <Link to={`/match/${m.league.slug}/${g.id}`} className="row clickable mc-h2h-row">
                    {body}
                  </Link>
                ) : (
                  <div className="row mc-h2h-row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        {games.length > 10 && (
          <button type="button" className="btn ghost mc-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? t("Show fewer") : t("Show all {n} meetings", { n: games.length })}
          </button>
        )}
      </section>
    </div>
  );
}
