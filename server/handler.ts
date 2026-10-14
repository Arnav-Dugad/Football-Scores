import { leagues, seasons } from "../shared/model";
import { FootballData, OpenFootball, players } from "./providers";
import { ProviderError, type Env } from "./cache";
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200 ? "public, max-age=60, s-maxage=600" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function handleApi(
  request: Request,
  env: Env = {},
): Promise<Response> {
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  const u = new URL(request.url);
  try {
    if (u.pathname === "/api/status")
      return json({
        openfootball: "Community results, no live feed",
        footballData:
          env.FOOTBALL_DATA_TOKEN &&
          env.UPSTASH_REDIS_REST_URL &&
          env.UPSTASH_REDIS_REST_TOKEN
            ? "Configured: delayed free tier"
            : "Not configured",
        sportsdb: "Free player name lookup",
        refreshSeconds: 600,
      });
    if (u.pathname === "/api/players") {
      const q = u.searchParams.get("q")?.trim() ?? "";
      if (q.length < 3 || q.length > 60 || !/^[-\p{L}\p{N} .']+$/u.test(q))
        return json({ error: "Use 3–60 letters for a player name." }, 400);
      return json(await players(q));
    }
    if (u.pathname !== "/api/data")
      return json({ error: "API route not found" }, 404);
    const league = u.searchParams.get("league") ?? "en.1",
      season = u.searchParams.get("season") ?? "2026-27";
    if (
      !leagues.some((x) => x.id === league) ||
      !seasons.some((x) => x === season)
    )
      return json({ error: "Unsupported competition or season." }, 400);
    const id = league as (typeof leagues)[number]["id"];
    const configured = !!(
      env.FOOTBALL_DATA_TOKEN &&
      env.UPSTASH_REDIS_REST_URL &&
      env.UPSTASH_REDIS_REST_TOKEN
    );
    const data = await (
      configured && season === "2026-27"
        ? new FootballData(env)
        : new OpenFootball()
    ).load(id, season);
    return json(data);
  } catch (e) {
    return json(
      {
        error:
          e instanceof ProviderError
            ? e.message
            : "The data provider could not be reached. Please try again.",
        code: "PROVIDER_UNAVAILABLE",
      },
      e instanceof ProviderError && [400, 404, 429].includes(e.status)
        ? e.status
        : 503,
    );
  }
}
