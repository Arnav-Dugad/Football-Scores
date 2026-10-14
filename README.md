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
