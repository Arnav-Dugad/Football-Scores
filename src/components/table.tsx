import { useNavigate } from "react-router-dom";
import type { TableGroup, TableRow } from "../lib/api";
import { Crest } from "./ui";

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

export function StandingsTable({
  group,
  league,
  highlight = [],
  compact,
  showTitle,
}: {
  group: TableGroup;
  league: string;
  highlight?: string[];
  compact?: boolean;
  showTitle?: boolean;
}) {
  const nav = useNavigate();
  const zones = new Map<string, string>();
  for (const r of group.rows) if (r.note?.description) zones.set(r.note.description, zoneColor(r.note.description));

  return (
    <div className="table-card glass">
      {showTitle && group.name && (
        <div style={{ padding: "16px 18px 0", fontWeight: 650, fontSize: 15 }}>{group.name}</div>
      )}
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th className="club">Club</th>
              <th>P</th>
              <th className="hide-sm">W</th>
              <th className="hide-sm">D</th>
              <th className="hide-sm">L</th>
              {!compact && <th className="hide-sm">GF</th>}
              {!compact && <th className="hide-sm">GA</th>}
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r: TableRow, i) => (
              <tr
                key={r.team.id}
                className={highlight.includes(r.team.id) ? "hl" : ""}
                style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}
                onClick={() => nav(`/team/${league}/${r.team.id}`)}
              >
                <td className="pos">
                  {r.note && <span className="zone" style={{ background: zoneColor(r.note.description) }} />}
                  {r.rank}
                </td>
                <td className="club">
                  <span className="inner">
                    <Crest src={r.team.logo} size={26} alt={r.team.name} />
                    <span>{r.team.name}</span>
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
            ))}
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
