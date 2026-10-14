/* Match-centre data layer: everything derived from the raw ESPN summary that
   normaliseSummary (lib/api.ts) doesn't already cover. Pure functions only. */

import { extractShots, type Shot } from "../../../shared/xg";
import { fixText, type Match, type Side } from "../../lib/api";

export type SideKey = "home" | "away";

/* -------------------------------------------------------- team matching -- */

const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Commentary names a team by display name, which occasionally differs from the
 * header ("Deportivo" vs "Deportivo de A Coruña", "Paris Saint Germain" vs
 * "Paris Saint-Germain"). Match exact first, then by containment.
 */
export function teamMatcher(home: Side, away: Side) {
  const variants = (s: Side) => [s.name, s.short, s.abbr].map(norm).filter((v) => v.length > 1);
  const hv = variants(home);
  const av = variants(away);
  const cache = new Map<string, SideKey | null>();
  return (name: string | null | undefined): SideKey | null => {
    const n = norm(name);
    if (!n) return null;
    if (cache.has(n)) return cache.get(n)!;
    let r: SideKey | null = null;
    if (hv.includes(n)) r = "home";
    else if (av.includes(n)) r = "away";
    else {
      const loose = (vs: string[]) => vs.some((v) => v.length >= 4 && n.length >= 4 && (v.includes(n) || n.includes(v)));
      const h = loose(hv);
      const a = loose(av);
      r = h && !a ? "home" : a && !h ? "away" : null;
    }
    cache.set(n, r);
    return r;
  };
}

/* ---------------------------------------------------------- clock ------ */

/** "45'+2'" → { min: 45, added: 2 }, "67'" → { min: 67, added: 0 }. */
export function parseClock(s: string | null | undefined): { min: number; added: number } | null {
  const m = /(\d+)'?(?:\s*\+\s*(\d+))?/.exec(String(s ?? ""));
  if (!m) return null;
  return { min: Number(m[1]), added: m[2] ? Number(m[2]) : 0 };
}

/** Compact minute label: 45+2' */
export function minuteLabel(min: number, added: number): string {
  return added > 0 ? `${min}+${added}'` : `${min}'`;
}

/* ----------------------------------------------------------- periods ---- */

export const PERIOD_START = [0, 0, 45, 90, 105];
export const PERIOD_LEN = [0, 45, 45, 15, 15];

/* ------------------------------------------------------------ plays ----- */

export type PlayKind =
  | "goal"
  | "owngoal"
  | "penGoal"
  | "penMiss"
  | "saved"
  | "missed"
  | "blocked"
  | "woodwork"
  | "corner"
  | "foul"
  | "handball"
  | "offside"
  | "yellow"
  | "red"
  | "sub"
  | "var"
  | "start"
  | "end"
  | "delay"
  | "added"
  | "info";

export const GOAL_KINDS: PlayKind[] = ["goal", "owngoal", "penGoal"];
export const SHOT_KINDS: PlayKind[] = ["goal", "owngoal", "penGoal", "penMiss", "saved", "missed", "blocked", "woodwork"];
export const KEY_KINDS: PlayKind[] = ["goal", "owngoal", "penGoal", "penMiss", "yellow", "red", "sub", "var", "woodwork"];

export interface Play {
  key: string;
  seq: number;
  kind: PlayKind;
  text: string;
  extra: string | null;
  min: number;
  added: number;
  hasClock: boolean;
  period: number;
  side: SideKey | null;
  /** Location relative to `side` attacking towards x = 100. */
  x: number | null;
  y: number | null;
  gy: number | null;
  player: string | null;
  shootout: boolean;
}

