export interface League {
  slug: string;
  name: string;
  short: string;
  region: string;
  logoId: number;
  /** Table zones are labelled by ESPN; this is just for the stats hero tint. */
  tint: string;
  /** Knockout cups have no league table or season analytics. */
  kind?: "league" | "cup";
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
  { slug: "ksa.1", name: "Saudi Pro League", short: "Saudi Pro League", region: "Saudi Arabia", logoId: 2488, tint: "#0a7a3b" },
  { slug: "mex.1", name: "Liga MX", short: "Liga MX", region: "Mexico", logoId: 22, tint: "#1d1d1b" },
  { slug: "aus.1", name: "A-League Men", short: "A-League", region: "Australia", logoId: 1308, tint: "#e1251b" },
  { slug: "eng.fa", name: "FA Cup", short: "FA Cup", region: "England", logoId: 40, tint: "#1b3f8f", kind: "cup" },
  { slug: "esp.copa_del_rey", name: "Copa del Rey", short: "Copa del Rey", region: "Spain", logoId: 80, tint: "#c8102e", kind: "cup" },
  { slug: "ita.coppa_italia", name: "Coppa Italia", short: "Coppa Italia", region: "Italy", logoId: 2192, tint: "#0067b1", kind: "cup" },
  { slug: "ger.dfb_pokal", name: "DFB-Pokal", short: "DFB-Pokal", region: "Germany", logoId: 2061, tint: "#5b5b5b", kind: "cup" },
];

/** Competitions with a league table (tables, stats, projections, club pickers). */
export const TABLE_LEAGUES = LEAGUES.filter((l) => l.kind !== "cup");
export const isCup = (slug: string) => LEAGUE_BY_SLUG[slug]?.kind === "cup";

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
