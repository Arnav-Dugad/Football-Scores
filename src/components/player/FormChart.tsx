import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { t, tn } from "../../i18n";
import { fmtDate, fmtDayShort, fmtNum } from "../../lib/format";
import { useDrawIn } from "../../lib/motion";
import { Crest } from "../ui";
import { ChartCard, ChartTip, TipRow, intTicks, useWidth } from "./chart";
import type { GameRow } from "./data";

/* Form: goals + assists in each of the last five matches (ESPN game log),
   with a participation strip (started / off the bench / unused). */

const H = 150;
const TOP = 22;
const BOTTOM = 10;

const roleLabel = (g: GameRow) =>
  g.role === "started" ? t("Started") : g.role === "sub" ? t("Off the bench") : g.role === "played" ? t("Played") : t("Unused");

const scoreLine = (g: GameRow) => (g.us != null && g.them != null ? `${g.us}–${g.them}` : "");

const validDate = (d: string) => !Number.isNaN(Date.parse(d));

/** `keeper` plots goals conceded per match instead of goal involvements. */
export function FormChart({ games, keeper = false }: { games: GameRow[]; keeper?: boolean }) {
  const [box, w] = useWidth<HTMLDivElement>(520);
  const [drawRef, drawn] = useDrawIn<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const n = games.length;

  if (!n) {
    return (
      <ChartCard title={t("Form")} subtitle={keeper ? t("Goals conceded, recent matches") : t("Goals and assists, recent matches")}>
        <p className="pl-empty-line">{t("No recent matches to show.")}</p>
      </ChartCard>
    );
  }

  const vals = games.map((g) => (keeper ? g.them ?? 0 : g.g + g.a));
  const oppLabel = (g: GameRow) => (g.home ? t("vs {team}", { team: g.opponent.name }) : t("at {team}", { team: g.opponent.name }));
  const max = Math.max(...vals);
  const ticks = intTicks(Math.max(2, max));
  const top = ticks[ticks.length - 1];
  const x = (i: number) => ((i + 0.5) / n) * w;
  const y = (v: number) => TOP + (1 - v / top) * (H - TOP - BOTTOM);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const maxIdx = max > 0 ? vals.indexOf(max) : -1;
  const hg = hover != null ? games[hover] : null;

  const table = (
    <table className="pl-table compact">
      <thead>
        <tr>
          <th scope="col">{t("Date")}</th>
          <th scope="col">{t("Opponent")}</th>
          <th scope="col">{t("Result")}</th>
          <th scope="col">{t("Role")}</th>
          {keeper ? (
            <th scope="col">{t("Conceded")}</th>
          ) : (
            <>
              <th scope="col">
                <abbr title={t("Goals")}>{t("G")}</abbr>
              </th>
              <th scope="col">
                <abbr title={t("Assists")}>{t("A")}</abbr>
              </th>
              <th scope="col">
                <abbr title={t("Shots")}>{t("Sh")}</abbr>
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {[...games].reverse().map((g) => (
          <tr key={g.id}>
            <td>{validDate(g.date) ? fmtDate(g.date) : "–"}</td>
            <th scope="row">
              <Link to={`/match/${g.slug}/${g.id}`} className="pl-tlink">
                {oppLabel(g)}
              </Link>
            </th>
            <td>{[g.result ? t(g.result) : "", scoreLine(g)].filter(Boolean).join(" ") || "–"}</td>
            <td>{roleLabel(g)}</td>
            {keeper ? (
              <td className="num">{g.them == null ? "–" : fmtNum(g.them)}</td>
            ) : (
              <>
                <td className="num">{fmtNum(g.g)}</td>
                <td className="num">{fmtNum(g.a)}</td>
                <td className="num">{g.sh == null ? "–" : fmtNum(g.sh)}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title={t("Form")}
      subtitle={
        keeper
          ? tn(n, "Goals conceded, last match", "Goals conceded, last {n} matches")
          : tn(n, "Goal involvements, last match", "Goal involvements (goals + assists), last {n} matches")
      }
      table={table}
    >
      {/* Chart and strip share one LTR column grid (time runs left → right in every language). */}
      <div ref={drawRef} dir="ltr">
        <div className="chart pl-form" ref={box} onPointerLeave={() => setHover(null)}>
          <svg
            viewBox={`0 0 ${w} ${H}`}
            width={w}
            height={H}
            role="img"
            aria-label={t(keeper ? "Goals conceded per match: {list}" : "Goals plus assists per match: {list}", {
              list: games.map((g, i) => `${g.opponent.abbr || g.opponent.name} ${vals[i]}`).join(", "),
            })}
          >
            <defs>
              <linearGradient id={`${gid}-wash`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.16" />
                <stop offset="1" stopColor="var(--series-1)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line className={v === 0 ? "baseline" : "gridline"} x1={0} x2={w} y1={y(v)} y2={y(v)} />
                <text className="axis-label" x={2} y={y(v) - 5}>
                  {fmtNum(v)}
                </text>
              </g>
            ))}
            {hover != null && <line className="pl-crosshair" x1={x(hover)} x2={x(hover)} y1={TOP - 8} y2={y(0)} />}
            <path d={area} fill={`url(#${gid}-wash)`} className={`pl-wash${drawn ? " on" : ""}`} />
            <path d={line} className="pl-line" pathLength={1} style={{ strokeDashoffset: drawn ? 0 : 1 }} />
            {vals.map((v, i) => (
              <circle
                key={games[i].id}
                cx={x(i)}
                cy={y(v)}
                r={hover === i ? 6.5 : 5}
                className={`pl-dot${drawn ? " on" : ""}`}
                style={{ transitionDelay: `${300 + i * 90}ms` }}
              />
            ))}
            {maxIdx >= 0 && (
              <text className="pl-dlabel" x={x(maxIdx)} y={y(max) - 12} textAnchor="middle">
                {fmtNum(max)}
              </text>
            )}
            {games.map((g, i) => (
              <Link
                key={g.id}
                to={`/match/${g.slug}/${g.id}`}
                aria-label={
                  keeper
                    ? t("{opp}, {date}: conceded {c}. Open match", {
                        opp: oppLabel(g),
                        date: validDate(g.date) ? fmtDate(g.date) : "",
                        c: vals[i],
                      })
                    : t("{opp}, {date}: {g} goals, {a} assists. Open match", {
                        opp: oppLabel(g),
                        date: validDate(g.date) ? fmtDate(g.date) : "",
                        g: g.g,
                        a: g.a,
                      })
                }
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="pl-hit-link"
              >
                <rect x={(i / n) * w} y={0} width={w / n} height={H} className="pl-hit" />
              </Link>
            ))}
          </svg>
          {hg && hover != null && (
            <ChartTip x={(x(hover) / w) * 100} y={(y(vals[hover]) / H) * 100}>
              <div className="tt-head">
                <Crest src={hg.opponent.logo} size={18} alt="" />
                <span>{oppLabel(hg)}</span>
              </div>
              <div className="pl-tt-meta">
                {[validDate(hg.date) ? fmtDayShort(hg.date) : "", hg.league].filter(Boolean).join(" · ")}
              </div>
              {keeper ? (
                <TipRow
                  label={hg.them === 0 ? t("Clean sheet") : t("Conceded")}
                  value={fmtNum(vals[hover])}
                  color="var(--series-1)"
                />
              ) : (
                <>
                  <TipRow label={t("Goals")} value={fmtNum(hg.g)} color="var(--series-1)" />
                  <TipRow label={t("Assists")} value={fmtNum(hg.a)} />
                  {hg.sh != null && <TipRow label={t("Shots")} value={fmtNum(hg.sh)} />}
                </>
              )}
              <TipRow label={t("Result")} value={[hg.result ? t(hg.result) : "", scoreLine(hg)].filter(Boolean).join(" ") || "–"} />
            </ChartTip>
          )}
        </div>
        {/* Visual echo of the chart's links; the same facts are in the link labels and the data table. */}
        <ol className="pl-strip" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
          {games.map((g, i) => (
            <li key={g.id} className={hover === i ? "on" : undefined}>
              <Link
                to={`/match/${g.slug}/${g.id}`}
                className="pl-strip-cell"
                tabIndex={-1}
                aria-hidden
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              >
                <Crest src={g.opponent.logo} size={22} alt="" />
                <span className="pl-strip-res">
                  {g.result && <span className={`pl-res ${g.result}`}>{t(g.result)}</span>}
                  <span className="num">{scoreLine(g)}</span>
                </span>
                <span className={`pl-part ${g.role}`} />
                <span className="pl-strip-role">{roleLabel(g)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </ChartCard>
  );
}
