import { useEffect, useMemo, useState } from "react";
import type { PeopleData, SeasonData, SeasonShot } from "../../shared/season";
import type { ProjectionResult } from "./projection.worker";
import { useApi } from "./hooks";

/* Season-level data hooks backed by the LeagueStore Durable Object. */

export const seasonPath = (league: string) => `/api/season/${league}`;
export const peoplePath = (league: string) => `/api/people/${league}`;

/** True once every played match has been synced with details. */
export function seasonComplete(s: SeasonData | undefined): boolean {
  if (!s) return false;
  const p = s.progress;
  return p.dates > 0 && p.datesDone >= p.dates && p.detailsDone >= p.details;
}

/** Fraction (0–1) of the background season build that has finished. */
export function seasonProgress(s: SeasonData | undefined): number {
  if (!s) return 0;
  const p = s.progress;
  const total = p.dates + p.details;
  return total ? (p.datesDone + p.detailsDone) / total : 0;
}

export function useSeason(league: string | null) {
  // While the background build is still filling in, refresh every 20s.
  const [building, setBuilding] = useState(false);
  const q = useApi<SeasonData>(league ? seasonPath(league) : null, { refresh: building ? 20_000 : 180_000 });
  const now = !!q.data && !seasonComplete(q.data);
  if (now !== building) setBuilding(now);
  return { ...q, building: now, progress: seasonProgress(q.data) };
}

export function usePeople(league: string | null) {
  return useApi<PeopleData>(league ? peoplePath(league) : null, { refresh: 300_000 });
}

export function useShots(league: string | null, opts: { team?: string; player?: string }) {
  const qs = new URLSearchParams();
  if (opts.team) qs.set("team", opts.team);
  if (opts.player) qs.set("player", opts.player);
  return useApi<{ league: string; shots: SeasonShot[] }>(league ? `/api/shots/${league}?${qs}` : null);
}

/** Run the Monte-Carlo projection off the main thread. */
export function useProjection(season: SeasonData | undefined, sims = 10_000) {
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [running, setRunning] = useState(false);
  const key = useMemo(
    () => (season ? `${season.league}|${season.matches.filter((m) => m.s === "post").length}|${season.matches.length}` : ""),
    [season],
  );
  useEffect(() => {
    if (!season) return;
    const worker = new Worker(new URL("./projection.worker.ts", import.meta.url), { type: "module" });
    setRunning(true);
    worker.onmessage = (e: MessageEvent<ProjectionResult>) => {
      setResult(e.data);
      setRunning(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setRunning(false);
      worker.terminate();
    };
    worker.postMessage({ season, sims });
    return () => worker.terminate();
  }, [key, sims]); // eslint-disable-line react-hooks/exhaustive-deps
  return { result, running };
}
