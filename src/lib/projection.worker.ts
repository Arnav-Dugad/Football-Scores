/// <reference lib="webworker" />
/**
 * Monte-Carlo season projection. Simulates the remaining fixtures N times with
 * Poisson scorelines driven by Elo-style ratings, then reports per team:
 * expected points, average finish, and the full distribution of finishing
 * positions (from which title / qualification / relegation odds are read).
 */

import { elo, expectedGoals, goalModel, isPlayed, isUpcoming, table, type SeasonData } from "./analytics";

export interface ProjectionRequest {
  season: SeasonData;
  sims: number;
}

export interface ProjectionTeam {
  team: string;
  pts: number; // current
  expPts: number;
  expRank: number;
  /** positions[i] = probability of finishing in position i+1 */
  positions: number[];
}

export interface ProjectionResult {
  teams: ProjectionTeam[];
  remaining: number;
  sims: number;
}

function poissonSample(l: number, rnd: () => number): number {
  // Knuth — fine for football-sized λ.
  const L = Math.exp(-l);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}

// Small, fast, seedable PRNG so results are stable between renders.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function project({ season, sims }: ProjectionRequest): ProjectionResult {
  const ratings = elo(season);
  const gm = goalModel(season, ratings.homeAdv);
  const base = table(season);
  const ids = base.map((r) => r.team);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const fixtures = season.matches
    .filter((m) => isUpcoming(m) || (!isPlayed(m) && m.s === "in"))
    .filter((m) => idx.has(m.h) && idx.has(m.a))
    .map((m) => {
      const [lh, la] = expectedGoals((ratings.now.get(m.h) ?? 1500) + ratings.homeAdv / 2, (ratings.now.get(m.a) ?? 1500) - ratings.homeAdv / 2, gm);
      return { h: idx.get(m.h)!, a: idx.get(m.a)!, lh, la };
    });

  const pts0 = base.map((r) => r.pts);
  const gd0 = base.map((r) => r.gd);
  const gf0 = base.map((r) => r.gf);
  const posCount = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const ptsSum = new Array<number>(n).fill(0);
  const rnd = mulberry32(0x5eed ^ fixtures.length ^ (n << 8));

  const pts = new Array<number>(n);
  const gd = new Array<number>(n);
  const gf = new Array<number>(n);
  const order = ids.map((_, i) => i);
  const tiebreak = ids.map(() => 0);

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      pts[i] = pts0[i];
      gd[i] = gd0[i];
      gf[i] = gf0[i];
      tiebreak[i] = rnd();
    }
    for (const f of fixtures) {
      const x = poissonSample(f.lh, rnd);
      const y = poissonSample(f.la, rnd);
      gf[f.h] += x;
      gf[f.a] += y;
      gd[f.h] += x - y;
      gd[f.a] += y - x;
      if (x > y) pts[f.h] += 3;
      else if (x < y) pts[f.a] += 3;
      else {
        pts[f.h] += 1;
        pts[f.a] += 1;
      }
    }
    order.sort((a, b) => pts[b] - pts[a] || gd[b] - gd[a] || gf[b] - gf[a] || tiebreak[b] - tiebreak[a]);
    for (let r = 0; r < n; r++) {
      posCount[order[r]][r]++;
      ptsSum[order[r]] += pts[order[r]];
    }
  }

  const teams: ProjectionTeam[] = ids.map((id, i) => {
    const positions = posCount[i].map((c) => c / sims);
    const expRank = positions.reduce((a, p, r) => a + p * (r + 1), 0);
    return { team: id, pts: pts0[i], expPts: ptsSum[i] / sims, expRank, positions };
  });
  teams.sort((a, b) => a.expRank - b.expRank);
  return { teams, remaining: fixtures.length, sims };
}

self.onmessage = (e: MessageEvent<ProjectionRequest>) => {
  const result = project(e.data);
  (self as unknown as Worker).postMessage(result);
};
