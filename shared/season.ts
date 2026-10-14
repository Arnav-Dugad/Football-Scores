/* Compact season dataset served by the LeagueStore Durable Object.
   Short keys keep the payload small; the client expands what it needs. */

export interface SeasonTeam {
  id: string;
  n: string; // display name
  s: string; // short name
  ab: string; // abbreviation
  l: string; // logo url
  c: string | null; // primary colour (#hex)
}

export interface SeasonMatch {
  id: string;
  d: string; // ISO kick-off
  s: "pre" | "in" | "post";
  st: string; // ESPN status name e.g. STATUS_FULL_TIME, STATUS_POSTPONED
  h: string; // home team id
  a: string; // away team id
  hs: number | null;
  as: number | null;
  hp: number | null; // shoot-out
  ap: number | null;
  v: string; // venue
  ref: string | null;
  att: number | null;
  hx: number | null; // xG (Pitch model) — null until details are synced
  ax: number | null;
  hsh: number | null; // shots
  ash: number | null;
  det: 0 | 1; // details (summary) synced
}

export type EventKind = "g" | "og" | "pg" | "y" | "r" | "yr";

export interface SeasonEvent {
  m: string; // match id
  k: EventKind;
  t: string; // team id credited (for og: the team that benefited)
  min: number;
  p: string; // player name
  pid: string | null;
  as: string | null; // assist name
  aid: string | null;
}

export interface SeasonInfo {
  year: number;
  name: string;
  start: string;
  end: string;
}

export interface SeasonData {
  league: string;
  season: SeasonInfo | null;
  teams: SeasonTeam[];
  matches: SeasonMatch[];
  events: SeasonEvent[];
  /** Previous-season points per game, used to seed ratings. */
  seed: Record<string, number>;
  progress: { dates: number; datesDone: number; details: number; detailsDone: number };
  updated: number;
}

export interface PersonRow {
  id: string;
  n: string;
  t: string; // team id
  pos: string; // G / D / M / F
  posName: string;
  age: number | null;
  dob: string | null;
  nat: string;
  flag: string;
  j: string; // shirt number
  inj: string | null; // injury status text
  apps: number;
  starts: number;
  g: number;
  a: number;
  sh: number;
  sot: number;
  xg: number;
  y: number;
  r: number;
  /** Most frequent starting position code from lineups (e.g. CD-L). */
  lpos: string | null;
}

export interface PeopleData {
  league: string;
  players: PersonRow[];
  updated: number;
}

/** Shot row for player/team shot maps (season level). */
export interface SeasonShot {
  m: string;
  t: string; // team id
  p: string; // player name
  x: number;
  y: number;
  o: "goal" | "saved" | "missed" | "blocked" | "woodwork";
  b: "right" | "left" | "head" | "other";
  xg: number;
  min: string;
}