function kindFromType(type: string, text: string): PlayKind | null {
  const t = type.toLowerCase();
  if (!t) return null;
  if (t === "own-goal") return "owngoal";
  if (t === "penalty---scored") return "penGoal";
  if (/^penalty---(missed|saved)/.test(t)) return "penMiss";
  if (/^goal/.test(t)) return /own goal/i.test(text) ? "owngoal" : "goal";
  if (t === "shot-on-target") return "saved";
  if (t === "shot-off-target") return "missed";
  if (t === "shot-blocked") return "blocked";
  if (t === "shot-hit-woodwork") return "woodwork";
  if (t === "corner-awarded") return "corner";
  if (t === "foul" || ((t === "pass" || t === "take-on") && /free kick|foul/i.test(text))) return "foul";
  if (t === "handball") return "handball";
  if (t === "offside") return "offside";
  if (t === "yellow-card") return "yellow";
  if (t === "red-card") return "red";
  if (t === "substitution") return "sub";
  if (/^var|deleted-after-review/.test(t)) return "var";
  if (/^(kickoff|start-2nd-half|start-extra-time|start-2nd-half-extra-time|start-shootout)$/.test(t)) return "start";
  if (/^(halftime|end-regular-time|halftime-extra-time|end-extra-time|end-match)$/.test(t)) return "end";
  if (/delay/.test(t)) return "delay";
  return null;
}

function kindFromText(text: string): PlayKind {
  if (/^own goal/i.test(text)) return "owngoal";
  if (/^goal!/i.test(text)) return /converts the penalty/i.test(text) ? "penGoal" : /own goal/i.test(text) ? "owngoal" : "goal";
  if (/^penalty (saved|missed)/i.test(text)) return "penMiss";
  if (/^attempt saved/i.test(text)) return "saved";
  if (/^attempt missed/i.test(text)) return "missed";
  if (/^attempt blocked/i.test(text)) return "blocked";
  if (/hits the (bar|post|left post|right post|crossbar)/i.test(text)) return "woodwork";
  if (/^corner,/i.test(text)) return "corner";
  if (/^foul by|wins a free kick/i.test(text)) return "foul";
  if (/^handball/i.test(text)) return "handball";
  if (/^offside/i.test(text)) return "offside";
  if (/second yellow|red card/i.test(text)) return "red";
  if (/yellow card/i.test(text)) return "yellow";
  if (/^substitution/i.test(text)) return "sub";
  if (/^var\b/i.test(text)) return "var";
  if (/(half|extra time) begins|shootout begins/i.test(text)) return "start";
  if (/(half|extra time) ends|match ends|shootout ends/i.test(text)) return "end";
  if (/fourth official has announced/i.test(text)) return "added";
  if (/^delay/i.test(text)) return "delay";
  return "info";
}

/** First "(Team)" mention in a commentary sentence, or "Corner, Team." / "Offside, Team." */
function teamFromText(text: string): string | null {
  const lead = /^(?:corner|offside|substitution),\s*([^.]+)\./i.exec(text);
  if (lead) return lead[1];
  const paren = /\(([^)]+)\)/.exec(text);
  return paren ? paren[1] : null;
}

/**
 * Current ESPN feeds place plays on a 0–100 grid; older matches use a 0–1
 * scale with a different origin. Only trust locations on the 0–100 grid.
 */
export function hasPitchGrid(raw: any): boolean {
  for (const c of raw?.commentary ?? []) {
    const p = c?.play;
    if (!p || Number(p.period?.number ?? 0) >= 5) continue;
    if (typeof p.fieldPositionX === "number" && p.fieldPositionX > 1.5) return true;
  }
  return false;
}

/** A foul's team is the offender, so lead with "Foul by …" and keep "… wins a free kick" second. */
function leadWithFoul(p: Play) {
  if ((p.kind !== "foul" && p.kind !== "handball") || !p.extra || /^(foul|handball) by/i.test(p.text)) return;
  if (/^(foul|handball) by/i.test(p.extra)) [p.text, p.extra] = [p.extra, p.text];
}

