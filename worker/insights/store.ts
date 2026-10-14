import { DurableObject } from "cloudflare:workers";
import type { Env } from "../common";

/**
 * InsightsStore — cookie-free, aggregate-only analytics.
 *
 * Nothing personal is ever stored: no IP, no user agent, no identifiers, no
 * timestamps finer than a UTC day. Each page view arrives already reduced to a
 * handful of coarse labels and only increments daily counters.
 *
 * Writes are batched in memory and flushed as ONE row per day (a small JSON
 * document) a few seconds after the first buffered hit — well inside the idle
 * window before an inactive Durable Object is evicted — or immediately once 50
 * hits are waiting. SQLite row writes (a metered Free-plan resource) are thus
 * bounded at ~17k/day even under continuous traffic, and are usually far fewer.
 */

export const DIMS = ["section", "league", "country", "device", "lang", "theme", "standalone", "ref"] as const;
export type Dim = (typeof DIMS)[number];

export interface Hit {
  section: string;
  league: string;
  country: string;
  device: string;
  lang: string;
  theme: string;
  standalone: "1" | "0";
  ref: string;
  /** First page view of a browser session (a "visit"). */
  visit: boolean;
}

interface DayAgg {
  pv: number;
  visits: number;
  dims: Record<Dim, Record<string, number>>;
}

export interface InsightsReport {
  from: string;
  to: string;
  days: { d: string; pv: number; visits: number }[];
  totals: { pv: number; visits: number };
  dims: Record<Dim, Record<string, number>>;
  updated: string;
}

/** Per-view dimensions; the rest are counted once per visit. */
const PER_VIEW: ReadonlySet<Dim> = new Set(["section", "league"]);
const KEY_CAP: Record<Dim, number> = { section: 40, league: 40, country: 260, device: 8, lang: 20, theme: 4, standalone: 4, ref: 120 };
const RETAIN_DAYS = 400;
const FLUSH_MS = 5_000;
const FLUSH_EVENTS = 50;

const empty = (): DayAgg => ({ pv: 0, visits: 0, dims: Object.fromEntries(DIMS.map((d) => [d, {}])) as DayAgg["dims"] });
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

function bump(agg: DayAgg, dim: Dim, key: string, n = 1) {
  const bucket = agg.dims[dim];
  if (!(key in bucket) && Object.keys(bucket).length >= KEY_CAP[dim]) key = "other";
  bucket[key] = (bucket[key] ?? 0) + n;
}

function merge(into: DayAgg, from: DayAgg) {
  into.pv += from.pv;
  into.visits += from.visits;
  for (const dim of DIMS) for (const [k, n] of Object.entries(from.dims[dim] ?? {})) bump(into, dim, k, n);
}

const clean = (s: unknown, max = 64) => (typeof s === "string" ? s.slice(0, max) : "");

export class InsightsStore extends DurableObject<Env> {
  private sql: SqlStorage;
  private buffer = new Map<string, DayAgg>();
  private armed = false;
  private pending = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS days (d TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  }

  /* ------------------------------------------------------------ RPC ----- */

  async record(hit: Hit): Promise<void> {
    const day = dayOf(Date.now());
    let agg = this.buffer.get(day);
    if (!agg) this.buffer.set(day, (agg = empty()));
    agg.pv++;
    const values: Record<Dim, string> = {
      section: clean(hit.section, 24),
      league: clean(hit.league, 24),
      country: clean(hit.country, 2),
      device: clean(hit.device, 10),
      lang: clean(hit.lang, 5),
      theme: clean(hit.theme, 8),
      standalone: hit.standalone === "1" ? "1" : "0",
      ref: clean(hit.ref, 80),
    };
    if (hit.visit) agg.visits++;
    for (const dim of DIMS) {
      const v = values[dim];
      if (!v) continue;
      if (PER_VIEW.has(dim) || hit.visit) bump(agg, dim, v);
    }
    this.pending++;
    if (this.pending >= FLUSH_EVENTS) {
      this.flush();
      return;
    }
    if (!this.armed) {
      this.armed = true;
      const at = await this.ctx.storage.getAlarm();
      if (at === null || at > Date.now() + FLUSH_MS) await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
    }
  }

  async report(days: number): Promise<string> {
    const n = Math.min(365, Math.max(1, Math.floor(days) || 30));
    const now = Date.now();
    const to = dayOf(now);
    const from = dayOf(now - (n - 1) * 86400e3);
    const stored = new Map<string, DayAgg>();
    for (const r of this.sql.exec<{ d: string; v: string }>("SELECT d, v FROM days WHERE d >= ? AND d <= ?", from, to)) {
      try {
        stored.set(r.d, JSON.parse(r.v) as DayAgg);
      } catch {
        /* skip corrupt row */
      }
    }
    // Include counts that haven't been flushed yet.
    for (const [d, agg] of this.buffer) {
      if (d < from || d > to) continue;
      const base = stored.get(d) ?? empty();
      merge(base, agg);
      stored.set(d, base);
    }

    const out: InsightsReport = {
      from,
      to,
      days: [],
      totals: { pv: 0, visits: 0 },
      dims: Object.fromEntries(DIMS.map((d) => [d, {}])) as InsightsReport["dims"],
      updated: new Date(now).toISOString(),
    };
    for (let i = n - 1; i >= 0; i--) {
      const d = dayOf(now - i * 86400e3);
      const agg = stored.get(d);
      out.days.push({ d, pv: agg?.pv ?? 0, visits: agg?.visits ?? 0 });
      if (!agg) continue;
      out.totals.pv += agg.pv;
      out.totals.visits += agg.visits;
      for (const dim of DIMS) {
        const into = out.dims[dim];
        for (const [k, v] of Object.entries(agg.dims?.[dim] ?? {})) into[k] = (into[k] ?? 0) + v;
      }
    }
    return JSON.stringify(out);
  }

  /* ----------------------------------------------------------- flush ---- */

  async alarm(): Promise<void> {
    this.armed = false;
    this.flush();
  }

  private flush() {
    if (!this.buffer.size) return;
    const pending = this.buffer;
    this.buffer = new Map();
    this.pending = 0;
    for (const [d, agg] of pending) {
      const row = this.sql.exec<{ v: string }>("SELECT v FROM days WHERE d = ?", d).toArray()[0];
      let base = empty();
      if (row) {
        try {
          base = JSON.parse(row.v) as DayAgg;
          for (const dim of DIMS) base.dims[dim] ??= {};
        } catch {
          base = empty();
        }
      }
      merge(base, agg);
      this.sql.exec("INSERT INTO days (d, v) VALUES (?, ?) ON CONFLICT(d) DO UPDATE SET v = excluded.v", d, JSON.stringify(base));
    }
    this.sql.exec("DELETE FROM days WHERE d < ?", dayOf(Date.now() - RETAIN_DAYS * 86400e3));
  }
}
