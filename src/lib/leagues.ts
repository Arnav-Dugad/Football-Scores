export interface League {
  slug: string;
  name: string;
  short: string;
  region: string;
  logoId: number;
  /** Table zones are labelled by ESPN; this is just for the stats hero tint. */
  tint: string;
}

export const LEAGUES: League[] = [
  { slug: "eng.1", name: "Premier League", short: "Premier League", region: "England", logoId: 23, tint: "#3d195b" },
  { slug: "esp.1", name: "LaLiga", short: "LaLiga", region: "Spain", logoId: 15, tint: "#ff4b44" },
  { slug: "ita.1", name: "Serie A", short: "Serie A", region: "Italy", logoId: 12, tint: "#008fd7" },
  { slug: "ger.1", name: "Bundesliga", short: "Bundesliga", region: "Germany", logoId: 10, tint: "#d20515" },
  { slug: "fra.1", name: "Ligue 1", short: "Ligue 1", region: "France", logoId: 9, tint: "#091c3e" },
  { slug: "uefa.champions", name: "Champions League", short: "UCL", region: "Europe", logoId: 2, tint: "#0b1d6f" },
  { slug: "uefa.europa", name: "Europa League", short: "UEL", region: "Europe", logoId: 2310, tint: "#f68e00" },
  { slug: "usa.1", name: "MLS", short: "MLS", region: "USA & Canada", logoId: 19, tint: "#001f5b" },
  { slug: "ned.1", name: "Eredivisie", short: "Eredivisie", region: "Netherlands", logoId: 11, tint: "#e30613" },
  { slug: "por.1", name: "Liga Portugal", short: "Liga Portugal", region: "Portugal", logoId: 14, tint: "#00a859" },
  { slug: "ind.1", name: "Indian Super League", short: "ISL", region: "India", logoId: 2334, tint: "#e94e1b" },
];

export const LEAGUE_BY_SLUG = Object.fromEntries(LEAGUES.map((l) => [l.slug, l])) as Record<string, League>;

export const DEFAULT_LEAGUE = "eng.1";

export function leagueLogo(slug: string, dark = false, size = 96): string {
  const l = LEAGUE_BY_SLUG[slug];
  if (!l) return "";
  return `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/${dark ? "500-dark" : "500"}/${l.logoId}.png&w=${size}&h=${size}`;
}

export function leagueOrder(slug: string): number {
  const i = LEAGUES.findIndex((l) => l.slug === slug);
  return i === -1 ? 99 : i;
}
