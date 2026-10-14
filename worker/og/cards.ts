import { LIVE_CLOCK, kickoff, leagueName, statusLabel, type MatchFacts, type PlayerFacts, type TeamFacts } from "./data";
import { LEAGUE_FACTS } from "./leagues";

/* 1200×630 share cards as satori element trees (React-element-shaped objects).
   Images arrive pre-resolved as data URLs so satori never fetches. */

export const W = 1200;
export const H = 630;

type Style = Record<string, string | number>;
export interface El {
  type: string;
  props: { style?: Style; children?: unknown; [k: string]: unknown };
}
type Child = El | string | null | undefined | false;

function h(type: string, style: Style, ...children: Child[]): El {
  const kids = children.filter((c): c is El | string => c !== null && c !== undefined && c !== false);
  return { type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: kids.length === 1 ? kids[0] : kids } };
}
function img(src: string, size: number, style: Style = {}): El {
  return { type: "img", props: { src, width: size, height: size, style: { width: size, height: size, objectFit: "contain", ...style } } };
}

/** Images keyed by URL → data URL (or missing). */
export type Images = Record<string, string | undefined>;

const BRAND_SVG =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34c759"/><stop offset=".65" stop-color="#0a84ff"/><stop offset="1" stop-color="#5e5ce6"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"><rect x="12" y="15" width="40" height="34" rx="6"/><path d="M32 15v34"/><circle cx="32" cy="32" r="6.5"/></g></svg>`,
  );

/* ------------------------------------------------------------ colour --- */

function rgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
/** A team colour that glows on near-black: lift very dark colours, tame near-white ones. */
function glow(hex: string | null | undefined, fallback: string): string {
  const c = rgb(hex) ?? rgb(fallback)!;
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  let [r, g, b] = c;
  if (lum < 0.12) [r, g, b] = [r + (255 - r) * 0.28, g + (255 - g) * 0.28, b + (255 - b) * 0.28];
  if (lum > 0.85) [r, g, b] = [r * 0.8, g * 0.8, b * 0.8];
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
const alpha = (rgbStr: string, a: number) => rgbStr.replace("rgb(", "rgba(").replace(")", `, ${a})`);

function backdrop(left: string, right: string): Style {
  return {
    backgroundColor: "#060609",
    backgroundImage: [
      `radial-gradient(circle at 12% 30%, ${alpha(left, 0.75)} 0%, ${alpha(left, 0)} 55%)`,
      `radial-gradient(circle at 88% 70%, ${alpha(right, 0.75)} 0%, ${alpha(right, 0)} 55%)`,
      `linear-gradient(160deg, #15151c 0%, #060609 100%)`,
    ].join(", "),
  };
}

/* ------------------------------------------------------------ pieces --- */

const WHITE_60 = "rgba(255, 255, 255, 0.62)";
const WHITE_40 = "rgba(255, 255, 255, 0.42)";

function brand(): El {
  return h("div", { alignItems: "center", gap: 14 }, img(BRAND_SVG, 52, { borderRadius: 12 }), h("div", { fontSize: 34, fontWeight: 800, letterSpacing: -1 }, "Pitch"));
}

function leagueChip(slug: string, images: Images, extra?: string): El {
  const logo = images[`league:${slug}`];
  return h(
    "div",
    { alignItems: "center", gap: 18 },
    logo
      ? h("div", { width: 60, height: 60, borderRadius: 16, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" }, img(logo, 44))
      : null,
    h("div", { fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }, leagueName(slug)),
    extra ? h("div", { fontSize: 30, fontWeight: 500, color: WHITE_60 }, `·  ${extra}`) : null,
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L} ]/gu, "").split(" ").filter(Boolean);
  if (!parts.length) return "?";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function crestTile(src: string | undefined, name: string, size: number): El {
  return h(
    "div",
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      // Crests are drawn for white backgrounds: a frosted white tile keeps every one legible.
      backgroundColor: src ? "rgba(255, 255, 255, 0.94)" : "rgba(255, 255, 255, 0.12)",
      border: "1.5px solid rgba(255, 255, 255, 0.5)",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 30px 60px rgba(0, 0, 0, 0.45)",
    },
    src ? img(src, Math.round(size * 0.66)) : h("div", { fontSize: size * 0.3, fontWeight: 800 }, initials(name)),
  );
}

function pill(text: string, opts: { live?: boolean } = {}): El {
  return h(
    "div",
    {
      alignItems: "center",
      gap: 12,
      padding: "12px 26px",
      borderRadius: 999,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: 0.5,
      backgroundColor: opts.live ? "#ff3b30" : "rgba(255, 255, 255, 0.14)",
      border: opts.live ? "0px solid transparent" : "1px solid rgba(255, 255, 255, 0.2)",
    },
    opts.live ? h("div", { width: 12, height: 12, borderRadius: 6, backgroundColor: "#ffffff" }) : null,
    text,
  );
}

function fit(name: string, base: number, max: number): number {
  return name.length <= max ? base : Math.max(Math.round(base * 0.62), Math.round((base * max) / name.length));
}

function frame(style: Style, ...children: Child[]): El {
  return h(
    "div",
    { width: W, height: H, flexDirection: "column", padding: "52px 64px", color: "#ffffff", fontFamily: "Inter", ...style },
    ...children,
  );
}

/* ------------------------------------------------------------- cards --- */

export function matchCard(m: MatchFacts, images: Images): El {
  const tint = LEAGUE_FACTS[m.league]?.tint ?? "#0a84ff";
  const k = kickoff(m.date, m.league);
  const live = m.state === "in";
  const scored = m.state !== "pre" && m.hs !== null && m.as !== null;
  const postponed = /POSTPONED|CANCEL|ABANDON/.test(m.status);

  const team = (s: MatchFacts["home"]) =>
    h(
      "div",
      { width: 330, flexDirection: "column", alignItems: "center", gap: 26 },
      crestTile(images[`crest:${s.id}`], s.name, 210),
      h("div", { fontSize: fit(s.name, 40, 16), fontWeight: 700, letterSpacing: -0.8, textAlign: "center", justifyContent: "center", lineHeight: 1.1 }, s.name),
    );

  const centre = scored
    ? h(
        "div",
        { flexDirection: "column", alignItems: "center", gap: 18 },
        h("div", { fontSize: 156, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }, `${m.hs}–${m.as}`),
        m.hp !== null && m.ap !== null ? h("div", { fontSize: 28, fontWeight: 600, color: WHITE_60 }, `${m.hp}–${m.ap} on penalties`) : null,
        pill(live ? (LIVE_CLOCK(m) === "HT" ? "HALF-TIME" : `LIVE  ${LIVE_CLOCK(m)}`) : statusLabel(m).toUpperCase(), { live }),
      )
    : h(
        "div",
        { flexDirection: "column", alignItems: "center", gap: 14 },
        h("div", { fontSize: postponed ? 72 : 128, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }, postponed ? statusLabel(m) : k.time || "vs"),
        h("div", { fontSize: 30, fontWeight: 600, color: WHITE_60 }, [k.day, postponed ? "" : k.zone].filter(Boolean).join("  ·  ")),
      );

  return frame(
    backdrop(glow(m.home.color, tint), glow(m.away.color, tint)),
    h("div", { justifyContent: "space-between", alignItems: "center" }, leagueChip(m.league, images, k.day), brand()),
    h("div", { flex: 1, alignItems: "center", justifyContent: "space-between" }, team(m.home), centre, team(m.away)),
    h(
      "div",
      { justifyContent: "space-between", alignItems: "center", fontSize: 24, fontWeight: 500, color: WHITE_40 },
      h("div", {}, m.venue || "Live scores, lineups & stats"),
      h("div", {}, "Football, beautifully."),
    ),
  );
}

export function teamCard(t: TeamFacts, images: Images, venue = ""): El {
  const tint = LEAGUE_FACTS[t.league]?.tint ?? "#0a84ff";
  const c = glow(t.color, tint);
  const pills: El[] = [];
  if (t.standing) pills.push(pill(t.standing.replace(/^(\d+\w{2}) in (.+)$/, "$1  ·  $2")));
  if (t.record) pills.push(pill(t.points !== null ? `${t.record}  ·  ${t.points} pts` : t.record));
  return frame(
    backdrop(c, glow(t.alt && t.alt !== "#ffffff" && t.alt !== "#000000" ? t.alt : null, tint)),
    h("div", { justifyContent: "space-between", alignItems: "center" }, leagueChip(t.league, images), brand()),
    h(
      "div",
      { flex: 1, alignItems: "center", gap: 64 },
      crestTile(images[`crest:${t.id}`], t.name, 330),
      h(
        "div",
        { flexDirection: "column", gap: 22, flex: 1 },
        h("div", { fontSize: 28, fontWeight: 600, color: WHITE_60, letterSpacing: 3 }, venue ? venue.toUpperCase() : "CLUB"),
        h("div", { fontSize: fit(t.name, 88, 14), fontWeight: 800, letterSpacing: -3, lineHeight: 1 }, t.name),
        pills.length ? h("div", { gap: 14, flexWrap: "wrap" }, ...pills) : null,
      ),
    ),
    h("div", { fontSize: 24, fontWeight: 500, color: WHITE_40 }, "Fixtures, results, squad & stats on Pitch"),
  );
}

export function playerCard(p: PlayerFacts, images: Images): El {
  const tint = LEAGUE_FACTS[p.league]?.tint ?? "#0a84ff";
  const c = glow(p.team?.color, tint);
  const photo = images[`photo:${p.id}`];
  const crest = p.team ? images[`crest:${p.team.id}`] : undefined;
  const facts = [p.nationality, p.age ? `${p.age} yrs` : "", p.jersey ? `#${p.jersey}` : ""].filter(Boolean);
  return frame(
    backdrop(c, glow(null, tint)),
    h("div", { justifyContent: "space-between", alignItems: "center" }, leagueChip(p.league, images), brand()),
    h(
      "div",
      { flex: 1, alignItems: "center", gap: 64 },
      photo
        ? h(
            "div",
            {
              width: 330,
              height: 330,
              borderRadius: 165,
              overflow: "hidden",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              border: "1.5px solid rgba(255, 255, 255, 0.22)",
              alignItems: "flex-end",
              justifyContent: "center",
            },
            { type: "img", props: { src: photo, width: 330, height: 240, style: { width: 330, height: 240, objectFit: "cover" } } },
          )
        : crestTile(crest, p.team?.name ?? p.name, 330),
      h(
        "div",
        { flexDirection: "column", gap: 22, flex: 1 },
        h(
          "div",
          { alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, color: WHITE_60, letterSpacing: 3 },
          photo && crest ? img(crest, 40) : null,
          [p.position, p.team?.name].filter(Boolean).join("  ·  ").toUpperCase() || "PLAYER",
        ),
        h("div", { fontSize: fit(p.name, 88, 14), fontWeight: 800, letterSpacing: -3, lineHeight: 1 }, p.name),
        facts.length ? h("div", { gap: 14, flexWrap: "wrap" }, ...facts.map((f) => pill(f))) : null,
      ),
    ),
    h("div", { fontSize: 24, fontWeight: 500, color: WHITE_40 }, "Season stats, shot map & career on Pitch"),
  );
}

export function leagueCard(slug: string, images: Images): El {
  const tint = glow(LEAGUE_FACTS[slug]?.tint, "#0a84ff");
  const logo = images[`league:${slug}`];
  return frame(
    backdrop(tint, glow("#0a84ff", "#0a84ff")),
    h("div", { justifyContent: "flex-end" }, brand()),
    h(
      "div",
      { flex: 1, alignItems: "center", gap: 64 },
      h(
        "div",
        { width: 300, height: 300, borderRadius: 72, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px rgba(0, 0, 0, 0.45)" },
        logo ? img(logo, 220) : null,
      ),
      h(
        "div",
        { flexDirection: "column", gap: 20, flex: 1 },
        h("div", { fontSize: fit(leagueName(slug), 92, 14), fontWeight: 800, letterSpacing: -3, lineHeight: 1 }, leagueName(slug)),
        h("div", { fontSize: 36, fontWeight: 500, color: WHITE_60, lineHeight: 1.3 }, "Live scores, tables, stats & news"),
      ),
    ),
    h("div", { fontSize: 24, fontWeight: 500, color: WHITE_40 }, "Football, beautifully."),
  );
}

export function brandCard(): El {
  return frame(
    backdrop(glow("#34c759", "#34c759"), glow("#5e5ce6", "#5e5ce6")),
    h(
      "div",
      { flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 },
      img(BRAND_SVG, 168, { borderRadius: 40 }),
      h("div", { fontSize: 128, fontWeight: 800, letterSpacing: -5, lineHeight: 1 }, "Pitch"),
      h("div", { fontSize: 42, fontWeight: 500, color: WHITE_60 }, "Football, beautifully."),
      h("div", { gap: 14, marginTop: 10 }, pill("Live scores"), pill("Lineups"), pill("Tables"), pill("xG & analytics")),
    ),
  );
}
