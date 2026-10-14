# Pitch — Football, beautifully

Live football scores, lineups, tables and analytics in a glassy, Apple-inspired interface. Built for phones first, and just as good on a desktop.

**Competitions:** Premier League · LaLiga · Serie A · Bundesliga · Ligue 1 · Champions League · Europa League · MLS · Eredivisie · Liga Portugal · Indian Super League

## Features

- **Scores:** a date strip with match-day markers, a featured match hero, live minute and pulse, goal scorers and red cards, and 30-second auto-refresh.
- **Match centre:** a timeline (goals, assists, cards, subs), recent form, venue and referee, possession and 16 head-to-head stats, lineups on a pitch with real player photos, and the league table with both clubs highlighted.
- **Tables:** every competition with qualification and relegation zones; MLS conferences and the UCL league phase are supported.
- **Stats:** league KPIs, the Golden Boot leader with a player cutout, top scorers and assists, an attack-vs-defence scatter of club crests, and a goal-difference chart.
- **Clubs:** a hero with real club photography, season tiles, fixtures and results, and the full squad with photos, ages and nationalities.
- **Player cards:** photo, age, nation, height, shirt number, a per-competition season breakdown, and a short bio.
- **News:** the latest stories with photography for each league.
- **Design:** frosted glass, ambient light, spring motion, light and dark themes (automatic or manual), safe-area aware, honours `prefers-reduced-motion`.

## Data and imagery

| What | Source |
|---|---|
| Scores, events, lineups, stats, tables, news, club crests, league logos, flags | ESPN public site API (`site.api.espn.com`) |
| Player cutouts and photos, club fan art, stadium photos | TheSportsDB (free tier) |
| Player photo fallback | Wikipedia / Wikimedia Commons |

All third-party calls go through the Cloudflare Worker in [`worker/index.ts`](worker/index.ts). It allow-lists ESPN paths, normalises and merges scoreboards, trims heavy payloads, and caches at three levels: isolate memory, the Cache API, and Workers KV for player and club lookups. That last cache keeps the site well inside TheSportsDB's rate limit.

## Stack

- React 18 + TypeScript + Vite
- No UI framework, just a hand-built design system in [`src/styles/global.css`](src/styles/global.css)
- Cloudflare Workers with static assets and a KV namespace (`PITCH_CACHE`)

## Platform

### Install as an app (PWA)

Pitch ships a web app manifest (`public/manifest.webmanifest`, icons in `public/icons/`) and a service worker (`public/sw.js`):

- **Navigations** are network-first with an offline fallback to the cached app shell.
- **`/assets/*`** (content-hashed) are cache-first; **`/api/*`** is network-first with a 4.5 s timeout and falls back to the last good response (never `/api/live*`, `/api/collect`, `/api/insights` or `/api/og`).
- **Crests, flags and photos** (ESPN, TheSportsDB, flagcdn, Wikimedia) are stale-while-revalidate, capped at 180 entries.
- Caches are versioned; old ones are removed when a new worker activates. When a new deploy is available, open tabs show **“Update available — Refresh”**.
- The worker is registered only in production builds and not on `localhost` / `127.0.0.1` unless you add `?sw=1`.

Settings has an **Install Pitch** card: a one-tap install button where the browser supports it, Share → *Add to Home Screen* steps on iPhone and iPad, and an “installed” state when Pitch runs as an app.

### Embeddable widget

`/widget` renders a compact glass card with no app chrome. It refreshes every 30 seconds, and every link opens Pitch in a new tab.

```html
<!-- A club: live match, otherwise next fixture and last result -->
<iframe src="https://YOUR-DOMAIN/widget?team=364&league=eng.1&theme=auto"
        title="Liverpool on Pitch" width="380" height="300" style="border:0" loading="lazy"></iframe>

<!-- Today's matches in one or more competitions -->
<iframe src="https://YOUR-DOMAIN/widget?leagues=eng.1,uefa.champions&theme=dark&accent=ff375f"
        title="Today on Pitch" width="380" height="520" style="border:0" loading="lazy"></iframe>

<!-- Optional: let the iframe grow to fit the card -->
<script>
  addEventListener("message", (e) => {
    if (e.origin === "https://YOUR-DOMAIN" && e.data?.type === "pitch:widget:height")
      document.querySelectorAll('iframe[src^="https://YOUR-DOMAIN/widget"]').forEach((f) => {
        if (f.contentWindow === e.source) f.style.height = e.data.height + "px";
      });
  });
</script>
```

