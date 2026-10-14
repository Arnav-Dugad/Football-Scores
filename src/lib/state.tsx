import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  leagues,
  seasons,
  type Dataset,
  type LeagueId,
} from "../../shared/model";
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be disabled. In-memory state remains usable. */
  }
}
type State = {
  league: LeagueId;
  season: string;
  setLeague: (id: LeagueId) => void;
  setSeason: (s: string) => void;
  favorites: string[];
  toggle: (id: string) => void;
  theme: string;
  cycleTheme: () => void;
  data: Dataset | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  fetching: boolean;
  path: (p: string, league?: string) => string;
};
const Context = createContext<State | null>(null);
export function StateProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const league = (
    leagues.some((l) => l.id === params.get("league"))
      ? params.get("league")
      : read("fs-league", "en.1")
  ) as LeagueId;
  const validLeague = leagues.some((l) => l.id === league) ? league : "en.1";
  const season = seasons.some((s) => s === params.get("season"))
    ? params.get("season")!
    : "2026-27";
  const [favorites, setFavorites] = useState<string[]>(() => {
    const value = read<unknown>("fs-favorites-v1", []);
    return Array.isArray(value)
      ? value.filter((x) => typeof x === "string")
      : [];
  });
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("fs-theme") ?? "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("fs-theme", theme);
    } catch {
      /* Optional persistence. */
    }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const query = useQuery({
    queryKey: ["data", validLeague, season],
    queryFn: async ({ signal }): Promise<Dataset> => {
      try {
        const r = await fetch(
          `/api/data?league=${validLeague}&season=${season}`,
          { signal },
        );
        if (!r.ok) throw new Error("Provider unavailable");
        return (await r.json()) as Dataset;
      } catch (e) {
        if (signal.aborted) throw e;
        const r = await fetch(`/data/${season}-${validLeague}.json`, {
          signal,
        });
        if (!r.ok)
          throw new Error(
            "No cached data is available for this season. Please try another season.",
          );
        const raw = await r.json();
        const { normalizeOpen } = await import("../../shared/normalize");
        return normalizeOpen(
          raw,
          validLeague,
          season,
          raw.provenance?.retrievedAt ?? new Date().toISOString(),
          true,
        );
      }
    },
    staleTime: 600000,
    refetchInterval: 600000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const setLeague = (id: LeagueId) => {
    save("fs-league", id);
    setParams((p) => {
      p.set("league", id);
      return p;
    });
  };
  const setSeason = (s: string) =>
    setParams((p) => {
      p.set("season", s);
      return p;
    });
  const toggle = (id: string) =>
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      save("fs-favorites-v1", next);
      return next;
    });
  const path = (p: string, l: string = validLeague) =>
    `${p}?league=${encodeURIComponent(l)}&season=${season}`;
  return (
    <Context.Provider
      value={{
        league: validLeague,
        season,
        setLeague,
        setSeason,
        favorites,
        toggle,
        theme,
        cycleTheme: () =>
          setTheme((t) =>
            t === "system" ? "dark" : t === "dark" ? "light" : "system",
          ),
        data: query.data,
        loading: query.isPending,
        error: query.error,
        fetching: query.isFetching,
        refresh: () => {
          void query.refetch();
        },
        path,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const c = useContext(Context);
  if (!c) throw new Error("Missing application context");
  return c;
}
export type Player = {
  id: string;
  name: string;
  team: string | null;
  nationality: string | null;
  position: string | null;
  born: string | null;
  bio: string | null;
};
export function usePlayers(name: string) {
  return useQuery({
    queryKey: ["players", name],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/players?q=${encodeURIComponent(name)}`, {
        signal,
      });
      if (!r.ok)
        throw new Error("Player lookup is unavailable. Try again later.");
      return (await r.json()) as {
        players: Player[];
        source: string;
        notice: string;
        fetchedAt: string;
      };
    },
    enabled: name.trim().length >= 3,
    staleTime: 3600000,
    retry: false,
  });
}
