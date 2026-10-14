import { useMemo, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { clubPalette } from "../components/club/color";
import {
  gamePlayed,
  gameResult,
  homeVenue,
  paragraphs,
  seasonVenueGames,
  useClubCore,
  useClubGames,
  useTeamInfo,
  websiteUrl,
  displayHost,
  type ClubGame,
  type VenueInfo,
} from "../components/club/data";
import { Gallery } from "../components/club/Gallery";
import { IconMap, IconStadium } from "../components/club/icons";
import { Countdown, CountTile, MiniEmpty, ResultBadge, scoreLine, SeasonBuilding, SectionHead, SkelRows } from "../components/club/ui";
import { IconChevronLeft, IconChevronRight, IconExternal, IconPin } from "../components/Icons";
import { Crest, Empty, ErrorState, Skeleton, tsdbSize } from "../components/ui";
import { t, tn } from "../i18n";
import { useAccent } from "../lib/accent";
import { endpoints } from "../lib/api";
import { fmtDayShort, fmtDow, fmtFull, fmtNum, fmtPct, fmtTime } from "../lib/format";
import { useApi, useDocumentTitle, useTheme } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";

export default function Stadium() {
  const { league = "eng.1", id = "" } = useParams();
  const nav = useNavigate();
  const { dark } = useTheme();
  const leagueName = LEAGUE_BY_SLUG[league]?.name ?? "";
  const club = useClubCore(league, id);
  const core = club.core;
  useAccent(core ? [core.color, core.alt] : null);
  const pal = useMemo(() => clubPalette(core?.color, core?.alt, dark), [core?.color, core?.alt, dark]);

  const { info, loading: infoLoading } = useTeamInfo(core);
  const vq = useApi<VenueInfo>(info?.venueId ? endpoints.venue(String(info.venueId).replace(/\D/g, "")) : null);
  const venue = vq.data?.found ? vq.data : null;
  const { season, games, loading: gamesLoading } = useClubGames(league, id, leagueName);
  const espnVenue = homeVenue(games, id);
  const name = venue?.name || info?.stadium || espnVenue;
  useDocumentTitle(name || (club.loading ? "" : t("Stadium")));

  const atVenue = useMemo(() => {
    const fromSeason = seasonVenueGames(season.data, espnVenue, league, leagueName);
    return fromSeason.length ? fromSeason : games.filter((g) => g.home.id === id);
  }, [season.data, espnVenue, league, leagueName, games, id]);

  const photos = useMemo(() => {
    const list = venue?.photos?.length ? venue.photos : info?.stadiumPhoto ? [info.stadiumPhoto] : [];
    return [...new Set(list.filter((u) => typeof u === "string" && /^https:\/\//.test(u)))];
  }, [venue, info]);

  const vars = { "--club": pal.accent, "--club-ink": pal.ink, "--on-club": pal.onAccent, "--club-hero": pal.hero, "--club-2": pal.second } as CSSProperties;
  const back = (
    <button type="button" className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(`/team/${league}/${id}`))}>
      <IconChevronLeft />
      {t("Back")}
    </button>
  );

  const resolving = club.loading || (!!core && infoLoading) || (!!info?.venueId && vq.loading);
  if (resolving && !name) {
    return (
      <div className="page cl-page" style={vars} aria-busy="true">
        {back}
        <div className="cl-gallery skel" aria-hidden="true" />
        <div className="tiles" style={{ marginTop: 16 }} aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} h={118} r={24} />
          ))}
        </div>
      </div>
    );
  }
  if (!core) {
    return (
      <div className="page cl-page">
        {back}
        {club.error ? (
          <ErrorState onRetry={club.reload} />
        ) : (
          <Empty icon={<IconStadium />} title={t("Stadium not found")}>
            {t("We couldn’t find this club’s home ground.")}
          </Empty>
        )}
      </div>
    );
  }
  if (!name) {
    return (
      <div className="page cl-page" style={vars}>
        {back}
        <Empty
          icon={<IconStadium />}
          title={t("No stadium details yet")}
          action={
            <Link className="btn" to={`/team/${league}/${id}`}>
              {t("Go to {club}", { club: core.name })}
            </Link>
          }
        >
          {gamesLoading ? t("Looking up the home ground…") : t("We couldn’t find a verified home ground for {club}.", { club: core.name })}
        </Empty>
      </div>
    );
  }

  const capacity = venue?.capacity ?? (Number(info?.capacity) || null);
  const opened = venue?.opened && /^\d{4}$/.test(String(venue.opened)) && Number(venue.opened) > 1800 ? String(venue.opened) : null;
  const baseLoc = (venue?.location || info?.location || "").trim();
  const country = (venue?.country || "").trim();
  const hasCountry = !country || baseLoc.toLowerCase().split(/\s*,\s*/).includes(country.toLowerCase());
  const location = [baseLoc, hasCountry ? "" : country].filter(Boolean).join(", ");
  const coords = validCoords(venue?.coords);
  const about = paragraphs(venue?.description, 1200);
  const site = websiteUrl(venue?.website);

  const played = atVenue.filter(gamePlayed);
  const upcoming = atVenue.filter((g) => g.state !== "post" && !g.void);
  const next = upcoming.find((g) => g.state === "in") ?? upcoming.find((g) => Date.parse(g.date) > Date.now() - 3 * 3600e3) ?? null;
  const withAtt = played.filter((g) => g.att != null && g.att > 0);
  const avgAtt = withAtt.length ? withAtt.reduce((a, g) => a + g.att!, 0) / withAtt.length : null;
  const record = withAtt.reduce<ClubGame | null>((best, g) => (!best || g.att! > best.att! ? g : best), null);
  const city = cityOf(venue?.location || info?.location, venue?.country);
  const tz = tzLabel(venue?.timezone);
  const facts: { k: string; label: string; value: string; sub: string; text?: boolean }[] = [];
  if (capacity && capacity > 0) facts.push({ k: "capacity", label: t("Capacity"), value: "", sub: "" });
  if (opened) facts.push({ k: "opened", label: t("Opened"), value: opened, sub: tn(new Date().getFullYear() - Number(opened), "{n} year ago", "{n} years ago") });
  if (venue?.cost) facts.push({ k: "cost", label: t("Construction cost"), value: venue.cost, sub: t("At the time of building"), text: true });
  if (city) facts.push({ k: "where", label: t("Location"), value: city, sub: tz || location, text: true });
  const wins = played.filter((g) => gameResult(g, id) === "W").length;
  const draws = played.filter((g) => gameResult(g, id) === "D").length;
  const losses = played.filter((g) => gameResult(g, id) === "L").length;

  return (
    <div className="page cl-page cl-stadium" style={vars}>
      {back}
      <Gallery photos={photos.map((p) => tsdbSize(p, "full") ?? p)} label={t("Photos of {stadium}", { stadium: name })}>
        <Link to={`/team/${league}/${id}`} className="cl-home-of">
          <span className="crest-chip">
            <Crest src={core.logo} size={22} alt="" />
          </span>
          {t("Home of {club}", { club: core.name })}
        </Link>
        <h1>{name}</h1>
        {venue?.alternate && venue.alternate !== name && <p className="cl-aka">{t("Also known as {name}", { name: venue.alternate.split(",")[0].trim() })}</p>}
      </Gallery>

      {facts.length > 0 && (
        <div className={`tiles cl-stadium-tiles n${facts.length}`}>
          {facts.map((f, i) =>
            f.k === "capacity" ? (
              <CountTile
                key={f.k}
                label={t("Capacity")}
                value={capacity}
                delay={i * 40}
                sub={avgAtt && capacity ? t("{p} full on average", { p: fillPct(avgAtt / capacity) }) : t("Seats")}
              />
            ) : (
              <div key={f.k} className="tile glass cl-tile" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="k">{f.label}</div>
                <div className={`v${f.text ? " cl-v-text" : ""}`} title={f.value}>
                  {f.value}
                </div>
                <div className="s" title={f.sub}>
                  {f.sub}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div className={`${about.length || site ? "cl-split" : "cl-solo"} cl-stack-top`}>
        <section className="panel glass cl-map-panel" aria-labelledby="cl-map">
          <p className="panel-title" id="cl-map">
            {t("Getting there")}
          </p>
          {coords ? (
            <div className="cl-map">
              <iframe
                title={t("Map of {stadium}", { stadium: name })}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${(coords.lon - 0.012).toFixed(5)},${(coords.lat - 0.007).toFixed(5)},${(coords.lon + 0.012).toFixed(5)},${(coords.lat + 0.007).toFixed(5)}&layer=mapnik&marker=${coords.lat.toFixed(5)},${coords.lon.toFixed(5)}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ) : (
            <div className="cl-map cl-map-empty">
              <IconMap />
              <span>{t("Map preview unavailable")}</span>
            </div>
          )}
          {location && (
            <p className="cl-addr">
              <IconPin width={15} height={15} />
              {location}
            </p>
          )}
          <div className="cl-map-btns">
            <a className="btn" href={appleMaps(name, location, coords)} target="_blank" rel="noopener noreferrer">
              {t("Open in Apple Maps")}
              <span className="sr-only">{t("(opens in a new tab)")}</span>
            </a>
            <a className="btn ghost" href={googleMaps(name, location, coords)} target="_blank" rel="noopener noreferrer">
              {t("Open in Google Maps")}
              <span className="sr-only">{t("(opens in a new tab)")}</span>
            </a>
          </div>
        </section>

        {(about.length > 0 || site) && (
          <section className="panel glass cl-about" aria-labelledby="cl-st-about">
            <p className="panel-title" id="cl-st-about">
              {t("About the stadium")}
            </p>
            {about.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {site && (
              <a href={site} target="_blank" rel="noopener noreferrer" className="link">
                {displayHost(site)}
                <IconExternal width={13} height={13} />
                <span className="sr-only">{t("(opens in a new tab)")}</span>
              </a>
            )}
            {about.length > 0 && <p className="subtle cl-foot">{t("Source: TheSportsDB")}</p>}
          </section>
        )}
      </div>

      <section className="section" aria-labelledby="cl-here">
        <SectionHead id="cl-here" title={t("This season here")} aside={<span className="subtle">{leagueName}</span>} />
        <SeasonBuilding progress={season.progress} building={season.building} />
        {next && (
          <Link to={`/match/${next.slug}/${next.id}`} className="cl-next-here glass">
            <span className="eyebrow">{next.state === "in" ? t("Live now") : t("Next match here")}</span>
            <span className="teams">
              <Crest src={next.home.logo} size={36} alt="" />
              <b>{next.home.short || next.home.name}</b>
              <span className="vs subtle">{t("vs")}</span>
              <b>{next.away.short || next.away.name}</b>
              <Crest src={next.away.logo} size={36} alt="" />
            </span>
            <span className="when muted">{fmtFull(next.date)}</span>
            {next.state === "pre" ? <Countdown to={next.date} /> : <span className="pill live">{t("Live")}</span>}
          </Link>
        )}
        <div className="tiles cl-stack-top">
          <CountTile label={t("Home record")} value={wins} render={(n) => <span className="num">{fmtNum(n)}<span className="cl-sep">·</span>{fmtNum(draws)}<span className="cl-sep">·</span>{fmtNum(losses)}</span>} sub={t("Won · Drawn · Lost")} />
          <CountTile label={t("Matches played")} value={played.length} delay={40} sub={tn(upcoming.length, "{n} still to come", "{n} still to come")} />
          <CountTile label={t("Average attendance")} value={avgAtt != null ? Math.round(avgAtt) : null} delay={80} sub={withAtt.length ? tn(withAtt.length, "From {n} match", "From {n} matches") : t("Not reported yet")} />
          <CountTile
            label={t("Record attendance")}
            value={record?.att ?? null}
            delay={120}
            sub={record ? `${record.home.id === id ? record.away.short || record.away.name : record.home.short || record.home.name} · ${fmtDayShort(record.date)}` : t("Not reported yet")}
          />
        </div>
        <div className="cl-stack-top">
          {gamesLoading ? (
            <SkelRows n={6} />
          ) : atVenue.length ? (
            <ul className="list glass cl-rows">
              {atVenue.map((g) => (
                <VenueRow key={g.id} g={g} teamId={id} />
              ))}
            </ul>
          ) : (
            <MiniEmpty>{t("No league matches scheduled here yet.")}</MiniEmpty>
          )}
        </div>
      </section>

      <Link to={`/team/${league}/${id}`} className="cl-back-club glass">
        <Crest src={core.logo} size={40} alt="" />
        <span className="grow">
          <b>{core.name}</b>
          <small className="muted">{t("Fixtures, squad and stats")}</small>
        </span>
        <IconChevronRight className="chev cl-flip" />
      </Link>
    </div>
  );
}

function VenueRow({ g, teamId }: { g: ClubGame; teamId: string }) {
  const r = gameResult(g, teamId);
  const d = new Date(g.date);
  return (
    <li>
      <Link to={`/match/${g.slug}/${g.id}`} className="row clickable cl-venue-row">
        <span className="cl-date" aria-hidden="true">
          <b className="num">{fmtNum(d.getDate())}</b>
          <small>{fmtDow(d)}</small>
        </span>
        <span className="grow">
          <span className="title cl-vs">
            <Crest src={g.home.logo} size={20} alt="" />
            <span>{g.home.short || g.home.name}</span>
            <span className="subtle">{gamePlayed(g) ? scoreLine(g) : t("vs")}</span>
            <span>{g.away.short || g.away.name}</span>
            <Crest src={g.away.logo} size={20} alt="" />
          </span>
          <span className="caption">
            {fmtDayShort(g.date)}
            {g.att ? ` · ${t("{n} attendance", { n: fmtNum(g.att) })}` : ""}
          </span>
        </span>
        <span className="cl-right">
          {r ? (
            <ResultBadge r={r} />
          ) : g.void ? (
            <span className="pill">{t("Postponed")}</span>
          ) : g.state === "in" ? (
            <span className="pill live">{t("Live")}</span>
          ) : g.state === "pre" ? (
            <span className="pill num">{fmtTime(g.date)}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function validCoords(c: { lat: number; lon: number } | null | undefined): { lat: number; lon: number } | null {
  if (!c) return null;
  const { lat, lon } = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180 || (Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001)) return null;
  return { lat, lon };
}

function appleMaps(name: string, location: string, c: { lat: number; lon: number } | null): string {
  const q = encodeURIComponent(name);
  return c ? `https://maps.apple.com/?ll=${c.lat.toFixed(6)},${c.lon.toFixed(6)}&q=${q}` : `https://maps.apple.com/?q=${encodeURIComponent([name, location].filter(Boolean).join(", "))}`;
}

function googleMaps(name: string, location: string, c: { lat: number; lon: number } | null): string {
  return c
    ? `https://www.google.com/maps/search/?api=1&query=${c.lat.toFixed(6)},${c.lon.toFixed(6)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, location].filter(Boolean).join(", "))}`;
}

/** Stadium fill: one decimal near capacity so 99.8% never reads as a sell-out. */
function fillPct(r: number): string {
  const v = Math.max(0, Math.min(1, r));
  return v >= 0.95 && v < 1 ? fmtPct(Math.min(v, 0.999), 1) : fmtPct(v);
}

/** Best-effort city from TheSportsDB's free-text location ("Holloway, London, England" → "London"). */
function cityOf(loc: string | null | undefined, country: string | null | undefined): string {
  if (!loc) return "";
  const drop = new Set(["england", "scotland", "wales", "spain", "italy", "germany", "france", "netherlands", "portugal", "india", "usa", "united states", "canada", "uk", "united kingdom"]);
  if (country) drop.add(country.toLowerCase());
  const parts = loc
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && !drop.has(x.toLowerCase()));
  if (!parts.length) return loc.split(",")[0].trim();
  // North American locations read "City, State".
  if (country && /united states|usa|canada/i.test(country)) return parts[0];
  return parts[parts.length - 1];
}

/** "UTC +01:00 Central European Time (CET)" → "UTC+01:00 · CET". */
function tzLabel(tz: string | null | undefined): string {
  if (!tz) return "";
  const off = /UTC\s*([+-−]\d{1,2}:\d{2})/.exec(tz)?.[1];
  const abbr = /\(([A-Z]{2,5})\)/.exec(tz)?.[1];
  if (off || abbr) return [off ? `UTC${off}` : "", abbr ?? ""].filter(Boolean).join(" · ");
  return tz.slice(0, 40);
}
