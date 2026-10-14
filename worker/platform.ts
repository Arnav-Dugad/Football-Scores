import { DurableObject } from "cloudflare:workers";
import type { Env } from "./common";

/**
 * Platform features: share images (/api/og/*), first-party analytics
 * (/api/collect, /api/insights) and the compact widget feed (/api/widget).
 * Returns null when the request isn't a platform route.
 */
export async function handlePlatform(_request: Request, _url: URL, _env: Env, _ctx: ExecutionContext): Promise<Response | null> {
  return null;
}

/** Renders Open Graph images (heavy CPU — runs in a Durable Object). */
export class Renderer extends DurableObject<Env> {}

/** Cookie-free page-view aggregates for the private /insights page. */
export class InsightsStore extends DurableObject<Env> {}
