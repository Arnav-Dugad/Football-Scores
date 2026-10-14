import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { WireBroadcast } from "../../shared/scoreboard";
import { t } from "../i18n";
import { countryName } from "../lib/countries";
import { useSettings } from "../lib/settings";
import { IconExternal, IconTv } from "./Icons";
import { Flag } from "./prefs";

/* Where to watch — researched rights holders per competition and country
   (src/data/broadcasters.json, compiled from scripts/broadcasters/*.json),
   plus ESPN's per-match US listings where available. */

export interface Channel {
  name: string;
  domain: string;
  logo: string | null;
}
export interface Listing {
  c: string; // channel id
  url: string;
  type: "streaming" | "tv" | "free-tv";
  note: string;
}
export interface BroadcastData {
  updated: string;
  seasons: Record<string, string>;
  channels: Record<string, Channel>;
  leagues: Record<string, Record<string, Listing[]>>;
}

let data: BroadcastData | null = null;
let loading: Promise<BroadcastData> | null = null;

function loadBroadcasts(): Promise<BroadcastData> {
  if (data) return Promise.resolve(data);
  loading ??= import("../data/broadcasters.json").then((m) => (data = m.default as unknown as BroadcastData));
  return loading;
}

export function useBroadcasts(): BroadcastData | null {
  const [d, setD] = useState<BroadcastData | null>(data);
  useEffect(() => {
    if (!d) void loadBroadcasts().then(setD);
  }, [d]);
  return d;
}

export function listingsFor(d: BroadcastData | null, league: string, country: string | null) {
  if (!d || !country) return [];
  return (d.leagues[league]?.[country] ?? [])
    .map((l) => ({ ...l, channel: d.channels[l.c] }))
    .filter((l) => l.channel);
}

const TYPE_LABEL: Record<Listing["type"], string> = { streaming: "Streaming", tv: "TV", "free-tv": "Free-to-air" };

function Logo({ ch, size = 40 }: { ch: Channel; size?: number }) {
  const [err, setErr] = useState(false);
  return (
    <span className="tv-logo" style={{ width: size, height: size, borderRadius: size * 0.26 }}>
      {ch.logo && !err ? (
        <img src={ch.logo} alt="" loading="lazy" onError={() => setErr(true)} />
      ) : (
        <span className="tv-mono">{ch.name.replace(/[^A-Za-z0-9+]/g, "").slice(0, 3)}</span>
      )}
    </span>
  );
}

/** Full panel for the match page. */
export function WatchPanel({ league, broadcasts = [] }: { league: string; broadcasts?: WireBroadcast[] }) {
  const [s] = useSettings();
  const d = useBroadcasts();
  const list = listingsFor(d, league, s.country);
  const espnHere = s.country === "US" ? broadcasts.filter((b) => b.region === "us") : [];

  return (
    <section className="panel glass watch-panel" aria-labelledby="watch-title">
      <div className="watch-head">
        <p className="panel-title" id="watch-title">
          {t("Where to watch")}
        </p>
        <Link to="/settings" className="watch-country" aria-label={t("Change country")}>
          {s.country ? (
            <>
              <Flag code={s.country} size={18} />
              {countryName(s.country)}
            </>
          ) : (
            t("Set your country")
          )}
        </Link>
      </div>

      {espnHere.length > 0 && (
        <div className="watch-match">
          <span className="subtle">{t("This match")}</span>
          <div className="watch-tags">
            {espnHere.map((b) => (
              <span key={b.name + b.type} className="pill">
                <IconTv width={13} height={13} />
                {b.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {!s.country ? (
        <p className="muted watch-empty">{t("Choose your country in Settings to see broadcasters near you.")}</p>
      ) : !d ? (
        <div className="watch-list">
          {[0, 1].map((i) => (
            <div key={i} className="skel" style={{ height: 58, borderRadius: 16 }} />
          ))}
        </div>
      ) : list.length ? (
        <div className="watch-list">
          {list.map((l) => (
            <a key={l.c + l.url} className="watch-item" href={l.url} target="_blank" rel="noopener noreferrer">
              <Logo ch={l.channel} />
              <span className="grow">
                <b>{l.channel.name}</b>
                <small>
                  {t(TYPE_LABEL[l.type])}
                  {l.note ? ` · ${l.note}` : ""}
                </small>
              </span>
              <span className="watch-cta">
                {t("Watch")}
                <IconExternal width={14} height={14} />
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="muted watch-empty">{t("We don’t have a confirmed broadcaster for this competition in your country. Check local listings.")}</p>
      )}

      {d && (
        <p className="watch-foot">
          {t("Rights for the {season} season. Coverage can vary by match.", { season: d.seasons[league] ?? "2026-27" })}
        </p>
      )}
    </section>
  );
}

/** Compact logo strip for cards & heroes. Renders nothing without data. */
export function WatchStrip({ league, max = 3 }: { league: string; max?: number }) {
  const [s] = useSettings();
  const d = useBroadcasts();
  const list = listingsFor(d, league, s.country).slice(0, max);
  if (!list.length) return null;
  return (
    <span className="watch-strip" title={`${t("Where to watch")}: ${list.map((l) => l.channel.name).join(", ")}`}>
      <IconTv width={14} height={14} />
      {list.map((l) => (
        <Logo key={l.c} ch={l.channel} size={20} />
      ))}
    </span>
  );
}
