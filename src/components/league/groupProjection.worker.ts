/// <reference lib="webworker" />
/**
 * Group-aware Monte-Carlo projection (e.g. MLS conferences): the whole league
 * is simulated together — cross-group fixtures still award points — but each
 * club is ranked within its own group. Same model as lib/projection.worker
 * (Elo-driven Poisson scorelines), so single-table leagues use that worker.
 */

import { elo, expectedGoals, goalModel, isPlayed, isUpcoming, table, type SeasonData } from "../../lib/analytics";
import type { ProjectionResult, ProjectionTeam } from "../../lib/projection.worker";

export interface GroupProjectionRequest {
  season: SeasonData;
  groups: string[][];
  sims: number;
}

export interface GroupProjectionResult extends ProjectionResult {
  /** Team id → group index. */
  group: Record<string, number>;
}

function poissonSample(l: number, rnd: () => number): number {
  const L = Math.exp(-l);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function project({ season, groups, sims }: GroupProjectionRequest): GroupProjectionResult {
  const ratings = elo(season);
  const gm = goalModel(season, ratings.homeAdv);
  const base = table(season);
  const ids = base.map((r) => r.team);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const groupOf = new Map<string, number>();
  groups.forEach((g, gi) => g.forEach((id) => groupOf.set(id, gi)));
  const members = groups.map((g) => g.map((id) => idx.get(id)).filter((i): i is number => i !== undefined));

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
  const size = Math.max(1, ...members.map((g) => g.length));
  const posCount = Array.from({ length: n }, () => new Array<number>(size).fill(0));
  const ptsSum = new Array<number>(n).fill(0);
  const rnd = mulberry32(0x5eed ^ fixtures.length ^ (n << 8));
  const pts = new Array<number>(n);
  const gd = new Array<number>(n);
  const gf = new Array<number>(n);
  const tie = new Array<number>(n);

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      pts[i] = pts0[i];
      gd[i] = gd0[i];
      gf[i] = gf0[i];
      tie[i] = rnd();
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
    for (const g of members) {
      const order = [...g].sort((a, b) => pts[b] - pts[a] || gd[b] - gd[a] || gf[b] - gf[a] || tie[b] - tie[a]);
      for (let r = 0; r < order.length; r++) {
        posCount[order[r]][r]++;
        ptsSum[order[r]] += pts[order[r]];
      }
    }
  }

  const teams: ProjectionTeam[] = [];
  const group: Record<string, number> = {};
  ids.forEach((id, i) => {
    const gi = groupOf.get(id);
    if (gi === undefined) return;
    const len = members[gi].length;
    const positions = posCount[i].slice(0, len).map((c) => c / sims);
    const expRank = positions.reduce((a, p, r) => a + p * (r + 1), 0);
    teams.push({ team: id, pts: pts0[i], expPts: ptsSum[i] / sims, expRank, positions });
    group[id] = gi;
  });
  teams.sort((a, b) => a.expRank - b.expRank);
  return { teams, remaining: fixtures.length, sims, group };
}

self.onmessage = (e: MessageEvent<GroupProjectionRequest>) => {
  (self as unknown as Worker).postMessage(project(e.data));
};