| Parameter | Meaning |
|---|---|
| `team` + `league` | ESPN team id and competition slug, e.g. `team=364&league=eng.1` (Liverpool) |
| `leagues` | Comma-separated slugs: `eng.1 esp.1 ita.1 ger.1 fra.1 uefa.champions uefa.europa usa.1 ned.1 por.1 ind.1` (default: all) |
| `theme` | `light`, `dark` or `auto` (follows the visitor's device) |
| `accent` | Hex colour without `#`, e.g. `ff375f` |

**JSON feed.** `GET /api/widget` takes the same `team`/`league`/`leagues` parameters. It is CORS-enabled and cached for 20 seconds.

```jsonc
// /api/widget?team=364&league=eng.1
{ "mode": "team",
  "team": { "id": "364", "league": "eng.1", "name": "Liverpool", "short": "Liverpool", "abbr": "LIV", "logo": "…", "color": "#d11317", "url": "/team/eng.1/364" },
  "live": null,                      // WidgetMatch while the club is playing
  "next": { /* WidgetMatch */ },     // next fixture (any supported competition)
  "last": { /* WidgetMatch */ },     // most recent result
  "updated": "2026-10-14T09:00:00.000Z" }

// /api/widget?leagues=eng.1,esp.1
{ "mode": "leagues", "leagues": ["eng.1", "esp.1"], "live": 2,
  "matches": [ /* WidgetMatch: live first, then upcoming (next 24 h), then finished (last 14 h) */ ],
  "updated": "…" }

// WidgetMatch
{ "id": "401879264", "league": { "slug": "eng.1", "name": "Premier League", "logo": "…" },
  "date": "2026-10-11T15:30Z", "state": "pre | in | post", "status": "FT", "clock": "67'", "off": false,
  "home": { "id": "364", "name": "Liverpool", "short": "Liverpool", "abbr": "LIV", "logo": "…", "color": "#d11317", "score": 0, "pens": null },
  "away": { … }, "url": "/match/eng.1/401879264" }
```

Invalid input returns `400` with an explanation.

### Link previews and share images

Shared links to matches, clubs, players, stadiums, tables, stats and news unfurl with their own title, description and a 1200×630 card. `worker/meta.ts` rewrites the page `<head>` with `HTMLRewriter` (title, description, Open Graph, `twitter:card=summary_large_image` and the canonical URL):

- Section pages need no lookups. Match, club and player facts come from the `Renderer` Durable Object, with a hard 400 ms budget for crawlers. People in a browser never wait: they get whatever is already cached, and the lookup warms the cache in the background. On any error the page is served unchanged.
- Cards are drawn by `GET /api/og/match/:league/:id.png`, `/api/og/team/:league/:id.png`, `/api/og/player/:league/:id.png`, `/api/og/league/:league.png` and `/api/og/brand.png`. Rendering (satori → SVG → resvg-wasm → PNG) runs in the `Renderer` Durable Object, never in the Worker. Inter fonts (fetched once from jsDelivr), crests and finished PNGs are cached in the object's SQLite storage, keyed by content: a new score or kick-off status produces a new card. Responses carry long `Cache-Control` headers (live 60 s, upcoming 30 min, finished 1 day, league and brand cards 7 days).
- If rendering ever fails, the static `public/og-default.png` is served instead.

### Private insights

Pitch counts page views without cookies or personal data:

- `src/platform/analytics.ts` sends one beacon per route change to `POST /api/collect`. It contains only the section (`/match`, never the full URL), the competition, an external referrer's domain, the app language, the theme, whether Pitch is installed, and a per-tab "first view of this visit" flag.
- The Worker adds a device class (derived from the user agent, which is then discarded) and the country (from Cloudflare). The `InsightsStore` Durable Object only adds these to daily counters.
- No IP addresses, identifiers or timestamps finer than a UTC day are stored. Do Not Track and Global Privacy Control turn collection off, and crawlers are ignored.

To switch the dashboard on, set a long random key and open `/insights`:

```bash
npx wrangler secret put INSIGHTS_KEY      # e.g. the output of: openssl rand -base64 32
```

`GET /api/insights?days=30` with `Authorization: Bearer <key>` returns the aggregates:

| Response | When |
|---|---|
| `200` | Correct key |
| `401` | Wrong key (compared in constant time; repeated failures are throttled) |
| `503 {"error":"not configured"}` | The secret isn't set |

The key is kept in `sessionStorage` for the current tab only. For local development, put `INSIGHTS_KEY=localtest` in `.dev.vars`, which is git-ignored.

### Continuous deployment

`.github/workflows/deploy.yml`:

- **Pull requests:** typecheck, build, and a `wrangler deploy --dry-run` bundle check.
- **Pushes to `main`:** typecheck, build, then deploy with `cloudflare/wrangler-action@v3`.

Setup (one time):

1. In the Cloudflare dashboard, open **My Profile → API Tokens → Create Token** and start from the **Edit Cloudflare Workers** template (or a custom token). Give it these permissions on your account:
   - *Account → Workers Scripts → Edit*
   - *Account → Workers KV Storage → Edit*
   - *Account → Account Settings → Read*
   - *Account → Workers Durable Objects → Edit* (some dashboards list this under *Workers Scripts*)

   If you deploy to a custom domain, also add *Zone → Workers Routes → Edit* for that zone.
2. Copy your **Account ID** from the right-hand sidebar of the Workers & Pages overview.
3. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Set Worker secrets such as `INSIGHTS_KEY` once with `wrangler secret put`. Deploys keep them.

## Develop

```bash
npm install
npm run build && npx wrangler dev   # app + API on http://127.0.0.1:8787
# or, for hot reload: run `npx wrangler dev` and `npm run dev` side by side (Vite proxies /api)
```

## Deploy

```bash
npm run deploy   # vite build + wrangler deploy
```

Logos, crests and photographs are the property of their respective owners and are used here for identification.