export function parsePlays(raw: any, home: Side, away: Side): Play[] {
  const match = teamMatcher(home, away);
  const grid = hasPitchGrid(raw);
  const out: Play[] = [];
  const byId = new Map<string, Play>();
  const list: any[] = Array.isArray(raw?.commentary) ? [...raw.commentary] : [];
  list.sort((a, b) => Number(a?.sequence ?? 0) - Number(b?.sequence ?? 0));
  let period = 1;
  let i = 0;
  for (const c of list) {
    i++;
    const p = c?.play;
    const text = fixText(String(c?.text ?? p?.text ?? "")).trim();
    if (!text) continue;
    const id = p?.id ? String(p.id) : null;
    if (id && byId.has(id)) {
      const prev = byId.get(id)!;
      if (text !== prev.text && text !== prev.extra) prev.extra = prev.extra ? `${prev.extra} ${text}` : text;
      leadWithFoul(prev);
      continue;
    }
    if (typeof p?.period?.number === "number" && p.period.number > 0) period = p.period.number;
    const clock = parseClock(p?.clock?.displayValue || c?.time?.displayValue);
    const kind = (p ? kindFromType(String(p.type?.type ?? ""), String(p.text ?? text)) : null) ?? kindFromText(text);
    const side = match(p?.team?.displayName) ?? (kind === "info" || kind === "added" || kind === "start" || kind === "end" ? null : match(teamFromText(text)));
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const located = grid && num(p?.fieldPositionX) !== null && num(p?.fieldPositionY) !== null;
    // The play text ("Foul by X") is the canonical line; the commentary text may
    // be its mirror ("Y wins a free kick") — keep both, play text first.
    const playText = p?.text ? fixText(String(p.text)).trim() : "";
    const primary = playText || text;
    const play: Play = {
      key: id ?? `c${c?.sequence ?? i}`,
      seq: Number(c?.sequence ?? i),
      kind,
      text: primary,
      extra: playText && playText !== text ? text : null,
      min: clock?.min ?? 0,
      added: clock?.added ?? 0,
      hasClock: !!clock,
      period,
      side,
      x: located ? p.fieldPositionX : null,
      y: located ? p.fieldPositionY : null,
      gy: num(p?.goalPositionY),
      player: p?.participants?.[0]?.athlete?.displayName ? fixText(p.participants[0].athlete.displayName) : null,
      shootout: period === 5 || !!p?.shootout,
    };
    // Shoot-out locations are normalised differently and aren't pitch positions;
    // (0, 0) is ESPN's "unknown".
    if (play.shootout || (located && p.fieldPositionX === 0 && p.fieldPositionY === 0)) {
      play.x = null;
      play.y = null;
    }
    leadWithFoul(play);
    if (id) byId.set(id, play);
    out.push(play);
  }
  return out;
}

/* ------------------------------------------------------------ shots ----- */

/** Pitch xG shots, with team names reconciled and shoot-out kicks excluded. */
export function parseShots(raw: any, home: Side, away: Side): Shot[] {
  if (!hasPitchGrid(raw)) return [];
  const match = teamMatcher(home, away);
  const commentary = (Array.isArray(raw?.commentary) ? raw.commentary : [])
    .filter((c: any) => c?.play && Number(c.play.period?.number ?? 0) < 5 && !c.play.shootout)
    .map((c: any) => {
      const side = match(c.play.team?.displayName);
      if (!side) return c;
      return { ...c, play: { ...c.play, team: { ...c.play.team, displayName: side === "home" ? home.name : away.name } } };
    });
  try {
    return extractShots(commentary, home.name, away.name).filter((s) => Number.isFinite(s.xg) && s.x > 1);
  } catch {
    return [];
  }
}

/** Approximate shot height on the goal frame (0 = ground, 1 = bar), from the commentary wording. */
export function shotHeight(text: string): number {
  if (/top (left|right) corner|high centre|top centre|top of the goal/i.test(text)) return 0.8;
  if (/bottom (left|right) corner|low centre|bottom centre/i.test(text)) return 0.2;
  return 0.48;
}

/* -------------------------------------------------------------- odds ---- */

export interface Odds {
  h: number;
  d: number;
  a: number;
  provider: string;
}

export function parseOdds(raw: any): { home: number; draw: number; away: number; provider: string } | null {
  const lists = [raw?.pickcenter, raw?.odds].filter(Array.isArray) as any[][];
  for (const list of lists) {
    for (const o of list) {
      const h = Number(o?.homeTeamOdds?.moneyLine);
      const a = Number(o?.awayTeamOdds?.moneyLine);
      const d = Number(o?.drawOdds?.moneyLine);
      if ([h, a, d].every((v) => Number.isFinite(v) && v !== 0)) {
        return { home: h, draw: d, away: a, provider: fixText(o?.provider?.name ?? "") };
      }
    }
  }
  return null;
}

/* ----------------------------------------------------------- referee ---- */

export function parseReferee(raw: any): string | null {
  const list: any[] = raw?.gameInfo?.officials ?? [];
  const ref =
    list.find((o) => /referee/i.test(o?.position?.name ?? "") && !/assistant|video|fourth/i.test(o?.position?.name ?? "")) ??
    list.find((o) => Number(o?.order) === 1) ??
    list[0];
  const name = fixText(ref?.displayName ?? ref?.fullName ?? "").trim();
  return name || null;
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && norm(a) === norm(b);
}

