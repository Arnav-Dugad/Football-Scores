import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { endpoints, getJSON, type PlayerInfo } from "./api";

/* ------------------------------------------------------------ useApi --- */

const cache = new Map<string, { data: unknown; at: number }>();
const inflight = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const p = getJSON<T>(path)
    .then((d) => {
      cache.set(path, { data: d, at: Date.now() });
      return d;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

export function prefetch(path: string) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < 30_000) return;
  load(path).catch(() => undefined);
}

/**
 * Stale-while-revalidate fetch. Cached data renders instantly on navigation;
 * `refresh` (ms) keeps polling while the tab is visible.
 */
export function useApi<T>(path: string | null, opts: { refresh?: number | false } = {}) {
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean; path: string | null }>(
    () => {
      const hit = path ? cache.get(path) : undefined;
      return { data: hit?.data as T | undefined, error: null, loading: !!path && !hit, path };
    },
  );

  // Reset when the key changes, keeping previous data visible (dimmed by callers).
  if (state.path !== path) {
    const hit = path ? cache.get(path) : undefined;
    setState({ data: (hit?.data as T | undefined) ?? state.data, error: null, loading: !!path && !hit, path });
  }

  const pathRef = useRef(path);
  pathRef.current = path;

  const run = useCallback(() => {
    const p = pathRef.current;
    if (!p) return;
    load<T>(p).then(
      (data) => pathRef.current === p && setState({ data, error: null, loading: false, path: p }),
      (error: Error) => pathRef.current === p && setState((s) => ({ ...s, error, loading: false })),
    );
  }, []);

  useEffect(() => {
    if (!path) return;
    const hit = cache.get(path);
    if (!hit || Date.now() - hit.at > 15_000) run();
  }, [path, run]);

  const refresh = opts.refresh;
  useEffect(() => {
    if (!path || !refresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, refresh);
    const onVis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [path, refresh, run]);

  const stale = state.path !== path || (state.loading && state.data !== undefined);
  return { data: state.data, error: state.error, loading: state.loading && state.data === undefined, stale, reload: run };
}

/* ---------------------------------------------------- player photos ---- */

const players = new Map<string, PlayerInfo | null>();
const playerWaiters = new Map<string, Set<() => void>>();
const queue: string[] = [];
let active = 0;
const MAX_ACTIVE = 4;

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const key = queue.shift()!;
    const [name, team, full] = key.split("|");
    active++;
    getJSON<PlayerInfo>(endpoints.player(name, team, full === "1"))
      .then((p) => players.set(key, p))
      .catch(() => players.set(key, null))
      .finally(() => {
        active--;
        playerWaiters.get(key)?.forEach((fn) => fn());
        pump();
      });
  }
}

function requestPlayer(key: string) {
  if (players.has(key) || queue.includes(key)) return;
  queue.push(key);
  pump();
}

/** Real photography for a player, resolved lazily through a small queue. */
export function usePlayer(name: string | null | undefined, team?: string, opts: { full?: boolean; enabled?: boolean } = {}) {
  const key = name ? `${name}|${team ?? ""}|${opts.full ? 1 : 0}` : "";
  const enabled = opts.enabled ?? true;
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => undefined;
      let set = playerWaiters.get(key);
      if (!set) playerWaiters.set(key, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    [key],
  );
  const info = useSyncExternalStore(
    subscribe,
    () => (key ? players.get(key) : null),
    () => null,
  );
  useEffect(() => {
    if (key && enabled) requestPlayer(key);
  }, [key, enabled]);
  return { info: info ?? null, done: key ? players.has(key) : true };
}

/* --------------------------------------------------------- in view ----- */

export function useInView<T extends Element>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (!("IntersectionObserver" in window)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return [ref, seen] as const;
}

/* ----------------------------------------------------------- theme ----- */

export type ThemePref = "system" | "light" | "dark";
const THEME_KEY = "pitch.theme";
const themeListeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

let themePref: ThemePref = typeof window === "undefined" ? "system" : readPref();

export function applyTheme(pref: ThemePref) {
  themePref = pref;
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
  const dark = isDark();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#f2f2f7");
  themeListeners.forEach((fn) => fn());
}

const mql = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
mql?.addEventListener("change", () => themeListeners.forEach((fn) => fn()));

export function isDark(): boolean {
  if (themePref === "dark") return true;
  if (themePref === "light") return false;
  return !!mql?.matches;
}

export function useTheme() {
  const subscribe = useCallback((cb: () => void) => {
    themeListeners.add(cb);
    return () => themeListeners.delete(cb);
  }, []);
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const pref = useSyncExternalStore(subscribe, () => themePref, () => "system" as ThemePref);
  return { dark, pref, setPref: applyTheme };
}

/* ------------------------------------------------------ persistence ---- */

export function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setV(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set] as const;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Pitch` : "Pitch — Football, beautifully";
  }, [title]);
}
