import { fixText } from "./text";

/**
 * Pitch xG — a transparent expected-goals estimate.
 *
 * ESPN commentary carries a location for every attempt, normalised so the
 * shooting team always attacks towards x = 100. y runs 0 → 100 across the
 * pitch where y < 50 is the attacker's right-hand side.
 *
 * The model is a logistic regression on shot distance and the angle the goal
 * mouth subtends, with adjustments for headers, direct free kicks and
 * penalties. Coefficients are tuned to the public consensus for open-play
 * shots (≈0.5 from 5 m central, ≈0.17 from the penalty spot in open play,
 * ≈0.06 from the edge of the box, ≈0.025 from 25 m).
 */

export type ShotOutcome = "goal" | "saved" | "missed" | "blocked" | "woodwork";
export type BodyPart = "right" | "left" | "head" | "other";
export type Situation = "open" | "penalty" | "freekick" | "setpiece";

export interface Shot {
  id: string;
  side: "home" | "away";
  player: string;
  assist: string | null;
  minute: string;
  period: number;
  clock: number;
  /** Shot origin, 0–100 towards the attacked goal. */
  x: number;
  y: number;
  /** Where the ball ended (goal-mouth y), when known. */
  gy: number | null;
  outcome: ShotOutcome;
  body: BodyPart;
  situation: Situation;
  xg: number;
}

const PITCH_L = 105;
const PITCH_W = 68;
const HALF_GOAL = 3.66;

export function shotGeometry(x: number, y: number) {
  const dx = Math.max(0.5, ((100 - x) / 100) * PITCH_L);
  const dy = ((y - 50) / 100) * PITCH_W;
  const distance = Math.hypot(dx, dy);
  let angle = Math.atan((2 * HALF_GOAL * dx) / (dx * dx + dy * dy - HALF_GOAL * HALF_GOAL));
  if (angle < 0) angle += Math.PI;
  return { distance, angle };
}

export function shotXg(x: number, y: number, body: BodyPart, situation: Situation): number {
  if (situation === "penalty") return 0.76;
  const { distance, angle } = shotGeometry(x, y);
  let logit: number;
  if (situation === "freekick") {
    logit = -0.4 - 0.13 * distance;
  } else {
    logit = -1.4 + 1.6 * angle - 0.11 * distance;
    if (body === "head") logit -= 0.95;
    if (situation === "setpiece") logit -= 0.15;
  }
  const p = 1 / (1 + Math.exp(-logit));
  return Math.min(0.97, Math.max(0.01, p));
}

function classify(type: string, text: string): ShotOutcome | null {
  const t = type.toLowerCase();
  if (/own-goal|own goal/.test(t)) return null;
  if (/^goal|penalty---scored|penalty-scored/.test(t)) return "goal";
  if (/woodwork|post|crossbar|bar/.test(t)) return "woodwork";
  if (/blocked/.test(t)) return "blocked";
  if (/saved|on-target/.test(t)) return "saved";
  if (/off-target|missed|miss/.test(t)) return "missed";
  if (/^shot|attempt/.test(t)) return /saved/i.test(text) ? "saved" : /blocked/i.test(text) ? "blocked" : "missed";
  return null;
}

function bodyOf(text: string): BodyPart {
  if (/header/i.test(text)) return "head";
  if (/left footed/i.test(text)) return "left";
  if (/right footed/i.test(text)) return "right";
  return "other";
}

function situationOf(type: string, text: string): Situation {
  if (/penalty/i.test(type) || /penalty/i.test(text)) return "penalty";
  if (/direct free kick/i.test(text)) return "freekick";
  if (/from a corner|following a corner|set piece|from a free kick/i.test(text)) return "setpiece";
  return "open";
}

const normName = (s: string | undefined | null) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Commentary team names don't always match the header exactly
 * ("Deportivo" vs "Deportivo de A Coruña"): match exactly first, then by containment.
 */
function teamMatcher(home: string | string[], away: string | string[]) {
  const vs = (x: string | string[]) => (Array.isArray(x) ? x : [x]).map(normName).filter((v) => v.length > 1);
  const hv = vs(home);
  const av = vs(away);
  return (name: string | undefined): "home" | "away" | null => {
    const n = normName(name);
    if (!n) return null;
    if (hv.includes(n)) return "home";
    if (av.includes(n)) return "away";
    const loose = (list: string[]) => list.some((v) => v.length >= 4 && n.length >= 4 && (v.includes(n) || n.includes(v)));
    const h = loose(hv);
    const a = loose(av);
    return h && !a ? "home" : a && !h ? "away" : null;
  };
}

/**
 * Current feeds use a 0–100 pitch grid; older matches use a 0–1 scale with a
 * different origin. Only trust locations on the 0–100 grid.
 */
export function hasPitchGrid(commentary: any[]): boolean {
  for (const c of commentary ?? []) {
    const p = c?.play;
    if (!p || Number(p.period?.number ?? 0) >= 5) continue;
    if (typeof p.fieldPositionX === "number" && p.fieldPositionX > 1.5) return true;
  }
  return false;
}

/**
 * Extract located attempts from an ESPN summary `commentary` array.
 * Team names may be a list of variants (display name, short name, abbreviation).
 * Shoot-out kicks are excluded.
 */
export function extractShots(commentary: any[], homeName: string | string[], awayName: string | string[]): Shot[] {
  const out: Shot[] = [];
  const seen = new Set<string>();
  if (!hasPitchGrid(commentary)) return out;
  const sideOf = teamMatcher(homeName, awayName);
  for (const c of commentary ?? []) {
    const p = c?.play;
    if (!p || typeof p.fieldPositionX !== "number" || typeof p.fieldPositionY !== "number") continue;
    if (Number(p.period?.number ?? 0) >= 5 || p.shootout) continue;
    const type: string = p.type?.type ?? "";
    const text: string = fixText(p.text ?? c.text ?? "");
    const outcome = classify(type, text);
    if (!outcome) continue;
    const id = String(p.id ?? `${p.clock?.value}-${text.slice(0, 20)}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const side = sideOf(p.team?.displayName);
    if (!side) continue;
    const body = bodyOf(text);
    const situation = situationOf(type, text);
    const assistMatch = /Assisted by ([^.]+?)(?: with| following|\.|$)/.exec(text);
    out.push({
      id,
      side,
      player: fixText(p.participants?.[0]?.athlete?.displayName ?? ""),
      assist: assistMatch ? fixText(assistMatch[1].trim()) : null,
      minute: p.clock?.displayValue ?? "",
      period: p.period?.number ?? 0,
      clock: p.clock?.value ?? 0,
      x: p.fieldPositionX,
      y: p.fieldPositionY,
      gy: typeof p.goalPositionY === "number" ? p.goalPositionY : null,
      outcome,
      body,
      situation,
      xg: shotXg(p.fieldPositionX, p.fieldPositionY, body, situation),
    });
  }
  return out.sort((a, b) => a.clock - b.clock);
}
