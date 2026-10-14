# Football Scores

A mobile-first football dashboard with original glass surfaces, carefully tuned typography and honest football data. React 19, TypeScript, Vite, TanStack Query, React Router, Radix Dialog and Lucide. No account, paid database or API key is required for the default experience.

## Run

```bash
npm ci
npm run dev
```

Open http://localhost:4173. Node.js 22+ is recommended. `npm run dev` includes the shared API middleware; plain `vite preview` serves only the frontend and will use labelled saved snapshots when API routes are absent.

## Included

- Current and two historical seasons for Premier League, La Liga, Bundesliga, Serie A and Ligue 1.
- Score calendar, status/date/saved filters, season explorer and full match deep links.
- Match scoreboards, available half-time scores, selected-season H2H and team form.
- Calculated standings with sorting and responsive columns.
- Club profiles, recorded season totals and home/away splits.
- Analytics: club comparisons, venue filters, cumulative-points charts, outcome distribution and attacking output. Accessible chart data tables are included.
- Global search for clubs, competitions and recorded matches, plus TheSportsDB player name lookup and directory profiles.
- Persistent favourites across competitions and seasons, recent searches and three appearance settings (system, dark, light).
- Floating mobile navigation, accessible full-screen mobile search, reduced-motion support, route splitting, locally hosted Inter font and installable PWA shell.
- Shared Web API server code, separate Cloudflare Worker and Vercel Edge adapters, API validation, timeout/retry, request deduplication and caching.
- Timestamped genuine data snapshots for outage fallback. An outage snapshot is explicitly labelled; it is never represented as a live response.

## Coverage is deliberately honest

The default OpenFootball source is community-maintained and **has no live feed**. Tables are calculated from recorded results and are **not official tables**: point deductions and competition-specific tie-breaks are excluded. Source dates and latest recorded results are visible. Unverified kickoff times are omitted.

The optional football-data.org free provider supplies **delayed scores**, not real-time live scores. Enable it by configuring all three server secrets in `.env.example`. A shared Redis budget caps upstream calls to eight in a rolling minute across platforms. Without its distributed budget the provider remains disabled. OpenFootball continues to work without Redis.

Free data does not supply all match events, lineups, shot statistics, career statistics or xG. Those features are omitted or clearly marked unavailable. TheSportsDB returns a limited player-directory lookup; it is not a career statistics service. Europa League, international competitions and competitions without verified data are not advertised.

Club initials and the pitch illustration are original fallback graphics. API access does not grant rights to third-party club crests or player photographs, so unverified images are excluded. See [data and attribution](docs/DATA.md).

## Deploy

- [Cloudflare Workers / Pages and Vercel instructions](docs/DEPLOYMENT.md)
- [API contracts and cache behavior](docs/API.md)
- [Sources, licensing, definitions and limitations](docs/DATA.md)
- [Validation evidence](docs/QA.md)

```bash
npm run build:cloudflare  # TypeScript + Vite + Wrangler dry-run
npm run build:vercel      # TypeScript + Vite + Build Output API package
```

Both are build checks, not deployments. To deploy to Cloudflare after login: `npx wrangler deploy`. To deploy to Vercel: import this GitHub repository as a Vite project, or use Vercel CLI. Production credentials and project access must be configured in your own hosting account.

## Checks

```bash
npm run lint
npm run typecheck
npm run test
npx playwright install --with-deps chromium
npm run test:e2e
npm audit --omit=dev
```

Playwright uses actual checked-in OpenFootball snapshots for deterministic UI checks. Unit tests normalize all 15 downloaded files and verify record counts, scores, standings invariants, error boundaries and provider contracts. Browser tests cover the core routes in both themes at 320, 375, 390, 430, 768, 1024 and 1440px, plus search, favourites, dates, filters, player lookup, fallback, accessible charts and axe accessibility checks. `CHROMIUM_PATH` can select an existing compatible Chromium executable. `BASE_URL` can select an existing test server. Screenshots and machine-readable results go to ignored `artifacts/`.

To refresh fallback snapshots, run `node scripts/sync-data.mjs`, review the source changes and commit the timestamped records. The live community provider is separately cached for one hour. Do not run the sync script as an unreviewed production build hook.

## Structure

```text
src/             React pages, design system, query and device state
shared/          Normalized types, validation and result calculations
server/          Provider adapters, request budgets, cache and API handler
worker/          Cloudflare Workers adapter
api/             Vercel Edge adapter
public/data/     Timestamped genuine OpenFootball snapshots
scripts/         Snapshot sync and Vercel packaging
tests/           Data/API tests and Playwright tests
docs/            Deployment, attribution, contracts and QA
```

Code is MIT licensed. Data and font licences remain separate. No performance score or live deployment is claimed without measurement or verified publication.
