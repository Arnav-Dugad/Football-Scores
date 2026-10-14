import { DurableObject } from "cloudflare:workers";
import { normaliseEvent, type WireMatch } from "../shared/scoreboard";
import { ESPN_SITE, LEAGUES, LEAGUE_RE, upstream, ymdIn, type Env } from "./common";

/**
 * LiveHub — a single Durable Object that
 *  • aggregates scoreboards across competitions (`/api/scores`) with caching,
 *  • serves match-day calendars,
 *  • fans live score changes out to connected browsers over hibernatable
 *    WebSockets, polling ESPN only while someone is listening.
 */

type Cached = { at: number; ttl: number; body: string };

export interface LivePatch {
  t: "patch";
  m: WireMatch[];
}
export interface LiveGoal {
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

export class LiveHub extends DurableObject<Env> {
  private cache = new Map<string, Cached>();
  private inflight = new Map<string, Promise<string>>();
  private snap: Map<string, WireMatch> | null = null;

  /* ------------------------------------------------------------ RPC ----- */

  async scores(dates: string[], leagues: string[]): Promise<string> {
    const ds = dates.filter((d) => /^\d{8}$/.test(d)).slice(0, 3);
    const ls = leagues.filter((l) => LEAGUE_RE.test(l)).slice(0, 14);
    const key = `s:${ds.join(",")}:${ls.join(",")}`;
    const yesterday = ymdIn("America/New_York", Date.now() - 36 * 3600e3);
    const past = ds.length > 0 && ds.every((d) => d < yesterday);
    return this.memo(key, past ? 3600 : 20, async () => {
      const jobs = ls.flatMap((l) => (ds.length ? ds : [""]).map((d) => ({ l, d })));
      const results = await pool(jobs, 10, ({ l, d }) => this.board(l, d, past ? 3600 : 20));
      const seen = new Set<string>();
      const events = results.flat().filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
      // Prefer the freshest live state if the hub is tracking these matches.
      if (this.snap) for (let i = 0; i < events.length; i++) events[i] = this.snap.get(events[i].id) ?? events[i];
      return JSON.stringify({ events, updated: new Date().toISOString() });
    });
  }

  async calendar(leagues: string[]): Promise<string> {
    const ls = leagues.filter((l) => LEAGUE_RE.test(l)).slice(0, 14);
    return this.memo(`c:${ls.join(",")}`, 3 * 3600, async () => {
      const out: Record<string, string[]> = {};
      await pool(ls, 8, async (l) => {
        try {
          const data = await upstream<any>(`${ESPN_SITE}/${l}/scoreboard`);
          out[l] = (data.leagues?.[0]?.calendar ?? []).filter((c: unknown) => typeof c === "string").map((c: string) => c.slice(0, 10));
        } catch {
          out[l] = [];
        }
        return [];
      });
      return JSON.stringify({ days: out });
    });
  }

  async snapshot(): Promise<string> {
    await this.restore();
    if (!this.snap || !this.snap.size) await this.poll(false);
    const events = [...(this.snap?.values() ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return JSON.stringify({ events, updated: new Date().toISOString() });
  }

  /* ------------------------------------------------------- WebSockets --- */

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    await this.restore();
    server.send(JSON.stringify({ t: "hello", n: this.ctx.getWebSockets().length }));
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 1000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "error");
    } catch {
      /* ignore */
    }
  }

