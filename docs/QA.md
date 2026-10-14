# Validation

The final implementation was checked locally on 14 October 2026. See GitHub Actions for checks on subsequent commits. Local build checks do not imply a live deployment.

## Coverage

Data/API tests use the actual checked-in snapshots and a verified player-directory excerpt. Browser tests use these same real records to make the suite deterministic. Provider failures are simulated as error responses, never football data. Optional football-data.org contract tests use a minimal copy of a verified published match result; they do not verify an authenticated provider subscription.

Responsive browser suite: 320, 375, 390, 430, 768, 1024 and 1440px, both themes. Major routes, date selection, filters, competition tabs, comparisons, sorting, deep links, local favourites, search, player navigation, provider outage and total failure are covered. Axe checks WCAG A/AA on major pages. Screenshots are captured for desktop and mobile visual inspection.

## Known limits

- A football-data.org token and Redis account were not supplied; its live authenticated integration cannot be exercised in this session. Free coverage remains delayed even when enabled.
- No Cloudflare or Vercel account deployment was requested or completed. Both platform packages are checked locally.
- Lighthouse scores below are measured in a local environment and are not guarantees for a deployed URL or every device.
- Dynamic page titles exist; full server-rendered competition metadata and search indexing are not implemented. Crawlers must execute JavaScript for route content.
- PWA offline coverage uses the precached shell and dated source snapshots after service-worker installation. Fresh API and player lookup coverage is unavailable offline.

## Executed results

| Check                      | Result                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| TypeScript and ESLint      | Passed                                                                                                                 |
| Data and API unit tests    | 24 passed                                                                                                              |
| Browser suite              | 16 passed; 1 opt-in real-provider check skipped in the deterministic run                                               |
| Opt-in real-provider check | Passed separately: Premier League 380 records, Bundesliga historical 306 records, Lionel Messi directory result        |
| Responsive coverage        | All core routes at 320, 375, 390, 430, 768, 1024 and 1440px in both themes; no page overflow                           |
| Axe                        | No WCAG A/AA violations on the six audited major routes in either theme                                                |
| Dependency audit           | Zero vulnerabilities across production and development dependencies                                                    |
| Cloudflare                 | Wrangler Worker dry-run and static asset build passed                                                                  |
| Vercel                     | Build Output API static frontend + bundled Edge function package passed                                                |
| Production PWA             | Offline navigation to a new analytics route and a historical Spanish snapshot passed after service-worker installation |
| Visual review              | Mobile and desktop home, scores and analytics screenshots inspected in both themes                                     |

## Measured Lighthouse

A local production build was served with gzip and a warm **real OpenFootball API** cache. Lighthouse used mobile emulation and its standard simulated throttling in a compatible headless Chromium. This was not a deployed CDN measurement.

| Category       | Measured score |
| -------------- | -------------: |
| Performance    |             95 |
| Accessibility  |            100 |
| Best practices |            100 |
| SEO            |            100 |

Largest contentful paint: 2.8 seconds. Cumulative layout shift: 0. No Lighthouse run warnings. The initial production JavaScript is approximately 116 KiB gzip; fallback validation and page routes are split into separate chunks. Captured machine-readable evidence and 12 design screenshots were reviewed locally. No live deployment or authenticated football-data.org account was tested.
