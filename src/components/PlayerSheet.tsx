import { endpoints } from "../lib/api";
import { age, initials, teamTint } from "../lib/format";
import { useApi, usePlayer } from "../lib/hooks";
import { Crest, Sheet, tsdbSize } from "./ui";

export interface PlayerRef {
  name: string;
  id?: string;
  jersey?: string;
  position?: string;
  league?: string;
  team: { name: string; logo?: string; color?: string | null };
  nationality?: string;
  flag?: string;
  dob?: string;
  height?: string;
}

const COLS: { name: string; label: string }[] = [
  { name: "starts", label: "Starts" },
  { name: "totalGoals", label: "G" },
  { name: "goalAssists", label: "A" },
  { name: "totalShots", label: "Sh" },
  { name: "yellowCards", label: "YC" },
];

export function PlayerSheet({ p, onClose }: { p: PlayerRef; onClose: () => void }) {
  const { info, done } = usePlayer(p.name, p.team.name, { full: true });
  const overview = useApi<any>(p.id && p.league ? endpoints.athlete(p.league, p.id) : null);
  const color = teamTint(p.team.color, "#5e5ce6");

  const cut = tsdbSize(info?.cutout, "medium");
  const photo = !cut ? tsdbSize(info?.photo, "medium") : null;
  const yrs = age(p.dob || info?.born);
  const nat = p.nationality || info?.nationality;
  const num = p.jersey || info?.number;

  const st = overview.data?.statistics;
  const names: string[] = st?.names ?? [];
  const splits: any[] = st?.splits ?? [];
  const idx = COLS.map((c) => names.indexOf(c.name));

  const bio = info?.bio ? info.bio.split(/(?<=\.)\s+/).slice(0, 3).join(" ") : null;

  return (
    <Sheet onClose={onClose} label={p.name}>
      <div className="ps-hero">
        <div
          className="bg"
          style={{
            background: `radial-gradient(90% 90% at 80% 20%, color-mix(in srgb, ${color} 60%, white 10%), ${color} 55%, color-mix(in srgb, ${color} 55%, black))`,
          }}
        />
        {num && <span className="num-bg">{num}</span>}
        {cut ? (
          <img className="cut" src={cut} alt={p.name} />
        ) : photo ? (
          <img className="ph" src={photo} alt={p.name} />
        ) : done ? (
          <span className="num-bg" style={{ top: "auto", bottom: 10, fontSize: 120, color: "rgba(255,255,255,.25)" }}>
            {initials(p.name)}
          </span>
        ) : null}
        <div className="who">
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, textTransform: "uppercase", letterSpacing: ".04em" }}>
            {p.position || info?.position || "Player"}
          </div>
          <h2>{p.name}</h2>
          <div className="tm">
            {p.team.logo && (
              <span style={{ background: "rgba(255,255,255,.9)", borderRadius: 8, padding: 3, display: "grid" }}>
                <Crest src={p.team.logo} size={18} alt={p.team.name} />
              </span>
            )}
            {p.team.name}
          </div>
        </div>
      </div>
      <div className="ps-body">
        <div className="facts-grid">
          <Fact k="Age" v={yrs != null ? String(yrs) : "—"} />
          <Fact
            k="Nation"
            v={
              <>
                {p.flag && <img className="flag" src={p.flag} alt="" />}
                {nat || "—"}
              </>
            }
          />
          <Fact k="Shirt" v={num ? `#${num}` : "—"} />
          <Fact k="Height" v={p.height || info?.height?.split("(")[0]?.trim() || "—"} />
          <Fact k="Position" v={p.position || info?.position || "—"} />
          <Fact k="Born" v={(p.dob || info?.born) ? new Date((p.dob || info?.born)!).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"} />
        </div>

        {splits.length > 0 && idx.some((i) => i >= 0) && (
          <>
            <p className="panel-title" style={{ marginTop: 22, marginBottom: 4 }}>
              This season
            </p>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Competition</th>
                  {COLS.map((c, i) => (idx[i] >= 0 ? <th key={c.name}>{c.label}</th> : null))}
                </tr>
              </thead>
              <tbody>
                {splits.slice(0, 6).map((s) => (
                  <tr key={s.displayName}>
                    <td title={s.displayName}>{String(s.displayName).replace(/^\d{4}(-\d{2})?\s+/, "")}</td>
                    {COLS.map((c, i) => (idx[i] >= 0 ? <td key={c.name}>{s.stats?.[idx[i]] ?? "–"}</td> : null))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {bio && <p className="bio">{bio}</p>}
        {info?.source && (
          <p className="subtle" style={{ fontSize: 11.5, marginTop: 14 }}>
            Photo via {info.source === "thesportsdb" ? "TheSportsDB" : "Wikimedia Commons"}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fact">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
