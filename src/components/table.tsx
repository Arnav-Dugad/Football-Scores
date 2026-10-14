import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import type { Row } from "../lib/analytics";
import type { TableGroup, TableRow } from "../lib/api";
import { fmtNum } from "../lib/format";
import { prefersReducedMotion } from "../lib/motion";
import { IconArrowUp } from "./Icons";
import type { TeamLite } from "./league/data";
import { Crest, FormDots } from "./ui";

/** Map ESPN's zone descriptions onto a calm, consistent set of colours. */
export function zoneColor(desc: string): string {
  const d = desc.toLowerCase();
  if (/relegation/.test(d)) return /play/.test(d) ? "#ffd60a" : "#ff453a";
  if (/champions league/.test(d)) return /qualif/.test(d) ? "#64d2ff" : "#0a84ff";
  if (/europa/.test(d)) return "#ff9f0a";
  if (/conference/.test(d)) return "#30d158";
  if (/round of 16|^knockout phase$|automatic/.test(d)) return "#0a84ff";
  if (/play-?off|wild ?card|knockout/.test(d)) return "#bf5af2";
  if (/promot/.test(d)) return "#30d158";
  return "#8e8e93";
}

/* -------------------------------------------------------------- moves --- */

/** Places gained (+) or lost (−) — arrow + number, never colour alone. */
export function Move({ v, vs }: { v: number; vs?: string }) {
  if (!v) {
    return (
      <span className="tb-move flat" aria-label={t("No change")}>
        <span aria-hidden>–</span>
      </span>
    );
  }
  const up = v > 0;
  const label = up ? t("Up {n} {vs}", { n: v, vs: vs ?? "" }) : t("Down {n} {vs}", { n: -v, vs: vs ?? "" });
  return (
    <span className={`tb-move ${up ? "up" : "down"}`} aria-label={label.trim()} title={label.trim()}>
      <IconArrowUp aria-hidden />
      <span className="num">{Math.abs(v)}</span>
    </span>
  );
}

