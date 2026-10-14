export interface Env {
  FOOTBALL_DATA_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}
export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const memory = new Map<string, { value: unknown; expires: number }>();
const pending = new Map<string, Promise<unknown>>();
const rate = new Map<string, { count: number; expires: number }>();
export async function cached<T>(
  key: string,
  ttl: number,
  run: () => Promise<T>,
): Promise<T> {
  const value = memory.get(key);
  if (value && value.expires > Date.now()) return value.value as T;
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const p = run()
    .then((value) => {
      if (memory.size >= 80) memory.delete(memory.keys().next().value!);
      memory.set(key, { value, expires: Date.now() + ttl * 1000 });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
async function redis(env: Env, command: unknown[]) {
  if (
    !env.UPSTASH_REDIS_REST_URL?.startsWith("https://") ||
    !env.UPSTASH_REDIS_REST_TOKEN
  )
    throw new ProviderError(
      503,
      "Distributed provider budget is not configured.",
    );
  const r = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new ProviderError(503, "Provider budget unavailable.");
  const j = (await r.json()) as { result: unknown; error?: string };
  if (j.error) throw new ProviderError(503, "Provider budget unavailable.");
  return j.result;
}
export async function limitedFetch(
  url: string,
  headers: Record<string, string> = {},
  env?: Env,
): Promise<unknown> {
  const host = new URL(url).hostname;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (host === "api.football-data.org") {
      if (!env) throw new ProviderError(503, "Provider not configured.");
      const n = await redis(env, [
        "EVAL",
        "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]-60000); local n=redis.call('ZCARD',KEYS[1]); if n>=8 then return 9 end; redis.call('ZADD',KEYS[1],ARGV[1],ARGV[2]); redis.call('EXPIRE',KEYS[1],65); return n+1",
        1,
        "fs:budget",
        Date.now(),
        crypto.randomUUID(),
      ]);
      if (Number(n) > 8)
        throw new ProviderError(
          429,
          "Provider budget reached. Try again in a minute.",
        );
    } else {
      const r = rate.get(host);
      const state =
        r && r.expires > Date.now()
          ? r
          : { count: 0, expires: Date.now() + 60000 };
      if (state.count >= 20)
        throw new ProviderError(
          429,
          "Request budget reached. Try again in a minute.",
        );
      state.count++;
      rate.set(host, state);
    }
    try {
      const r = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok)
        throw new ProviderError(
          r.status,
          r.status === 429
            ? "Provider rate limit reached."
            : `Provider unavailable (${r.status}).`,
        );
      return await r.json();
    } catch (e) {
      if (e instanceof ProviderError && e.status < 500) throw e;
      if (attempt === 1) throw e;
      await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
    }
  }
  throw new ProviderError(503, "Provider unavailable.");
}
export async function distributed<T>(
  env: Env,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const hit = await redis(env, ["GET", `fs:cache:${key}`]);
  if (typeof hit === "string") return JSON.parse(hit) as T;
  const value = await run();
  await redis(env, [
    "SET",
    `fs:cache:${key}`,
    JSON.stringify(value),
    "EX",
    600,
  ]);
  return value;
}
