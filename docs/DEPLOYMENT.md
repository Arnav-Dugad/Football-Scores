# Deployment

## Cloudflare Workers (recommended)

1. Import or clone the repository. Install Node.js 22+ and run `npm ci`.
2. Run `npm run build:cloudflare`. It builds `dist/` and checks the Worker bundle with Wrangler's dry-run.
3. Run `npx wrangler login` locally in your own terminal.
4. Choose an available Worker name in `wrangler.jsonc`. Run `npx wrangler deploy`.
5. Verify `/`, `/scores`, `/standings`, a `/team/...` deep link and `/api/status` at the returned URL.

The Worker serves static assets through `ASSETS`, and routes `/api/*` to `server/handler.ts`. Single-page application fallback handles nested frontend paths. Successful GET API responses are put into Cloudflare's Cache API; errors are never cached. The Cache API is local to a data center; the optional Redis budget is global. Frontend preference and favourites storage is device-local.

Default operation requires **no secrets**. To enable the optional delayed provider, create a free football-data.org token and configure an Upstash Redis REST database that fits its current free allowance. Set secrets with Wrangler's interactive prompts:

```bash
npx wrangler secret put FOOTBALL_DATA_TOKEN
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Never commit a token. The secret names must not have a `VITE_` prefix. All three values are required; the Redis URL must use HTTPS. Use the same Redis database if one provider token is shared by Cloudflare and Vercel. football-data.org's application/domain terms still apply: confirm that using a second production domain is covered by your subscription.

## Cloudflare Pages alternative

The repository ships a Worker adapter, not an active Pages Functions adapter. For Pages, either host only `dist/` with snapshot coverage (player lookup unavailable), or move the thin Worker API adapter into `functions/api/[[path]].ts` using `onRequest(context) => handleApi(context.request, context.env)` and configure equivalent secrets and caching. Prefer Workers to keep the tested configuration intact. Do not assume Workers and Pages entrypoint signatures are identical.

## Vercel

1. Import `Arnav-Dugad/Football-Scores` into the intended Vercel account/team.
2. Select **Vite**, repository root, install command `npm ci`, build command `npm run build`, output directory `dist`.
3. Leave all optional secrets unset for community-data operation. To enable the delayed provider, set the three server variables above in the Vercel project's environment settings and redeploy. Do not enter tokens in source code or public variables.
4. `api/index.ts` is a Vercel Edge function. `vercel.json` routes `/api/*` to it and frontend deep links to `/index.html`; assets and snapshot files retain their paths.
5. Deploy and test the returned URL, `/api/status`, a nested route, search and provider failure behavior.

`npm run build:vercel` produces `.vercel/output/` with a bundled Edge function and static frontend following the Build Output API. It validates local packaging, without contacting a deployment service. If using the package to deploy, run `vercel link` in the correct account/project and `vercel deploy --prebuilt` only after choosing the intended target. The ordinary Git import uses Vercel's automatic builder and `vercel.json` instead.

## Caching and budgets

- OpenFootball: one-hour per-isolate cache, in-flight deduplication, 10-second timeout and one retry after 350ms for transient upstream failures.
- Optional football-data.org: ten-minute shared Redis cache and rolling global limit of eight calls per 60 seconds, including retries. Redis failure disables provider fetching. 429/4xx responses are not retried.
- TheSportsDB: one-hour cache per search, conservative 20 calls/minute per isolate, 10-second timeout and one transient retry. The public demo key is used server-side; production traffic should be small and monitored. The provider may apply stricter shared-key constraints.
- API success response: browser cache 60 seconds and CDN cache 600 seconds. Cloudflare stores successful GETs explicitly. Errors use `no-store`.
- Client refresh: ten minutes, disabled focus refresh, query deduplication. Current OpenFootball updates can take up to its one-hour server cache to appear.
- Failure: client loads a timestamped OpenFootball snapshot, retaining its original retrieval time and setting `stale=true`. This may differ from the delayed provider's naming/identifiers; stale-source switch is visibly announced.
- Service worker: no API caching. Build-versioned shell, route assets and the 15 timestamped source snapshots are precached after a successful online visit and service-worker installation. Offline API failures use explicitly stale snapshots. Browser install support varies.

## Troubleshooting

- SPA route 404: use the supplied routing configuration, not a plain file server without history fallback.
- API 404 in preview: `vite preview` has no backend; use `npm run dev`, Wrangler or the actual Vercel deployment.
- Fallback message: the upstream was unavailable or rejected the request. Inspect `/api/status`, source timestamps and server logs; never relabel fallback as live.
- Delayed feed inactive: verify all three optional variables are present. No key is needed for the default experience.
- Redis errors: verify the REST URL/token and database allowance. Errors fail closed to protect the football provider budget.
- Missing player: free lookup is limited and uses a singular `player` array in the upstream response. Search a full name.
- Missing current results: community data may lag; the latest result date is shown in Data & methodology.

No Cloudflare or Vercel live deployment is included in the GitHub implementation task. Account login and actual deployment are separate from the verified build artifacts.
