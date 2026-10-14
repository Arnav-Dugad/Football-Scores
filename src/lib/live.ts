import { useEffect, useSyncExternalStore } from "react";
import type { WireMatch } from "../../shared/scoreboard";
import { mutateCache } from "./hooks";

/**
 * Live channel to the LiveHub Durable Object.
 *
 * - Score/status patches are merged straight into cached `/api/scores`
 *   responses, so every list on screen updates without polling.
 * - Goal events are re-broadcast to in-app listeners (celebrations, toasts).
 * - Reconnects with backoff; pauses while the tab is hidden.
 */

export interface GoalEvent {
  t: "goal";
  id: string;
  league: string;
  side: "home" | "away";
  team: string;
  teamId: string;
  score: [number, number];
  scorer: string;
  minute: string;
}

type Status = "idle" | "connecting" | "open" | "closed";

let ws: WebSocket | null = null;
let status: Status = "idle";
let retry = 0;
let timer: number | undefined;
let users = 0;
let lastMessage = 0;
const statusListeners = new Set<() => void>();
const goalListeners = new Set<(g: GoalEvent) => void>();
const patchListeners = new Set<(m: WireMatch[]) => void>();

function setStatus(s: Status) {
  status = s;
  statusListeners.forEach((fn) => fn());
}

function applyPatch(changed: WireMatch[]) {
  const byId = new Map(changed.map((m) => [m.id, m]));
  mutateCache((path, data) => {
    if (!path.startsWith("/api/scores") && !path.startsWith("/api/live/snapshot")) return undefined;
    const d = data as { events?: WireMatch[] } | undefined;
    if (!d?.events) return undefined;
    let hit = false;
    const events = d.events.map((e) => {
      const n = byId.get(e.id);
      if (n) hit = true;
      return n ?? e;
    });
    return hit ? { ...d, events } : undefined;
  });
  patchListeners.forEach((fn) => fn(changed));
}

function connect() {
  if (ws || typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`;
  setStatus("connecting");
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    retry = 0;
    setStatus("open");
  };
  ws.onmessage = (ev) => {
    lastMessage = Date.now();
    if (ev.data === "pong") return;
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.t === "patch" && Array.isArray(msg.m)) applyPatch(msg.m as WireMatch[]);
      else if (msg.t === "goal") goalListeners.forEach((fn) => fn(msg as GoalEvent));
    } catch {
      /* ignore malformed */
    }
  };
  ws.onclose = () => {
    ws = null;
    setStatus("closed");
    scheduleReconnect();
  };
  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };
}

function scheduleReconnect() {
  window.clearTimeout(timer);
  if (users <= 0 || document.visibilityState !== "visible") return;
  const delay = Math.min(30_000, 1000 * 2 ** retry) + Math.random() * 500;
  retry++;
  timer = window.setTimeout(connect, delay);
}

function disconnect() {
  window.clearTimeout(timer);
  if (ws) {
    ws.onclose = null;
    try {
      ws.close(1000);
    } catch {
      /* ignore */
    }
    ws = null;
  }
  setStatus("idle");
}

let keepalive: number | undefined;
function onVisibility() {
  if (document.visibilityState === "visible") connect();
  else disconnect();
}

/** Mount once near the app root to keep the live channel open while visible. */
export function useLiveChannel() {
  useEffect(() => {
    users++;
    connect();
    document.addEventListener("visibilitychange", onVisibility);
    keepalive = window.setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
      // A silent socket for 3 minutes is probably dead — recycle it.
      if (ws && lastMessage && Date.now() - lastMessage > 180_000) {
        disconnect();
        connect();
      }
    }, 45_000);
    return () => {
      users--;
      window.clearInterval(keepalive);
      document.removeEventListener("visibilitychange", onVisibility);
      if (users <= 0) disconnect();
    };
  }, []);
}

export function useLiveStatus(): Status {
  return useSyncExternalStore(
    (fn) => {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    () => status,
    () => "idle" as Status,
  );
}

/** Subscribe to goal events pushed by the hub. */
export function onGoal(fn: (g: GoalEvent) => void) {
  goalListeners.add(fn);
  return () => {
    goalListeners.delete(fn);
  };
}

/** Subscribe to raw match patches (e.g. to refresh a match page summary). */
export function onPatch(fn: (m: WireMatch[]) => void) {
  patchListeners.add(fn);
  return () => {
    patchListeners.delete(fn);
  };
}
