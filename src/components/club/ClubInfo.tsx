import { derbiesOf, rivalryHref } from "../../lib/rivals";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import type { TeamInfo } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { IconChevronRight, IconExternal, IconInfo, IconPin } from "../Icons";
import { Empty, Skeleton, tsdbSize } from "../ui";
import { displayHost, paragraphs, websiteUrl } from "./data";
import { IconShirt, IconStadium } from "./icons";
import { SectionHead } from "./ui";

export function ClubInfo({
  league,
  teamId,
  name,
  info,
  loading,
  venueName,
}: {
  league: string;
  teamId: string;
  name: string;
  info: TeamInfo | null;
  loading: boolean;
  venueName: string;
}) {
  if (loading) {
    return (
      <div className="cl-stack" aria-busy="true">
        <div className="cl-split">
          <Skeleton h={300} r={24} />
          <Skeleton h={300} r={24} />
        </div>
        <Skeleton h={260} r={28} />
      </div>
    );
  }
  const about = paragraphs(info?.description, 1100);
  const site = websiteUrl(info?.website);
  const formed = info?.formed && /^\d{4}$/.test(String(info.formed).trim()) && Number(info.formed) > 1800 ? String(info.formed).trim() : null;
  const stadium = info?.stadium || venueName;
  const capacity = Number(info?.capacity);
  const facts: { k: string; v: React.ReactNode }[] = [];
  if (formed) facts.push({ k: t("Founded"), v: <span className="num">{formed}</span> });
  if (info?.location) facts.push({ k: t("Based in"), v: info.location });
  if (stadium) facts.push({ k: t("Stadium"), v: stadium });
  if (Number.isFinite(capacity) && capacity > 0) facts.push({ k: t("Capacity"), v: <span className="num">{fmtNum(capacity)}</span> });
  if (site)
    facts.push({
      k: t("Website"),
      v: (
        <a href={site} target="_blank" rel="noopener noreferrer" className="link">
          {displayHost(site)}
          <IconExternal width={13} height={13} />
          <span className="sr-only">{t("(opens in a new tab)")}</span>
        </a>
      ),
    });

  return (
    <div className="cl-stack">
      {about.length > 0 || facts.length > 0 ? (
        <div className="cl-split">
          <section className="panel glass cl-about" aria-labelledby="cl-about">
            <p className="panel-title" id="cl-about">
              {t("About {club}", { club: name })}
            </p>
            {about.length ? (
              about.map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <p className="muted">{t("No club history is available yet.")}</p>
            )}
            {about.length > 0 && <p className="subtle cl-foot">{t("Source: TheSportsDB")}</p>}
          </section>
          {derbiesOf(teamId).length > 0 && (
            <section className="panel glass" aria-labelledby="cl-rivals">
              <p className="panel-title" id="cl-rivals">
                {t("Rivalries")}
              </p>
              <div className="cl-rivals">
                {derbiesOf(teamId).map((d) => (
                  <Link key={d.name} to={rivalryHref(d.league, teamId, d.a === teamId ? d.b : d.a)} className="chip text-only">
                    {t(d.name)}
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="panel glass" aria-labelledby="cl-facts">
            <p className="panel-title" id="cl-facts">
              {t("Club facts")}
            </p>
            {facts.length ? (
              <dl className="cl-facts">
                {facts.map((f) => (
                  <div key={f.k}>
                    <dt>{f.k}</dt>
                    <dd>{f.v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">{t("No verified details yet.")}</p>
            )}
          </section>
        </div>
      ) : (
        <Empty icon={<IconInfo />} title={t("No club profile yet")}>
          {t("We couldn’t find a verified profile for {club}.", { club: name })}
        </Empty>
      )}

      {stadium && (
        <Link to={`/stadium/${league}/${teamId}`} className="cl-stadium-card" aria-label={t("Explore {stadium}", { stadium })}>
          {info?.stadiumPhoto ? (
            <img src={tsdbSize(info.stadiumPhoto, "medium") ?? info.stadiumPhoto} alt="" loading="lazy" />
          ) : (
            <span className="cl-stadium-fallback" aria-hidden="true">
              <IconStadium />
            </span>
          )}
          <span className="shade" aria-hidden="true" />
          <span className="body">
            <span className="eyebrow">{t("Home ground")}</span>
            <b>{stadium}</b>
            <span className="meta">
              {Number.isFinite(capacity) && capacity > 0 && <span>{t("{n} seats", { n: fmtNum(capacity) })}</span>}
              {info?.location && (
                <span>
                  <IconPin width={13} height={13} />
                  {info.location}
                </span>
              )}
            </span>
          </span>
          <span className="go" aria-hidden="true">
            {t("Explore")}
            <IconChevronRight width={16} height={16} />
          </span>
        </Link>
      )}

      <Kits info={info} name={name} />
    </div>
  );
}

/* --------------------------------------------------------------- kits --- */

function kitLabel(type: string): string {
  const s = type.trim().toLowerCase();
  if (s === "1st" || s === "home") return t("Home");
  if (s === "2nd" || s === "away") return t("Away");
  if (s === "3rd" || s === "third") return t("Third");
  if (s === "4th" || s === "fourth") return t("Fourth");
  if (/goal|gk/.test(s)) return t("Goalkeeper");
  return type || t("Kit");
}
const KIT_ORDER = (type: string) => {
  const s = type.trim().toLowerCase();
  return s === "1st" || s === "home" ? 0 : s === "2nd" || s === "away" ? 1 : s === "3rd" || s === "third" ? 2 : 3;
};

function Kits({ info, name }: { info: TeamInfo | null; name: string }) {
  const seasons = useMemo(() => {
    const list = (info?.kits ?? []).filter((k) => k && typeof k.image === "string" && /^https:\/\//.test(k.image));
    const map = new Map<string, { type: string; image: string }[]>();
    for (const k of list) {
      const key = (k.season || "").trim() || "—";
      map.set(key, [...(map.get(key) ?? []), { type: k.type ?? "", image: k.image }]);
    }
    const out = [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([season, kits]) => ({ season, kits: kits.sort((a, b) => KIT_ORDER(a.type) - KIT_ORDER(b.type)) }));
    const latest = info?.jersey && /^https:\/\//.test(info.jersey) && !list.some((k) => k.image === info.jersey) ? info.jersey : null;
    if (latest) out.unshift({ season: "", kits: [{ type: "latest", image: latest }] });
    return out;
  }, [info]);
  if (!seasons.length) return null;
  return (
    <section aria-labelledby="cl-kits">
      <SectionHead id="cl-kits" title={t("Kits")} aside={<IconShirt width={20} height={20} className="subtle" />} />
      <div className="cl-shelf glass">
        {seasons.map((s) => (
          <div className="cl-shelf-season" key={s.season || "latest"}>
            <p className="panel-title">{s.season === "—" ? t("Other kits") : s.season ? t("{season} season", { season: s.season }) : t("Latest")}</p>
            <ul className="cl-kits">
              {s.kits.map((k) => (
                <Kit key={k.image} image={k.image} label={k.type === "latest" ? t("Current shirt") : kitLabel(k.type)} club={name} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Kit({ image, label, club }: { image: string; label: string; club: string }) {
  // Try the resized variant first, then the original, then drop the tile.
  const candidates = [...new Set([tsdbSize(image, "small") ?? image, image])];
  const [i, setI] = useState(0);
  if (i >= candidates.length) return null;
  const src = candidates[i];
  return (
    <li className="cl-kit">
      <span className="stage">
        <img src={src} alt={t("{club} {kit} kit", { club, kit: label })} loading="lazy" onError={() => setI((n) => n + 1)} />
        <img src={src} alt="" aria-hidden="true" className="reflect" loading="lazy" />
      </span>
      <span className="lbl">{label}</span>
    </li>
  );
}
