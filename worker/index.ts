import { handleApi } from "../server/handler";
import type { Env } from "../server/cache";
interface WorkerEnv extends Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}
interface Context {
  waitUntil: (promise: Promise<unknown>) => void;
}
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: Context) {
    if (!new URL(request.url).pathname.startsWith("/api/"))
      return env.ASSETS.fetch(request);
    const cache = (caches as unknown as { default: Cache }).default;
    if (request.method === "GET") {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    const response = await handleApi(request, env);
    if (response.ok && request.method === "GET")
      ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
};
