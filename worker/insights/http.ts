import type { Env } from "../common";
import { BOT_RE, isLeague } from "../og/leagues";
import type { Hit, InsightsStore } from "./store";

/* Worker side of first-party analytics: validate, reduce, forward. */

const SECTIONS = new Set([
  "/",
  "/match",
  "/tables",
  "/stats",
  "/leagues",
  "/team",
  "/stadium",
  "/player",
  "/compare",
  "/news",
  "/settings",
  "/widget",
  "/other",
]);
const LANGS = new Set(["en", "es", "fr", "de", "it", "pt", "nl", "hi", "ar"]);
const MAX_BODY = 1024;

function store(env: Env) {
  const ns = env.INSIGHTS as unknown as DurableObjectNamespace<InsightsStore>;
  return ns.get(ns.idFromName("insights"));
}

function device(ua: string): string {
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

function refDomain(v: unknown, host: string): string {
  if (typeof v !== "string" || !v) return "";
  const d = v.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || d.length > 80) return "";
  if (d === host.toLowerCase().replace(/^www\./, "")) return "";
  return d;
}

const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** POST /api/collect — always answers 204 quickly; the DO write happens after the response. */
export async function collect(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const ua = request.headers.get("User-Agent") ?? "";
  // Respect Do-Not-Track / Global Privacy Control, and ignore crawlers.
  if (request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1" || !ua || BOT_RE.test(ua)) return noContent();
  // Same-site beacons only.
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return noContent();
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return noContent();
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY) return noContent();

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return noContent();
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return noContent();
  } catch {
    return noContent();
  }

  const section = typeof body.p === "string" && SECTIONS.has(body.p) ? body.p : "/other";
  const league = typeof body.l === "string" && isLeague(body.l) ? body.l : "";
  const cf = (request as unknown as { cf?: IncomingRequestCfProperties }).cf;
  const cc = String(cf?.country ?? "");
  const country = /^[A-Z]{2}$/.test(cc) && cc !== "XX" ? cc : "";
  const hit: Hit = {
    section,
    league,
    country,
    device: device(ua),
    lang: typeof body.lang === "string" && LANGS.has(body.lang) ? body.lang : "",
    theme: body.th === "dark" || body.th === "light" ? body.th : "",
    standalone: body.sa === 1 || body.sa === true ? "1" : "0",
    ref: refDomain(body.r, url.hostname),
    visit: body.n === 1 || body.n === true,
  };
  ctx.waitUntil(store(env).record(hit).catch((err) => console.error("insights record failed", String(err))));
  return noContent();
}

/* -------------------------------------------------------------- read --- */

const failures = new Map<string, { n: number; until: number }>();

async function digest(s: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
}

/** Constant-time comparison (both sides hashed to equal length first). */
async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  return crypto.subtle.timingSafeEqual(x, y);
}

function privateJson(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(typeof data === "string" ? data : JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...extra,
    },
  });
}

/** GET /api/insights?days=30 with `Authorization: Bearer <INSIGHTS_KEY>`. */
export async function insights(request: Request, url: URL, env: Env): Promise<Response> {
  const key = env.INSIGHTS_KEY;
  if (!key) return privateJson({ error: "not configured" }, 503);

  // Throttle repeated wrong keys per client — held in isolate memory only, never stored or logged.
  const who = request.headers.get("CF-Connecting-IP") ?? "local";
  const now = Date.now();
  const f = failures.get(who);
  if (f && f.n >= 10 && f.until > now) return privateJson({ error: "too many attempts" }, 429, { "Retry-After": String(Math.ceil((f.until - now) / 1000)) });

  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") ?? "");
  if (!m || !(await same(m[1].trim(), key))) {
    const cur = f && f.until > now ? f : { n: 0, until: now + 10 * 60e3 };
    cur.n++;
    failures.set(who, cur);
    if (failures.size > 5000) failures.clear();
    return privateJson({ error: "unauthorized" }, 401, { "WWW-Authenticate": 'Bearer realm="insights"' });
  }
  failures.delete(who);

  const days = Number(url.searchParams.get("days") ?? 30);
  const n = Number.isFinite(days) ? Math.min(365, Math.max(1, Math.floor(days))) : 30;
  return privateJson(await store(env).report(n));
}
