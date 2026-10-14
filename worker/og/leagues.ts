/* Server-side competition facts for share cards, link previews and the widget.
   Only these slugs are accepted by platform routes — every LeagueStore DO a
   request can reach must be one the cron already keeps warm. */

export interface LeagueFacts {
  name: string;
  /** Kick-off times on share cards are shown in the competition's home zone. */
  tz: string;
  locale: string;
  logoId: number;
  tint: string;
}

export const LEAGUE_FACTS: Record<string, LeagueFacts> = {
  "eng.1": { name: "Premier League", tz: "Europe/London", locale: "en-GB", logoId: 23, tint: "#3d195b" },
  "esp.1": { name: "LaLiga", tz: "Europe/Madrid", locale: "en-GB", logoId: 15, tint: "#ff4b44" },
  "ita.1": { name: "Serie A", tz: "Europe/Rome", locale: "en-GB", logoId: 12, tint: "#008fd7" },
  "ger.1": { name: "Bundesliga", tz: "Europe/Berlin", locale: "en-GB", logoId: 10, tint: "#d20515" },
  "fra.1": { name: "Ligue 1", tz: "Europe/Paris", locale: "en-GB", logoId: 9, tint: "#091c3e" },
  "uefa.champions": { name: "Champions League", tz: "Europe/Paris", locale: "en-GB", logoId: 2, tint: "#0b1d6f" },
  "uefa.europa": { name: "Europa League", tz: "Europe/Paris", locale: "en-GB", logoId: 2310, tint: "#f68e00" },
  "usa.1": { name: "MLS", tz: "America/New_York", locale: "en-US", logoId: 19, tint: "#001f5b" },
  "ned.1": { name: "Eredivisie", tz: "Europe/Amsterdam", locale: "en-GB", logoId: 11, tint: "#e30613" },
  "por.1": { name: "Liga Portugal", tz: "Europe/Lisbon", locale: "en-GB", logoId: 14, tint: "#00a859" },
  "ind.1": { name: "Indian Super League", tz: "Asia/Kolkata", locale: "en-IN", logoId: 2334, tint: "#e94e1b" },
};

export const isLeague = (slug: string | null | undefined): slug is string =>
  !!slug && Object.prototype.hasOwnProperty.call(LEAGUE_FACTS, slug);

export const isId = (id: string | null | undefined): id is string => !!id && /^\d{1,12}$/.test(id);

export function leagueLogoUrl(slug: string, size = 200): string {
  const l = LEAGUE_FACTS[slug];
  return l ? `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/${l.logoId}.png&w=${size}&h=${size}` : "";
}

export function crestUrl(teamId: string, size = 200): string {
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=${size}&h=${size}`;
}

/** Crawlers, link expanders and scripted clients (anything that isn't a person in a browser). */
export const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegram|skypeuripreview|nuzzel|discord|slack|linkedin|reddit|applebot|google|bing|yandex|duckduck|baidu|mastodon|bluesky|preview|headless|lighthouse|curl|wget|python|httpclient|okhttp|go-http|node-fetch|undici|axios|postman/i;

export function isBrowser(ua: string): boolean {
  return /Mozilla\/5\.0/.test(ua) && !BOT_RE.test(ua);
}
