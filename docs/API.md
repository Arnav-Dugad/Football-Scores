# API contract

Every endpoint accepts GET only. All outputs are JSON. Other methods return 405. API errors never echo tokens, request headers or raw provider exceptions.

## GET /api/data?league=en.1&season=2026-27

Allowlisted league IDs: `en.1`, `es.1`, `de.1`, `it.1`, `fr.1`. Seasons: `2026-27`, `2025-26`, `2024-25`.

Returns the `Dataset` contract from `shared/model.ts`:

- `league`, `season`
- `matches`: stable source-qualified match IDs, date, verified UTC kickoff or `null`, round, home/away `{id,name}`, final/half score pairs or `null`, status, optional venue
- `standings`: team, played, won, drawn, lost, goals for/against/difference, calculated points, chronological last-five form, calculated position
- `meta`: source, source URL, retrieval time, snapshot retrieval time when available, latest recorded result, coverage mode, stale flag, notice and official-standings flag

Status is `finished`, `scheduled`, `unconfirmed`, `in-play`, `paused`, `postponed` or `cancelled`. Community datasets never produce `in-play`. A past fixture without a score becomes `unconfirmed`, never a fabricated 0–0. Full-time scores alone decide completed community records. Optional delayed provider results preserve their supplied status. No match minute is guessed.

## GET /api/players?q=Lionel%20Messi

Query must be 3–60 letters/numbers, spaces, periods, hyphens or apostrophes. Returns a limited football-player directory lookup: `{players:[{id,name,team,nationality,position,born,bio}],source,fetchedAt,notice}`. Player statistics and images are intentionally absent. The upstream uses the singular field `player`; the normalized output uses `players`.

## GET /api/status

Reports configured coverage modes and refresh cadence. This is not a live uptime probe. It never exposes environment values.

## Errors

`{error:string,code?:"PROVIDER_UNAVAILABLE"}`. Validation: 400. Unknown route: 404. Request budget: 429. Provider failure: 503. A client encountering data failure can separately load `/data/<season>-<league>.json`, which contains original source provenance. It must mark this as a saved snapshot.

## Extending providers

Implement `FootballProvider.load(league,season)` in `server/providers.ts`, validate the upstream payload, and map to `Dataset`. Use `limitedFetch` and `cached`, keep coverage labels accurate, and register only competitions whose data is available. Keep secrets out of `src/`. All runtime business logic uses Web APIs; platform adapters contain the runtime-specific cache/environment plumbing.
