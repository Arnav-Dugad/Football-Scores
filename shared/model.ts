export const leagues = [
  {
    id: "en.1",
    name: "Premier League",
    country: "England",
    code: "PL",
    accent: "#ab8bfa",
  },
  {
    id: "es.1",
    name: "La Liga",
    country: "Spain",
    code: "PD",
    accent: "#ff907d",
  },
  {
    id: "de.1",
    name: "Bundesliga",
    country: "Germany",
    code: "BL1",
    accent: "#ff7688",
  },
  {
    id: "it.1",
    name: "Serie A",
    country: "Italy",
    code: "SA",
    accent: "#69a8ff",
  },
  {
    id: "fr.1",
    name: "Ligue 1",
    country: "France",
    code: "FL1",
    accent: "#76dac2",
  },
] as const;
export const seasons = ["2026-27", "2025-26", "2024-25"] as const;
export type LeagueId = (typeof leagues)[number]["id"];
export type Team = { id: string; name: string };
export type Match = {
  id: string;
  date: string;
  kickoff: string | null;
  round: string;
  home: Team;
  away: Team;
  score: [number, number] | null;
  half: [number, number] | null;
  status:
    | "finished"
    | "scheduled"
    | "unconfirmed"
    | "in-play"
    | "paused"
    | "postponed"
    | "cancelled";
  venue?: string;
};
export type Standing = {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: string[];
  position: number;
};
export type Dataset = {
  league: LeagueId;
  season: string;
  matches: Match[];
  standings: Standing[];
  meta: {
    source: string;
    sourceUrl: string;
    fetchedAt: string;
    sourceUpdatedAt: string | null;
    latestResult: string | null;
    mode: "community" | "delayed";
    stale: boolean;
    notice: string;
    officialStandings: boolean;
  };
};
export function teamId(name: string) {
  return encodeURIComponent(
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
  );
}
export function shortName(name: string) {
  return name.replace(/\s(FC|CF|AFC)$/, "").replace(/^FC\s/, "");
}
export function initials(name: string) {
  return shortName(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}
export function deriveStandings(matches: Match[]): Standing[] {
  const rows = new Map<string, Standing>();
  for (const m of [...matches].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    for (const team of [m.home, m.away])
      if (!rows.has(team.id))
        rows.set(team.id, {
          team,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          points: 0,
          form: [],
          position: 0,
        });
    if (m.status !== "finished" || !m.score) continue;
    [m.home, m.away].forEach((team, i) => {
      const r = rows.get(team.id)!;
      const gf = m.score![i],
        ga = m.score![1 - i];
      r.played++;
      r.gf += gf;
      r.ga += ga;
      r.gd = r.gf - r.ga;
      const f = gf > ga ? "W" : gf === ga ? "D" : "L";
      r.form = [...r.form, f].slice(-5);
      if (f === "W") {
        r.won++;
        r.points += 3;
      } else if (f === "D") {
        r.drawn++;
        r.points++;
      } else r.lost++;
    });
  }
  return [...rows.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.name.localeCompare(b.team.name),
    )
    .map((r, i) => ({ ...r, position: i + 1 }));
}
export function matchDate(m: Match) {
  if (!m.kickoff) return m.date;
  const d = new Date(m.kickoff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function outcomes(matches: Match[], team: string) {
  return matches
    .filter((m) => m.score && (m.home.id === team || m.away.id === team))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => {
      const h = m.home.id === team;
      const gf = m.score![h ? 0 : 1],
        ga = m.score![h ? 1 : 0];
      return {
        date: m.date,
        gf,
        ga,
        points: gf > ga ? 3 : gf === ga ? 1 : 0,
        home: h,
        match: m,
      };
    });
}