/* ----------------------------------------------------------- rosters ---- */

export interface RosterPlayer {
  id: string;
  name: string;
  jersey: string;
  pos: string;
  posName: string;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  side: SideKey;
  stats: Record<string, number>;
  /** Player this one replaced (when subbed in). */
  inFor: string | null;
  subMinute: string | null;
}

export function parseRosters(raw: any, home: Side, away: Side): Record<SideKey, RosterPlayer[]> {
  const out: Record<SideKey, RosterPlayer[]> = { home: [], away: [] };
  for (const r of raw?.rosters ?? []) {
    const id = String(r?.team?.id ?? "");
    const side: SideKey | null = id === home.id ? "home" : id === away.id ? "away" : r?.homeAway === "home" ? "home" : r?.homeAway === "away" ? "away" : null;
    if (!side) continue;
    for (const p of r?.roster ?? []) {
      if (!p?.athlete?.id) continue;
      const stats: Record<string, number> = {};
      for (const s of p.stats ?? []) {
        const v = Number(s?.value);
        if (s?.name && Number.isFinite(v)) stats[s.name] = v;
      }
      const sub = (p.plays ?? []).find((x: any) => x?.substitution);
      out[side].push({
        id: String(p.athlete.id),
        name: fixText(p.athlete.displayName ?? ""),
        jersey: String(p.jersey ?? ""),
        pos: String(p.position?.abbreviation ?? ""),
        posName: String(p.position?.displayName ?? ""),
        starter: !!p.starter,
        subbedIn: !!p.subbedIn,
        subbedOut: !!p.subbedOut,
        side,
        stats,
        inFor: p.subbedInFor?.athlete?.id ? String(p.subbedInFor.athlete.id) : null,
        subMinute: sub?.clock?.displayValue ?? null,
      });
    }
  }
  return out;
}

export interface SubIn {
  id: string;
  name: string;
  jersey: string;
  minute: string;
}

/** Outgoing player id → the substitute who replaced them. */
export function substitutions(raw: any, rosters: Record<SideKey, RosterPlayer[]>): Map<string, SubIn> {
  const map = new Map<string, SubIn>();
  const all = [...rosters.home, ...rosters.away];
  const byId = new Map(all.map((p) => [p.id, p]));
  for (const p of all) {
    if (p.subbedIn && p.inFor) map.set(p.inFor, { id: p.id, name: p.name, jersey: p.jersey, minute: p.subMinute ?? "" });
  }
  // Fallback: key events list substitutions as [incoming, outgoing].
  for (const k of raw?.keyEvents ?? []) {
    if (k?.type?.type !== "substitution") continue;
    const [inc, outg] = k.participants ?? [];
    const outId = outg?.athlete?.id ? String(outg.athlete.id) : null;
    const inId = inc?.athlete?.id ? String(inc.athlete.id) : null;
    if (!outId || !inId || map.has(outId)) continue;
    const ip = byId.get(inId);
    map.set(outId, {
      id: inId,
      name: ip?.name ?? fixText(inc.athlete.displayName ?? ""),
      jersey: ip?.jersey ?? "",
      minute: k.clock?.displayValue ?? "",
    });
  }
  return map;
}

/* ---------------------------------------------------------- shootout ---- */

export interface Kick {
  side: SideKey;
  taker: string;
  scored: boolean;
}

export function parseShootout(raw: any, plays: Play[], home: Side, away: Side): Kick[] {
  const kicks: Kick[] = [];
  for (const p of plays) {
    if (!p.shootout || !p.side) continue;
    if (p.kind === "penGoal" || p.kind === "goal") kicks.push({ side: p.side, taker: p.player ?? "", scored: true });
    else if (p.kind === "penMiss" || p.kind === "saved" || p.kind === "missed" || p.kind === "woodwork")
      kicks.push({ side: p.side, taker: p.player ?? "", scored: false });
  }
  if (kicks.length) return kicks;
  const match = teamMatcher(home, away);
  for (const k of raw?.keyEvents ?? []) {
    if (!k?.shootout) continue;
    const side = String(k.team?.id ?? "") === home.id ? "home" : String(k.team?.id ?? "") === away.id ? "away" : match(k.team?.displayName);
    if (!side) continue;
    const scored = !!k.scoringPlay || /scored|converts/i.test(`${k.type?.type ?? ""} ${k.text ?? ""}`);
    kicks.push({ side, taker: fixText(k.participants?.[0]?.athlete?.displayName ?? ""), scored });
  }
  return kicks;
}

