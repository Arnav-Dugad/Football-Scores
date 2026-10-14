import { useMemo } from "react";
import type { WireMatch } from "../../../shared/scoreboard";
import type { SeasonData } from "../../lib/analytics";
import { endpoints, type TableGroup } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { computeLiveTables } from "./liveCalc";

/** Live tables for a competition, fed by the live snapshot (kept fresh by WebSocket patches). */
export function useLiveTables(league: string, groups: TableGroup[], season: SeasonData | undefined) {
  const snap = useApi<{ events: WireMatch[] }>(endpoints.snapshot(), { refresh: 30_000 });
  const mine = useMemo(() => (snap.data?.events ?? []).filter((m) => m.league?.slug === league), [snap.data, league]);
  const live = useMemo(() => mine.filter((m) => m.state === "in" && m.home.score !== null && m.away.score !== null), [mine]);
  // Matches that finished in the last few hours — ESPN standings can lag a few minutes behind.
  const finished = useMemo(
    () =>
      mine.filter(
        (m) => m.state === "post" && m.completed && m.home.score !== null && m.away.score !== null && Date.now() - Date.parse(m.date) < 5 * 3600e3,
      ),
    [mine],
  );
  const tables = useMemo(() => computeLiveTables(groups, live, finished, season), [groups, live, finished, season]);
  return { live, tables };
}
