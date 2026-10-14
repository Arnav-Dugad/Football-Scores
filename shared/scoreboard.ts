import { fixText } from "./text";

/* Normalised scoreboard match — the wire format for /api/scores and live patches. */

export interface WireSide {
  id: string;
  name: string;
  short: string;
  abbr: string;
  logo: string;
  color: string | null;
  altColor: string | null;
  score: number | null;
  shootout: number | null;
  winner: boolean;
  form: string;
  record: string;
}

export interface WireDetail {
  kind: "goal" | "yellow" | "red";
  clock: string;
  teamId: string;
  player: string;
  penalty: boolean;
  ownGoal: boolean;
}

export interface WireBroadcast {
  name: string;
  region: string;
  type: string;
}

export interface WireMatch {
  id: string;
  league: { slug: string; name: string; abbr: string; logo: string };
  date: string;
  state: "pre" | "in" | "post";
  completed: boolean;
  status: string;
  statusName: string;
  clock: string;
  period: number;
  venue: string;
  city: string;
  note: string;
  home: WireSide;
  away: WireSide;
  details: WireDetail[];
  broadcasts: WireBroadcast[];
}

export function normaliseEvent(e: any, league: any, slug: string): WireMatch {
  const comp = e.competitions?.[0] ?? {};
  const st = e.status ?? comp.status ?? {};
  const state = (st.type?.state ?? "pre") as WireMatch["state"];
  const side = (c: any): WireSide => {
    const t = c?.team ?? {};
    return {
      id: String(t.id ?? ""),
      name: fixText(t.displayName),
      short: fixText(t.shortDisplayName || t.displayName),
      abbr: t.abbreviation ?? "",
      logo: t.logo || t.logos?.[0]?.href || "",
      color: t.color ? `#${t.color}` : null,
      altColor: t.alternateColor ? `#${t.alternateColor}` : null,
      score: c?.score === undefined || c?.score === "" || state === "pre" ? null : Number(c.score),
      shootout: c?.shootoutScore ?? null,
      winner: !!c?.winner,
      form: c?.form || "",
      record: c?.records?.[0]?.summary || "",
    };
  };
  const competitors = comp.competitors ?? [];
  const home = competitors.find((c: any) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c: any) => c.homeAway === "away") ?? competitors[1];

  const details: WireDetail[] = (comp.details ?? [])
    .map((d: any) => ({
      kind: d.scoringPlay ? "goal" : d.redCard ? "red" : d.yellowCard ? "yellow" : "other",
      clock: d.clock?.displayValue ?? "",
      teamId: String(d.team?.id ?? ""),
      player: fixText(d.athletesInvolved?.[0]?.displayName),
      penalty: !!d.penaltyKick,
      ownGoal: !!d.ownGoal,
    }))
    .filter((d: any) => d.kind !== "other");

  const broadcasts: WireBroadcast[] = [];
  for (const b of comp.geoBroadcasts ?? []) {
    const name = b.media?.shortName || b.media?.name;
    if (name) broadcasts.push({ name, region: String(b.region || "us").toLowerCase(), type: b.type?.shortName ?? "" });
  }

  return {
    id: String(e.id),
    league: {
      slug,
      name: league?.name ?? slug,
      abbr: league?.abbreviation ?? "",
      logo: league?.logos?.[0]?.href ?? "",
    },
    date: e.date,
    state,
    completed: !!st.type?.completed,
    status: st.type?.shortDetail ?? "",
    statusName: st.type?.name ?? "",
    clock: st.displayClock ?? "",
    period: st.period ?? 0,
    venue: fixText(comp.venue?.fullName),
    city: fixText(comp.venue?.address?.city),
    note: fixText(comp.notes?.[0]?.headline || comp.altGameNote || ""),
    home: side(home),
    away: side(away),
    details,
    broadcasts,
  };
}

/** Minute number from an ESPN clock string: "45'+2'" → 45, "90'+4'" → 90, "67'" → 67. */
export function minuteOf(clock: string): number {
  const m = /(\d+)/.exec(clock ?? "");
  return m ? Number(m[1]) : 0;
}