/** FLIP: rows glide to their new position when the order changes. */
function useRowFlip(order: string) {
  const body = useRef<HTMLTableSectionElement>(null);
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const next = new Map<string, number>();
    const rows = [...el.querySelectorAll<HTMLTableRowElement>("tr[data-id]")];
    for (const r of rows) next.set(r.dataset.id!, r.offsetTop);
    if (prev.current.size && !prefersReducedMotion()) {
      for (const r of rows) {
        const before = prev.current.get(r.dataset.id!);
        const now = next.get(r.dataset.id!)!;
        if (before === undefined || before === now) continue;
        r.animate([{ transform: `translateY(${before - now}px)` }, { transform: "translateY(0)" }], {
          duration: 650,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
    }
    prev.current = next;
  }, [order]);
  return body;
}

/* ---------------------------------------------------------- live info --- */

export interface LiveCell {
  /** Score from this club's perspective, e.g. "2–1". */
  score: string;
  result: "W" | "D" | "L";
  opponent: { name: string; logo: string };
  clock: string;
  matchId: string;
}

/* ---------------------------------------------------- standings table --- */

export function StandingsTable({
  group,
  league,
  highlight = [],
  compact,
  showTitle,
  live,
  moves,
  liveMode,
}: {
  group: TableGroup;
  league: string;
  highlight?: string[];
  compact?: boolean;
  showTitle?: boolean;
  /** Live match per club (live table). */
  live?: Map<string, LiveCell>;
  /** Places moved vs the pre-live table. */
  moves?: Map<string, number>;
  liveMode?: boolean;
}) {
  const nav = useNavigate();
  const zones = new Map<string, string>();
  for (const r of group.rows) if (r.note?.description) zones.set(r.note.description, zoneColor(r.note.description));
  const body = useRowFlip(group.rows.map((r) => r.team.id).join(","));

  return (
    <div className={`table-card glass${liveMode ? " tb-live" : ""}`}>
      {showTitle && group.name && <div className="tb-title">{group.name}</div>}
      <div className="table-scroll">
        <table className="standings">
          {group.name && <caption className="sr-only">{group.name}</caption>}
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="club">
                {t("Club")}
              </th>
              <th scope="col" title={t("Played")}>
                {t("P")}
              </th>
              <th scope="col" className="hide-sm" title={t("Won")}>
                {t("W")}
              </th>
              <th scope="col" className="hide-sm" title={t("Drawn")}>
                {t("D")}
              </th>
              <th scope="col" className="hide-sm" title={t("Lost")}>
                {t("L")}
              </th>
              {!compact && (
                <th scope="col" className="hide-sm" title={t("Goals for")}>
                  {t("GF")}
                </th>
              )}
              {!compact && (
                <th scope="col" className="hide-sm" title={t("Goals against")}>
                  {t("GA")}
                </th>
              )}
              <th scope="col" title={t("Goal difference")}>
                {t("GD")}
              </th>
              <th scope="col" title={t("Points")}>
                {t("Pts")}
              </th>
            </tr>
          </thead>
          <tbody ref={body}>
            {group.rows.map((r: TableRow, i) => {
              const id = String(r.team.id);
              const lc = live?.get(id);
              const mv = moves?.get(id) ?? 0;
              return (
                <tr
                  key={id}
                  data-id={id}
                  className={`${highlight.includes(id) ? "hl" : ""}${lc ? " is-live" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}
                  onClick={() => nav(`/team/${league}/${id}`)}
                >
                  <td className="pos">
                    {r.note && <span className="zone" style={{ background: zoneColor(r.note.description) }} />}
                    <span className="tb-pos">
                      {r.rank}
                      {liveMode && mv !== 0 && <Move v={mv} vs={t("since kick-off")} key={`${id}${mv}`} />}
                    </span>
                  </td>
                  <td className="club">
                    <span className="inner">
                      <Crest src={r.team.logo} size={26} alt="" />
                      <Link to={`/team/${league}/${id}`} className="tb-name" onClick={(e) => e.stopPropagation()}>
                        {r.team.name}
                      </Link>
                      {lc && (
                        <Link
                          to={`/match/${league}/${lc.matchId}`}
                          className={`tb-livechip ${lc.result}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("Live: {score} against {opp}, {clock}", { score: lc.score, opp: lc.opponent.name, clock: lc.clock })}
                        >
                          <span className="tb-livedot" aria-hidden />
                          <span className="num">{lc.score}</span>
                          <Crest src={lc.opponent.logo} size={14} alt="" />
                          <span className="tb-clock">{lc.clock}</span>
                        </Link>
                      )}
                    </span>
                  </td>
                  <td>{r.gp}</td>
                  <td className="hide-sm">{r.w}</td>
                  <td className="hide-sm">{r.d}</td>
                  <td className="hide-sm">{r.l}</td>
                  {!compact && <td className="hide-sm">{r.gf}</td>}
                  {!compact && <td className="hide-sm">{r.ga}</td>}
                  <td className={r.gd > 0 ? "gd-pos" : r.gd < 0 ? "gd-neg" : ""}>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td className="pts">{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {zones.size > 0 && (
        <div className="zones">
          {[...zones.entries()].map(([d, c]) => (
            <span key={d}>
              <i style={{ background: c }} />
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------- computed table ---- */

/**
 * A table computed from the season dataset (form / home / away). `moves`
 * compares each club's rank here with its rank in the real table.
 */
export function ComputedTable({
  rows,
  teams,
  league,
  title,
  moves,
  showForm,
  formMax = 5,
  compact,
  footer,
}: {
  rows: Row[];
  teams: Map<string, TeamLite>;
  league: string;
  title?: string;
  moves?: Map<string, number>;
  showForm?: boolean;
  formMax?: number;
  compact?: boolean;
  footer?: ReactNode;
}) {
  const nav = useNavigate();
  const body = useRowFlip(rows.map((r) => r.team).join(","));
  return (
    <div className="table-card glass">
      {title && <div className="tb-title">{title}</div>}
      <div className="table-scroll">
        <table className="standings">
          {title && <caption className="sr-only">{title}</caption>}
          <thead>
            <tr>
              <th scope="col">#</th>
              {moves && (
                <th scope="col" className="tb-movecol" title={t("Places above (▲) or below (▼) the real table")}>
                  <span className="sr-only">{t("Versus the table")}</span>±
                </th>
              )}
              <th scope="col" className="club">
                {t("Club")}
              </th>
              <th scope="col" title={t("Played")}>
                {t("P")}
              </th>
              {!compact && (
                <>
                  <th scope="col" className="hide-sm" title={t("Won")}>
                    {t("W")}
                  </th>
                  <th scope="col" className="hide-sm" title={t("Drawn")}>
                    {t("D")}
                  </th>
                  <th scope="col" className="hide-sm" title={t("Lost")}>
                    {t("L")}
                  </th>
                  <th scope="col" className="hide-sm" title={t("Goals for")}>
                    {t("GF")}
                  </th>
                  <th scope="col" className="hide-sm" title={t("Goals against")}>
                    {t("GA")}
                  </th>
                </>
              )}
              <th scope="col" title={t("Goal difference")}>
                {t("GD")}
              </th>
              <th scope="col" title={t("Points")}>
                {t("Pts")}
              </th>
              {showForm && (
                <th scope="col" className="hide-sm tb-formcol">
                  {t("Form")}
                </th>
              )}
            </tr>
          </thead>
          <tbody ref={body}>
            {rows.map((r, i) => {
              const tm = teams.get(r.team);
              return (
                <tr key={r.team} data-id={r.team} style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }} onClick={() => nav(`/team/${league}/${r.team}`)}>
                  <td className="pos">{r.rank}</td>
                  {moves && (
                    <td className="tb-movecell">
                      <Move v={moves.get(r.team) ?? 0} vs={t("vs the table")} />
                    </td>
                  )}
                  <td className="club">
                    <span className="inner">
                      <Crest src={tm?.logo} size={26} alt="" />
                      <Link to={`/team/${league}/${r.team}`} className="tb-name" onClick={(e) => e.stopPropagation()}>
                        {compact ? tm?.short ?? r.team : tm?.name ?? r.team}
                      </Link>
                    </span>
                  </td>
                  <td>{r.gp}</td>
                  {!compact && (
                    <>
                      <td className="hide-sm">{r.w}</td>
                      <td className="hide-sm">{r.d}</td>
                      <td className="hide-sm">{r.l}</td>
                      <td className="hide-sm">{r.gf}</td>
                      <td className="hide-sm">{r.ga}</td>
                    </>
                  )}
                  <td className={r.gd > 0 ? "gd-pos" : r.gd < 0 ? "gd-neg" : ""}>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td className="pts">{r.pts}</td>
                  {showForm && (
                    <td className="hide-sm tb-formcell">
                      <FormDots form={r.form} max={formMax} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

/* -------------------------------------------------------------- xG ------ */

export interface XgLine {
  team: string;
  games: number;
  xgf: number;
  xga: number;
  gf: number;
  ga: number;
}

/** Expected-goals table: created, allowed, difference — and how finishing compares. */
export function XgTable({ rows, teams, league, title }: { rows: XgLine[]; teams: Map<string, TeamLite>; league: string; title?: string }) {
  const nav = useNavigate();
  const sorted = [...rows].sort((a, b) => b.xgf - b.xga - (a.xgf - a.xga) || b.xgf - a.xgf);
  const body = useRowFlip(sorted.map((r) => r.team).join(","));
  const sign = (v: number, d = 1) => (v > 0.05 ? `+${fmtNum(v, d)}` : v < -0.05 ? `−${fmtNum(-v, d)}` : fmtNum(0, d));
  return (
    <div className="table-card glass">
      {title && <div className="tb-title">{title}</div>}
      <div className="table-scroll">
        <table className="standings tb-xg">
          {title && <caption className="sr-only">{title}</caption>}
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="club">
                {t("Club")}
              </th>
              <th scope="col" title={t("Matches with xG data")}>
                {t("P")}
              </th>
              <th scope="col" title={t("Expected goals for")}>
                {t("xGF")}
              </th>
              <th scope="col" title={t("Expected goals against")}>
                {t("xGA")}
              </th>
              <th scope="col" title={t("Expected goal difference")}>
                {t("xGD")}
              </th>
              <th scope="col" className="hide-sm" title={t("Expected goal difference per game")}>
                {t("xGD/G")}
              </th>
              <th scope="col" className="hide-sm" title={t("Actual goal difference in the same matches")}>
                {t("GD")}
              </th>
              <th scope="col" className="hide-sm" title={t("Goals scored minus expected goals")}>
                {t("G−xG")}
              </th>
            </tr>
          </thead>
          <tbody ref={body}>
            {sorted.map((r, i) => {
              const tm = teams.get(r.team);
              const xgd = r.xgf - r.xga;
              const gd = r.gf - r.ga;
              return (
                <tr key={r.team} data-id={r.team} style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }} onClick={() => nav(`/team/${league}/${r.team}`)}>
                  <td className="pos">{i + 1}</td>
                  <td className="club">
                    <span className="inner">
                      <Crest src={tm?.logo} size={26} alt="" />
                      <Link to={`/team/${league}/${r.team}`} className="tb-name" onClick={(e) => e.stopPropagation()}>
                        {tm?.name ?? r.team}
                      </Link>
                    </span>
                  </td>
                  <td>{r.games}</td>
                  <td>{fmtNum(r.xgf, 1)}</td>
                  <td>{fmtNum(r.xga, 1)}</td>
                  <td className={`pts ${xgd > 0.05 ? "gd-pos" : xgd < -0.05 ? "gd-neg" : ""}`}>{sign(xgd)}</td>
                  <td className="hide-sm">{r.games ? sign(xgd / r.games, 2) : "–"}</td>
                  <td className="hide-sm">{gd > 0 ? `+${gd}` : gd < 0 ? `−${-gd}` : 0}</td>
                  <td className="hide-sm">{sign(r.gf - r.xgf)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