/* ---------------------------------------------------------- momentum ---- */

export interface MomentumBin {
  period: number;
  index: number;
  from: number;
  to: number;
  stoppage: boolean;
  home: number;
  away: number;
  goals: { side: SideKey; player: string | null; label: string }[];
  counts: Record<SideKey, Partial<Record<"goal" | "on" | "off" | "blocked" | "corner" | "foul", number>>>;
}

const WEIGHT = { goal: 5, on: 3, off: 1.5, blocked: 1, corner: 1, foul: 0.5 } as const;

/** Periods to draw: 1–2 always, extra time when played. */
export function periodsFor(plays: Play[], match: Match): number[] {
  let maxP = Math.max(2, Math.min(4, match.period || 0));
  for (const p of plays) if (!p.shootout && p.period <= 4) maxP = Math.max(maxP, p.period);
  if (/AET|EXTRA|_ET|PEN|SHOOTOUT/i.test(match.statusName)) maxP = 4;
  return maxP > 2 ? [1, 2, 3, 4] : [1, 2];
}

export function momentum(plays: Play[], match: Match): MomentumBin[] {
  const periods = periodsFor(plays, match);
  const bins: MomentumBin[] = [];
  const index = new Map<string, MomentumBin>();
  const live = match.state === "in" ? parseClock(match.clock) : null;
  for (const p of periods) {
    const start = PERIOD_START[p];
    const len = PERIOD_LEN[p];
    const n = Math.ceil(len / 5);
    for (let i = 0; i < n; i++) {
      const b: MomentumBin = {
        period: p,
        index: i,
        from: start + i * 5,
        to: Math.min(start + len, start + (i + 1) * 5),
        stoppage: false,
        home: 0,
        away: 0,
        goals: [],
        counts: { home: {}, away: {} },
      };
      bins.push(b);
      index.set(`${p}:${i}`, b);
    }
    const hasStoppage =
      plays.some((x) => x.period === p && !x.shootout && (x.added > 0 || x.min > start + len) && x.kind !== "end" && x.kind !== "added") ||
      (live && match.period === p && (live.added > 0 || live.min > start + len));
    if (hasStoppage) {
      const b: MomentumBin = {
        period: p,
        index: n,
        from: start + len,
        to: start + len,
        stoppage: true,
        home: 0,
        away: 0,
        goals: [],
        counts: { home: {}, away: {} },
      };
      bins.push(b);
      index.set(`${p}:${n}`, b);
    }
  }
  const binOf = (p: Play): MomentumBin | undefined => {
    if (p.period < 1 || p.period > 4 || !p.hasClock) return undefined;
    const start = PERIOD_START[p.period];
    const len = PERIOD_LEN[p.period];
    const n = Math.ceil(len / 5);
    if (p.added > 0 || p.min > start + len) return index.get(`${p.period}:${n}`) ?? index.get(`${p.period}:${n - 1}`);
    const i = Math.max(0, Math.min(n - 1, Math.floor((p.min - 1 - start) / 5)));
    return index.get(`${p.period}:${i}`);
  };
  const add = (b: MomentumBin, side: SideKey, k: keyof typeof WEIGHT) => {
    b[side] += WEIGHT[k];
    b.counts[side][k] = (b.counts[side][k] ?? 0) + 1;
  };
  for (const p of plays) {
    if (p.shootout || !p.side) continue;
    const b = binOf(p);
    if (!b) continue;
    const other: SideKey = p.side === "home" ? "away" : "home";
    switch (p.kind) {
      case "goal":
      case "owngoal":
      case "penGoal":
        add(b, p.side, "goal");
        b.goals.push({ side: p.side, player: p.player, label: minuteLabel(p.min, p.added) });
        break;
      case "saved":
        add(b, p.side, "on");
        break;
      case "penMiss":
        add(b, p.side, /saved/i.test(p.text) ? "on" : "off");
        break;
      case "missed":
      case "woodwork":
        add(b, p.side, "off");
        break;
      case "blocked":
        add(b, p.side, "blocked");
        break;
      case "corner":
        add(b, p.side, "corner");
        break;
      case "foul":
      case "handball":
        // Location is the offending team's; the free kick goes the other way.
        if (p.x !== null && 100 - p.x >= 200 / 3) add(b, other, "foul");
        break;
    }
  }
  return bins;
}

