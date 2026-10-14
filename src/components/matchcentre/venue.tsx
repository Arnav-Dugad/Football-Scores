import { useMemo } from "react";
import { t } from "../../i18n";
import { endpoints, type SummaryData, type TeamInfo } from "../../lib/api";
import { fmtNum, fmtTimeIn } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { useSettings } from "../../lib/settings";

/* Stadium context: club photography (live backdrop), stadium coordinates and
   time zone, and the Open-Meteo forecast for kick-off. */

interface VenueInfo {
  found: boolean;
  name?: string;
  timezone?: string | null;
  coords?: { lat: number; lon: number } | null;
  photos?: string[];
}

interface GeoResult {
  results?: { latitude: number; longitude: number; timezone?: string; country?: string; admin1?: string; name: string }[];
}

interface Forecast {
  hourly?: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    weather_code: (number | null)[];
    wind_speed_10m: (number | null)[];
    is_day?: (number | null)[];
  };
}

export interface Weather {
  temp: number;
  unit: "C" | "F";
  rain: number | null;
  wind: number | null;
  windUnit: string;
  code: number;
  day: boolean;
}

const squash = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function validZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz }).format(0);
    return tz;
  } catch {
    return null;
  }
}

const DAY = 86400e3;

export function useVenueContext(s: SummaryData | null, country: string, opts: { backdrop: boolean }) {
  const [settings] = useSettings();
  const m = s?.match;
  const until = m ? Date.parse(m.date) - Date.now() : NaN;
  const pre = !!m && m.state === "pre" && !/POSTPONED|CANCEL|ABANDON|SUSPEND/i.test(m.statusName);
  const forecastable = pre && Number.isFinite(until) && until > -3 * 3600e3 && until < 15 * DAY;
  const needTeam = !!m && (forecastable || pre || opts.backdrop);

  const team = useApi<TeamInfo>(needTeam && m ? endpoints.teamInfo(m.home.id, m.home.name) : null);
  const ti = team.data;
  const homeGround = !!ti?.found && (!m?.venue || !ti.stadium || squash(ti.stadium).includes(squash(m.venue)) || squash(m.venue).includes(squash(ti.stadium)));
  const venue = useApi<VenueInfo>(pre && homeGround && ti?.venueId ? endpoints.venue(ti.venueId) : null);

  const venueCoords = homeGround && venue.data?.found ? venue.data.coords ?? null : null;
  const venueZone = homeGround && venue.data?.found ? validZone(venue.data.timezone) : null;
  const venueSettled = !pre || !needTeam || (!team.loading && (!homeGround || !ti?.venueId || !venue.loading));
  const needGeo = pre && !!m?.city && venueSettled && (!venueCoords || !venueZone);
  const geo = useApi<GeoResult>(
    needGeo && m ? `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(m.city)}&count=5&language=en&format=json` : null,
  );
  const place = useMemo(() => {
    const list = geo.data?.results ?? [];
    const c = squash(country);
    return list.find((r) => c && (squash(r.country) === c || squash(r.admin1) === c)) ?? list[0] ?? null;
  }, [geo.data, country]);

  const coords = venueCoords ?? (place ? { lat: place.latitude, lon: place.longitude } : null);
  const timezone = venueZone ?? validZone(place?.timezone);

  const us = settings.country === "US";
  const day = m ? new Date(m.date).toISOString().slice(0, 10) : "";
  const forecast = useApi<Forecast>(
    forecastable && coords
      ? `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat.toFixed(3)}&longitude=${coords.lon.toFixed(3)}` +
          `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,is_day&timezone=GMT&start_date=${day}&end_date=${day}` +
          (us ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "")
      : null,
  );

  const weather = useMemo<Weather | null>(() => {
    const h = forecast.data?.hourly;
    if (!h?.time?.length || !m) return null;
    const ko = Date.parse(m.date);
    let best = -1;
    let gap = Infinity;
    h.time.forEach((tm, i) => {
      const d = Math.abs(Date.parse(`${tm}:00Z`) - ko);
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    const temp = h.temperature_2m?.[best];
    const code = h.weather_code?.[best];
    if (best < 0 || gap > 2 * 3600e3 || temp == null || code == null) return null;
    return {
      temp,
      unit: us ? "F" : "C",
      rain: h.precipitation_probability?.[best] ?? null,
      wind: h.wind_speed_10m?.[best] ?? null,
      windUnit: us ? "mph" : "km/h",
      code,
      day: (h.is_day?.[best] ?? 1) === 1,
    };
  }, [forecast.data, m, us]);

  const photo = ti?.found ? ti.stadiumPhoto || ti.fanart?.[0] || null : null;
  return {
    photo,
    timezone,
    weather,
    weatherLoading: forecastable && (team.loading || venue.loading || geo.loading || forecast.loading),
    forecastable,
  };
}

/** "17:30 at the stadium" when the stadium's zone shows a different clock to the viewer's. */
export function stadiumTime(iso: string, tz: string | null): string | null {
  if (!tz) return null;
  try {
    const here = fmtTimeIn(iso, Intl.DateTimeFormat().resolvedOptions().timeZone);
    const there = fmtTimeIn(iso, tz);
    return here === there ? null : there;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- weather -- */

export function weatherLabel(code: number): string {
  if (code === 0) return t("weather::Clear");
  if (code <= 2) return t("Partly cloudy");
  if (code === 3) return t("Overcast");
  if (code === 45 || code === 48) return t("Fog");
  if (code >= 51 && code <= 57) return t("Drizzle");
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code >= 80 ? t("Showers") : t("Rain");
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return t("Snow");
  if (code >= 95) return t("Thunderstorms");
  return t("Cloudy");
}

type WKind = "clear" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";
function kindOf(code: number): WKind {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloud";
}

/** Crafted weather glyphs: sun/moon, layered cloud, precipitation. */
export function WeatherIcon({ code, day = true, size = 40 }: { code: number; day?: boolean; size?: number }) {
  const k = kindOf(code);
  const sky = k === "clear" || k === "partly";
  const orb = day ? (
    <g className="wx-sun">
      <circle cx={k === "clear" ? 24 : 17} cy={k === "clear" ? 24 : 17} r={k === "clear" ? 9 : 7} fill="url(#wx-sun)" />
      <g stroke="var(--wx-sun-ray)" strokeWidth="2.2" strokeLinecap="round" className="wx-rays">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          const c = k === "clear" ? 24 : 17;
          const r1 = k === "clear" ? 13 : 10.5;
          const r2 = k === "clear" ? 17 : 13.5;
          return <line key={i} x1={c + Math.cos(a) * r1} y1={c + Math.sin(a) * r1} x2={c + Math.cos(a) * r2} y2={c + Math.sin(a) * r2} />;
        })}
      </g>
    </g>
  ) : (
    <path
      d={k === "clear" ? "M28 12a12 12 0 1 0 8 20 10 10 0 0 1-8-20Z" : "M20 8a9 9 0 1 0 6 15 7.5 7.5 0 0 1-6-15Z"}
      fill="url(#wx-moon)"
    />
  );
  const cloud = (dark: boolean, y = 0) => (
    <path
      transform={`translate(0 ${y})`}
      d="M14 34h21a8 8 0 0 0 .6-16 11 11 0 0 0-21 2.6A6.8 6.8 0 0 0 14 34Z"
      fill={dark ? "url(#wx-cloud-dark)" : "url(#wx-cloud)"}
      stroke="var(--wx-cloud-edge)"
      strokeWidth="0.6"
    />
  );
  const drops = (n: number, len: number, cls: string) => (
    <g className={cls} stroke="var(--wx-rain)" strokeWidth="2" strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={17 + i * 7} y1={38} x2={15 + i * 7} y2={38 + len} />
      ))}
    </g>
  );
  return (
    <svg className={`wx wx-${k}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id="wx-sun" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffe28a" />
          <stop offset="1" stopColor="#ffb300" />
        </radialGradient>
        <linearGradient id="wx-moon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6d5" />
          <stop offset="1" stopColor="#d9c98f" />
        </linearGradient>
        <linearGradient id="wx-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--wx-cloud-top)" />
          <stop offset="1" stopColor="var(--wx-cloud-bottom)" />
        </linearGradient>
        <linearGradient id="wx-cloud-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--wx-storm-top)" />
          <stop offset="1" stopColor="var(--wx-storm-bottom)" />
        </linearGradient>
      </defs>
      {sky && orb}
      {k === "partly" && cloud(false, 4)}
      {(k === "cloud" || k === "fog") && cloud(false, -2)}
      {k === "fog" && (
        <g stroke="var(--wx-fog)" strokeWidth="2.2" strokeLinecap="round">
          <line x1="10" y1="38" x2="36" y2="38" />
          <line x1="14" y1="43" x2="40" y2="43" />
        </g>
      )}
      {(k === "drizzle" || k === "rain" || k === "snow" || k === "storm") && cloud(k === "storm" || k === "rain", -4)}
      {k === "drizzle" && drops(3, 3, "wx-drops")}
      {k === "rain" && drops(3, 7, "wx-drops")}
      {k === "snow" && (
        <g fill="var(--wx-snow)">
          {[17, 24, 31].map((x, i) => (
            <circle key={x} cx={x} cy={i === 1 ? 42 : 39} r="2" />
          ))}
        </g>
      )}
      {k === "storm" && <path d="M25 31l-5 8h5l-3 7 8-10h-5l3-5Z" fill="#ffcc00" stroke="#e0a800" strokeWidth="0.6" strokeLinejoin="round" />}
    </svg>
  );
}

export function tempLabel(w: Weather): string {
  return `${fmtNum(Math.round(w.temp))}°${w.unit}`;
}