  async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return; // nobody listening — sleep until the next connection
    let next = 5 * 60e3;
    try {
      next = await this.poll(true);
    } catch (err) {
      console.error("live poll failed", String(err));
      next = 30e3;
    }
    await this.ctx.storage.setAlarm(Date.now() + next);
  }

  /* ------------------------------------------------------------ core ---- */

  private async restore() {
    if (this.snap) return;
    const stored = await this.ctx.storage.get<WireMatch[]>("snap");
    this.snap = new Map((stored ?? []).map((m) => [m.id, m]));
  }

  /** Poll today's boards, diff against the last snapshot, broadcast changes. Returns the next poll delay. */
  private async poll(broadcast: boolean): Promise<number> {
    await this.restore();
    const now = Date.now();
    const dates = [...new Set([ymdIn("America/New_York", now - 6 * 3600e3), ymdIn("America/New_York", now)])];
    const jobs = LEAGUES.flatMap((l) => dates.map((d) => ({ l, d })));
    const boards = await pool(jobs, 11, ({ l, d }) => this.board(l, d, 10));
    const current = new Map<string, WireMatch>();
    for (const m of boards.flat()) {
      const t = Date.parse(m.date);
      if (t > now - 30 * 3600e3 && t < now + 30 * 3600e3) current.set(m.id, m);
    }

    const prev = this.snap ?? new Map();
    const changed: WireMatch[] = [];
    const goals: LiveGoal[] = [];
    for (const m of current.values()) {
      const p = prev.get(m.id);
      if (
        !p ||
        p.state !== m.state ||
        p.status !== m.status ||
        p.clock !== m.clock ||
        p.home.score !== m.home.score ||
        p.away.score !== m.away.score ||
        p.details.length !== m.details.length
      ) {
        changed.push(m);
      }
      if (p && m.state !== "pre" && p.home.score !== null && p.away.score !== null) {
        for (const side of ["home", "away"] as const) {
          const before = p[side].score ?? 0;
          const after = m[side].score ?? 0;
          if (after > before) {
            const g = [...m.details].reverse().find((d) => d.kind === "goal" && d.teamId === m[side].id);
            goals.push({
              t: "goal",
              id: m.id,
              league: m.league.slug,
              side,
              team: m[side].name,
              teamId: m[side].id,
              score: [m.home.score ?? 0, m.away.score ?? 0],
              scorer: g?.player ?? "",
              minute: g?.clock ?? m.clock,
            });
          }
        }
      }
    }
    this.snap = current;
    await this.ctx.storage.put("snap", [...current.values()]);
    // Live boards changed: drop any aggregated responses that include today.
    if (changed.length) for (const k of [...this.cache.keys()]) if (k.startsWith("s:")) this.cache.delete(k);

    if (broadcast && (changed.length || goals.length)) {
      const msgs = [...(changed.length ? [JSON.stringify({ t: "patch", m: changed } satisfies LivePatch)] : []), ...goals.map((g) => JSON.stringify(g))];
      for (const ws of this.ctx.getWebSockets()) {
        for (const msg of msgs) {
          try {
            ws.send(msg);
          } catch {
            /* socket gone */
          }
        }
      }
    }

    const live = [...current.values()].some((m) => m.state === "in");
    const soon = [...current.values()].some((m) => m.state === "pre" && Math.abs(Date.parse(m.date) - now) < 20 * 60e3);
    return live ? 15e3 : soon ? 45e3 : 5 * 60e3;
  }

  private async board(league: string, date: string, ttl: number): Promise<WireMatch[]> {
    const url = `${ESPN_SITE}/${league}/scoreboard${date ? `?dates=${date}` : ""}`;
    try {
      const body = await this.memo(`b:${url}`, ttl, async () => {
        const data = await upstream<any>(url);
        const lg = data.leagues?.[0];
        return JSON.stringify((data.events ?? []).map((e: any) => normaliseEvent(e, lg, league)));
      });
      return JSON.parse(body) as WireMatch[];
    } catch (err) {
      console.error("board failed", league, date, err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      return [];
    }
  }

  private async memo(key: string, ttl: number, make: () => Promise<string>): Promise<string> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl * 1000) return hit.body;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = make()
      .then((body) => {
        this.cache.set(key, { at: Date.now(), ttl, body });
        if (this.cache.size > 400) {
          const oldest = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
          for (const [k] of oldest) this.cache.delete(k);
        }
        return body;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