/* -------------------------------------------------------- time axis ---- */

export interface TimeAxis {
  total: number;
  pos: (period: number, min: number, added: number) => number;
  ticks: { at: number; label: string }[];
  breaks: number[];
  /** Minute label for an axis position. */
  label: (at: number) => string;
}

/** A match clock axis with room for each period's stoppage time. */
export function timeAxis(periods: number[], plays: Play[], match: Match): TimeAxis {
  const live = match.state === "in" ? parseClock(match.clock) : null;
  const offset: Record<number, number> = {};
  const stop: Record<number, number> = {};
  let acc = 0;
  for (const p of periods) {
    const len = PERIOD_LEN[p];
    let a = 0;
    for (const x of plays) if (x.period === p && !x.shootout) a = Math.max(a, x.added, x.min - (PERIOD_START[p] + len));
    if (live && match.period === p) a = Math.max(a, live.added);
    a = Math.min(15, Math.max(0, a));
    offset[p] = acc;
    stop[p] = a;
    acc += len + a;
  }
  const pos = (period: number, min: number, added: number) => {
    const p = periods.includes(period) ? period : periods[periods.length - 1];
    const start = PERIOD_START[p];
    const len = PERIOD_LEN[p];
    if (added > 0 || min > start + len) return offset[p] + len + Math.min(stop[p], Math.max(added, min - start - len)) - 0.5;
    return offset[p] + Math.max(0, Math.min(len, min - start - 0.5));
  };
  const ticks: { at: number; label: string }[] = [];
  const breaks: number[] = [];
  for (const p of periods) {
    const start = PERIOD_START[p];
    const len = PERIOD_LEN[p];
    for (let m = 15; m <= len; m += 15) ticks.push({ at: offset[p] + m, label: `${start + m}'` });
    if (p !== periods[periods.length - 1]) breaks.push(offset[p] + len + stop[p]);
  }
  const label = (at: number) => {
    let p = periods[0];
    for (const q of periods) if (at >= offset[q]) p = q;
    const start = PERIOD_START[p];
    const len = PERIOD_LEN[p];
    const into = at - offset[p];
    if (into <= len) return `${start + Math.max(1, Math.ceil(into))}'`;
    return minuteLabel(start + len, Math.max(1, Math.ceil(into - len)));
  };
  return { total: acc, pos, ticks, breaks, label };
}

/* ------------------------------------------------------------ ratings --- */

export interface Rating {
  player: RosterPlayer;
  rating: number;
  parts: { label: string; delta: number }[];
  chips: { label: string; value: number }[];
}

/**
 * Pitch match rating — transparent and deliberately simple: start at 6.0, add
 * for goals, assists, shots on target, saves and clean sheets, subtract for
 * cards, own goals and goals conceded (keepers), plus a small result bonus.
 */
