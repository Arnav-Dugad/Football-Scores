import type { Env } from "./common";

/**
 * Per-route social metadata (Open Graph / Twitter cards) for shared links.
 * Implemented by the platform work; currently passes HTML through unchanged.
 */
export async function injectMeta(_request: Request, response: Response, _env: Env, _ctx: ExecutionContext): Promise<Response> {
  return response;
}