export function rate(rosters: Record<SideKey, RosterPlayer[]>, match: Match): Rating[] {
  const hs = match.home.score ?? 0;
  const as = match.away.score ?? 0;
  const out: Rating[] = [];
  for (const side of ["home", "away"] as SideKey[]) {
    const conceded = side === "home" ? as : hs;
    const scored = side === "home" ? hs : as;
    const result = scored > conceded ? "W" : scored < conceded ? "L" : "D";
    for (const p of rosters[side]) {
      if (!p.starter && !p.subbedIn) continue;
      const s = p.stats;
      const g = s.totalGoals ?? 0;
      const a = s.goalAssists ?? 0;
      const sot = s.shotsOnTarget ?? 0;
      const saves = s.saves ?? 0;
      const y = s.yellowCards ?? 0;
      const r = s.redCards ?? 0;
      const og = s.ownGoals ?? 0;
      const gk = /^G/i.test(p.pos) || /goalkeeper/i.test(p.posName);
      const def = /^(CD|CB|D|LB|RB|SW|LWB|RWB|WB)/i.test(p.pos) || /back|defender/i.test(p.posName);
      const parts: { label: string; delta: number }[] = [];
      const push = (label: string, delta: number) => delta !== 0 && parts.push({ label, delta });
      push("Goals", g * (gk || def ? 1.4 : 1.2));
      push("Assists", a * 0.8);
      push("Shots on target", Math.max(0, sot - g) * 0.3);
      if (gk) {
        push("Saves", saves * 0.25);
        push("Goals conceded", -0.25 * conceded);
      }
      if (conceded === 0 && match.state === "post" && p.starter && !p.subbedOut) push("Clean sheet", gk ? 0.8 : def ? 0.5 : 0);
      push("Yellow card", -0.4 * Math.min(1, y));
      push("Red card", -1.5 * Math.min(1, r));
      push("Own goal", -1.0 * og);
      if (match.state === "post") push("Result", result === "W" ? 0.4 : result === "D" ? 0.1 : -0.2);
      const rating = Math.max(3, Math.min(10, 6 + parts.reduce((t, x) => t + x.delta, 0)));
      const chips = [
        { label: "Goals", value: g },
        { label: "Assists", value: a },
        { label: "Shots on target", value: sot },
        ...(gk ? [{ label: "Saves", value: saves }] : []),
      ].filter((c) => c.value > 0);
      out.push({ player: p, rating: Math.round(rating * 10) / 10, parts, chips });
    }
  }
  return out.sort(
    (x, y) =>
      y.rating - x.rating ||
      (y.player.stats.totalGoals ?? 0) - (x.player.stats.totalGoals ?? 0) ||
      (y.player.stats.goalAssists ?? 0) - (x.player.stats.goalAssists ?? 0),
  );
}

/** True when the roster carries real in-match stats (not just a pre-match squad list). */
export function hasPlayerStats(rosters: Record<SideKey, RosterPlayer[]>): boolean {
  return [...rosters.home, ...rosters.away].some((p) => p.starter && (p.stats.appearances ?? 0) > 0);
}

/* --------------------------------------------------------- live clock ---- */

export interface LiveProgress {
  /** Arc lengths in minutes for each period segment. */
  segments: number[];
  /** 0..1 fill of each segment. */
  fill: number[];
  label: string;
  added: number;
  phase: "play" | "break" | "shootout";
}

export function liveProgress(match: Match): LiveProgress {
  const status = match.statusName || "";
  const et = match.period >= 3 || /EXTRA|_ET|OVERTIME|SHOOTOUT/i.test(status);
  const periods = et ? [1, 2, 3, 4] : [1, 2];
  const segments = periods.map((p) => PERIOD_LEN[p]);
  const c = parseClock(match.clock) ?? { min: 0, added: 0 };
  const cur = Math.max(1, Math.min(periods.length, match.period || 1));
  const halftime = /HALFTIME|HALF_TIME|END_OF_(REGULATION|EXTRATIME)|END_PERIOD/i.test(status) || /^HT$/i.test(match.status);
  const shootout = /SHOOTOUT/i.test(status) || match.period >= 5;
  const fill = periods.map((p) => {
    if (shootout) return 1;
    if (p < cur) return 1;
    if (p > cur) return 0;
    if (halftime) return 1;
    const start = PERIOD_START[p];
    return Math.max(0, Math.min(1, (c.min - start) / PERIOD_LEN[p]));
  });
  let label = c.added > 0 ? minuteLabel(c.min, c.added) : c.min > 0 ? `${c.min}'` : match.clock || "";
  let phase: LiveProgress["phase"] = "play";
  if (shootout) {
    label = "PEN";
    phase = "shootout";
  } else if (halftime) {
    label = cur === 1 || cur === 3 ? "HT" : cur === 2 ? "90'" : "120'";
    phase = "break";
  }
  return { segments, fill, label, added: shootout || halftime ? 0 : c.added, phase };
}

/* ------------------------------------------------------------ helpers ---- */

export function sideOf(match: Match, key: SideKey): Side {
  return key === "home" ? match.home : match.away;
}

export const isVoid = (m: Match) => /POSTPONED|CANCEL|ABANDON|SUSPEND|FORFEIT|DELAYED/i.test(m.statusName);
